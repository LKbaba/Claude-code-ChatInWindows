/**
 * Transcript Tail Service
 *
 * Tails a Claude CLI transcript JSONL file (`~/.claude/projects/{slug}/{id}.jsonl`),
 * incrementally reading appended lines (`tail -f` semantics), parsing each line as
 * a JSON object, de-duplicating by `uuid`, and forwarding lines to a callback.
 *
 * It also detects the end-of-turn signal (completion detection "B1"):
 *   an `assistant` line whose `message.stop_reason` is a terminal reason
 *   (`end_turn` / `stop_sequence` / `max_tokens`). `tool_use` and `null` are NOT
 *   terminal — they are mid-turn (tool call / intermediate content block).
 *
 * Verified transcript facts (real on-disk schema, 2026-06-13):
 *   - Each content block is its own line with a unique `uuid`; a single assistant
 *     message (same `message.id`) is split across several lines (thinking / text /
 *     tool_use). Only the final block of a message carries a non-null stop_reason.
 *   - Non-content lines (`queue-operation`, `last-prompt`) may lack `uuid`.
 *   - There is NO `result` line and NO `init` line in transcripts.
 *
 * Subagent sidechain tailing (v5.0.6):
 *   Newer Claude Code (2.1.x) writes a subagent's (Agent/Task tool) internal
 *   steps NOT into the main transcript but into a sibling directory
 *   `{slug}/{sessionId}/subagents/agent-{id}.jsonl` (every line `isSidechain:true`).
 *   The main transcript only keeps the parent `Agent` tool_use and the subagent's
 *   final tool_result, so those intermediate steps disappeared from the UI in v5.
 *   To restore the old (v4 `-p`) flattened visibility, we also tail every
 *   `agent-*.jsonl` under that subagents dir and forward its lines through the
 *   same `onLine` callback — but we NEVER run turn-completion detection on them
 *   (a subagent's own `end_turn` must not end the parent turn). Downstream
 *   (MessageProcessor) renders these lines but skips token/cost accounting,
 *   keyed off `isSidechain`.
 *
 * This service ONLY reads files. It never touches the PTY/stdout.
 */

import * as fs from 'fs';
import * as path from 'path';
import { debugLog, debugError } from './DebugLogger';

export interface TranscriptCallbacks {
    /** Emitted once per new (de-duplicated) transcript line, in file order. */
    onLine: (json: any) => void;
    /** Emitted after the terminal assistant line of a turn (the line is sent via onLine first). */
    onTurnComplete: (meta: { stopReason: string }) => void;
    /** Emitted on unrecoverable watcher/read errors (parse errors are skipped, not surfaced here). */
    onError: (err: unknown) => void;
}

export interface TailOptions {
    /** Byte offset to start tailing from (e.g. file size, to skip existing history). Default 0. */
    fromOffset?: number;
    /** Polling fallback interval in ms (fs.watch misses events on Windows). Default 250. */
    pollIntervalMs?: number;
}

/** Terminal stop_reasons that mark the end of a turn (vs. mid-turn tool_use / null). */
const TERMINAL_STOP_REASONS = new Set(['end_turn', 'stop_sequence', 'max_tokens']);

export class TranscriptTailService {
    private _filePath: string | undefined;
    private _offset = 0;
    private _lineBuffer = '';
    private _seenUuids = new Set<string>();

    private _watcher: fs.FSWatcher | undefined;
    private _polling = false;          // whether fs.watchFile is active
    private _pollIntervalMs = 250;

    // Re-entrancy guard: change events can overlap; serialize incremental reads.
    private _reading = false;
    private _pendingRead = false;

    // Subagent sidechain tailing: poll the `{sessionId}/subagents/` dir (created
    // lazily only when a subagent first runs), tailing each `agent-*.jsonl`.
    private _subagentDir: string | undefined;
    private _subagentTimer: ReturnType<typeof setInterval> | undefined;
    private _subagentFiles = new Map<string, { offset: number; buffer: string }>();
    private _subagentReading = false;

    constructor(private _callbacks: TranscriptCallbacks) {}

