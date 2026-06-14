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
 * This service ONLY reads files. It never touches the PTY/stdout.
 */

import * as fs from 'fs';
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
}