    /**
     * Begin tailing `filePath`. Performs an immediate read to catch content that
     * was written before the watcher attached, then watches for further appends.
     */
    public start(filePath: string, opts: TailOptions = {}): void {
        this.stop(); // ensure a clean slate if re-used

        this._filePath = filePath;
        this._offset = opts.fromOffset ?? 0;
        this._lineBuffer = '';
        this._seenUuids.clear();
        this._pollIntervalMs = opts.pollIntervalMs ?? 250;

        debugLog('TranscriptTailService', 'start', { filePath, fromOffset: this._offset });

        // Immediate catch-up read (file may already have content).
        this._scheduleRead();

        // Primary watcher (event-driven).
        try {
            this._watcher = fs.watch(filePath, () => this._scheduleRead());
            this._watcher.on('error', (err) => {
                // Watcher errors are non-fatal; polling fallback keeps us going.
                debugError('TranscriptTailService', 'fs.watch error (falling back to polling)', err);
            });
        } catch (err) {
            debugError('TranscriptTailService', 'fs.watch failed (using polling only)', err);
        }

        // Polling fallback — fs.watch is unreliable on Windows / network drives.
        fs.watchFile(filePath, { interval: this._pollIntervalMs }, () => this._scheduleRead());
        this._polling = true;

        // Subagent sidechain tail: derive `{slug}/{sessionId}/subagents/` and
        // poll it (the dir does not exist until a subagent first runs). On a
        // resume (fromOffset > 0) seed existing files to their current size so we
        // skip historical subagent steps and only show the live turn's.
        this._subagentDir = this._computeSubagentDir(filePath);
        this._subagentFiles.clear();
        if (this._offset > 0) {
            this._seedSubagentOffsets();
        }
        this._subagentTimer = setInterval(() => this._scanSubagents(), this._pollIntervalMs);
        // Immediate first scan (subagents may already exist on resume).
        this._scanSubagents();
    }

    /**
     * Switch to a different session file (resume / new-session scenarios).
     * Resets all tail state.
     */
    public switchFile(newPath: string, opts: TailOptions = {}): void {
        debugLog('TranscriptTailService', 'switchFile', { from: this._filePath, to: newPath });
        this.start(newPath, opts);
    }

    /** Stop watching and clear buffers. Safe to call repeatedly. */
    public stop(): void {
        if (this._watcher) {
            try { this._watcher.close(); } catch { /* already closed */ }
            this._watcher = undefined;
        }
        if (this._polling && this._filePath) {
            try { fs.unwatchFile(this._filePath); } catch { /* ignore */ }
        }
        this._polling = false;
        this._lineBuffer = '';
        this._reading = false;
        this._pendingRead = false;

        if (this._subagentTimer) {
            clearInterval(this._subagentTimer);
            this._subagentTimer = undefined;
        }
        this._subagentFiles.clear();
        this._subagentReading = false;
    }

    /**
     * Serialize reads: if a read is already in flight, remember that another is
     * needed and run it once the current one finishes.
     */
    private _scheduleRead(): void {
        if (this._reading) {
            this._pendingRead = true;
            return;
        }
        this._reading = true;
        try {
            this._readIncrement();
        } finally {
            this._reading = false;
            if (this._pendingRead) {
                this._pendingRead = false;
                this._scheduleRead();
            }
        }
    }

    /** Read everything appended since the last offset and process complete lines. */
    private _readIncrement(): void {
        const filePath = this._filePath;
        if (!filePath) {
            return;
        }

        let stat: fs.Stats;
        try {
            stat = fs.statSync(filePath);
        } catch (err) {
            // File may not exist yet right after a switch; ignore, polling will retry.
            return;
        }

        // File shrank (truncated / rotated) -> restart from the beginning.
        if (stat.size < this._offset) {
            debugLog('TranscriptTailService', 'file truncated, resetting offset', { size: stat.size, offset: this._offset });
            this._offset = 0;
            this._lineBuffer = '';
        }

        if (stat.size === this._offset) {
            return; // nothing new
        }

        let chunk: string;
        try {
            const length = stat.size - this._offset;
            const buf = Buffer.alloc(length);
            const fd = fs.openSync(filePath, 'r');
            try {
                fs.readSync(fd, buf, 0, length, this._offset);
            } finally {
                fs.closeSync(fd);
            }
            this._offset = stat.size;
            chunk = buf.toString('utf8');
        } catch (err) {
            this._callbacks.onError(err);
            return;
        }

        this._lineBuffer += chunk;
        const lines = this._lineBuffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer.
        this._lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
            this._processLine(line);
        }
    }

    /** Parse, de-duplicate, forward a single complete line, and detect turn completion. */
    private _processLine(rawLine: string): void {
        const line = rawLine.trim();
        if (!line) {
            return;
        }

        let json: any;
        try {
            json = JSON.parse(line);
        } catch (err) {
            // Defensive: skip malformed/partial lines (schema must not crash us).
            debugLog('TranscriptTailService', 'skipping unparseable line', { preview: line.slice(0, 120) });
            return;
        }

        // De-duplicate by uuid; lines without a uuid pass through unconditionally.
        const uuid: string | undefined = typeof json.uuid === 'string' ? json.uuid : undefined;
        if (uuid) {
            if (this._seenUuids.has(uuid)) {
                return;
            }
            this._seenUuids.add(uuid);
        }

        // Forward the line first so the UI renders the final content...
        this._callbacks.onLine(json);

        // ...then, if this is a terminal assistant line, signal turn completion.
        const stopReason: unknown = json?.message?.stop_reason;
        if (json?.type === 'assistant' && typeof stopReason === 'string' && TERMINAL_STOP_REASONS.has(stopReason)) {
            debugLog('TranscriptTailService', 'turn complete', { stopReason });
            this._callbacks.onTurnComplete({ stopReason });
        }
    }

    // -----------------------------------------------------------------------
    // Subagent sidechain tailing
    // -----------------------------------------------------------------------

    /** `{dir}/{sessionId}/subagents` derived from the main transcript path. */
    private _computeSubagentDir(mainFilePath: string): string {
        const dir = path.dirname(mainFilePath);
        const sessionId = path.basename(mainFilePath, '.jsonl');
        return path.join(dir, sessionId, 'subagents');
    }

    /**
     * Resume case: register every existing `agent-*.jsonl` at its current size so
     * we skip the historical subagent steps and only forward content appended
     * during the live session.
     */
    private _seedSubagentOffsets(): void {
        const dir = this._subagentDir;
        if (!dir) {
            return;
        }
        let entries: string[];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            return; // dir not created yet — nothing to seed
        }
        for (const name of entries) {
            if (!this._isAgentFile(name)) {
                continue;
            }
            const full = path.join(dir, name);
            try {
                const size = fs.statSync(full).size;
                this._subagentFiles.set(full, { offset: size, buffer: '' });
            } catch {
                /* race: file vanished, ignore */
            }
        }
    }

    /** Poll the subagents dir, tailing any new/appended `agent-*.jsonl`. */
    private _scanSubagents(): void {
        const dir = this._subagentDir;
        if (!dir || this._subagentReading) {
            return;
        }
        this._subagentReading = true;
        try {
            let entries: string[];
            try {
                entries = fs.readdirSync(dir);
            } catch {
                return; // dir doesn't exist yet (no subagent has run)
            }
            for (const name of entries) {
                if (!this._isAgentFile(name)) {
                    continue;
                }
                const full = path.join(dir, name);
                let state = this._subagentFiles.get(full);
                if (!state) {
                    // Newly discovered subagent file -> read from the beginning.
                    state = { offset: 0, buffer: '' };
                    this._subagentFiles.set(full, state);
                    debugLog('TranscriptTailService', 'subagent file discovered', { file: full });
                }
                this._readSubagentIncrement(full, state);
            }
        } finally {
            this._subagentReading = false;
        }
    }

    private _isAgentFile(name: string): boolean {
        return name.startsWith('agent-') && name.endsWith('.jsonl');
    }

    /** Read everything appended to one subagent file and forward complete lines. */
    private _readSubagentIncrement(filePath: string, state: { offset: number; buffer: string }): void {
        let stat: fs.Stats;
        try {
            stat = fs.statSync(filePath);
        } catch {
            return; // vanished mid-scan
        }

        if (stat.size < state.offset) {
            // truncated/rotated -> restart this file
            state.offset = 0;
            state.buffer = '';
        }
        if (stat.size === state.offset) {
            return; // nothing new
        }

        let chunk: string;
        try {
            const length = stat.size - state.offset;
            const buf = Buffer.alloc(length);
            const fd = fs.openSync(filePath, 'r');
            try {
                fs.readSync(fd, buf, 0, length, state.offset);
            } finally {
                fs.closeSync(fd);
            }
            state.offset = stat.size;
            chunk = buf.toString('utf8');
        } catch (err) {
            this._callbacks.onError(err);
            return;
        }

        state.buffer += chunk;
        const lines = state.buffer.split('\n');
        state.buffer = lines.pop() ?? '';
        for (const line of lines) {
            this._processSubagentLine(line);
        }
    }

    /**
     * Parse, de-duplicate (shared `_seenUuids`), and forward a subagent line.
     * Unlike `_processLine`, this NEVER triggers turn completion — a subagent's
     * own terminal `end_turn` must not end the parent turn.
     */
    private _processSubagentLine(rawLine: string): void {
        const line = rawLine.trim();
        if (!line) {
            return;
        }

        let json: any;
        try {
            json = JSON.parse(line);
        } catch {
            debugLog('TranscriptTailService', 'skipping unparseable subagent line', { preview: line.slice(0, 120) });
            return;
        }

        const uuid: string | undefined = typeof json.uuid === 'string' ? json.uuid : undefined;
        if (uuid) {
            if (this._seenUuids.has(uuid)) {
                return;
            }
            this._seenUuids.add(uuid);
        }

        // Forward for rendering. Defensive: guarantee the sidechain flag so
        // downstream token/cost accounting skips it even if a line lacks it.
        if (json && typeof json === 'object' && json.isSidechain !== true) {
            json.isSidechain = true;
        }
        this._callbacks.onLine(json);
    }
}
