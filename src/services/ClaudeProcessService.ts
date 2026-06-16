/**
 * Claude Process Service
 *
 * v5.0.1: Drives an INTERACTIVE `claude` CLI through a node-pty pseudo-terminal
 * (no `-p`, no stream-json) so usage is billed against the user's subscription.
 *
 * Architecture:
 *   - A single PTY session is long-lived and reused across multiple turns.
 *     The first message spawns the session; subsequent messages are injected
 *     into the same PTY (bracketed paste + Enter).
 *   - Answer content comes from the Claude transcript JSONL (TranscriptTailService),
 *     NOT from the PTY's raw stdout. PTY stdout (TUI ANSI) is used only for
 *     session-readiness detection and debugging.
 *   - Turn completion is signalled by the transcript (`stop_reason === "end_turn"`,
 *     B1) via `onTurnComplete`. `onClose` now means the whole PTY session exited.
 *
 * Windows note: the claude executable is spawned directly (node-pty wraps a
 * `.cmd` in cmd.exe automatically, so an npm-installed claude.cmd runs fine).
 * The winpty backend is forced (useConpty:false) because ConPTY deadlocks when
 * spawned from the VS Code extension host. On first launch claude may show a
 * blocking dialog (workspace-trust, default "Yes"; or bypass-permissions, default
 * "No, exit"); the session answers it event-driven the moment it paints, before
 * injecting the first message (see _handleStartupGate).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as pty from 'node-pty';
import { WindowsCompatibility, ExecutionEnvironment } from '../managers/WindowsCompatibility';
import { ConfigurationManagerFacade } from '../managers/config/ConfigurationManagerFacade';
import { ConversationManager } from '../managers/ConversationManager';
import { VALID_MODELS, ValidModel, MODELS_SUPPORTING_1M } from '../utils/constants';
import { getMcpSystemPrompts } from '../utils/mcpPrompts';
import { debugLog, debugError } from './DebugLogger';
import { SecretService } from './SecretService';
import { TranscriptTailService } from './TranscriptTailService';
import { findLatestSessionFile, resolveSessionFile } from './TranscriptLocator';
import { StopHookFallbackService } from './StopHookFallbackService';

export interface ProcessOptions {
    message: string;
    cwd: string;
    sessionId?: string;
    model: string;
    windowsEnvironmentInfo?: string;
    customInstructions?: string;
    resumeFrom?: string;
    imagesInMessage?: string[];
    // Resume a session's PTY WITHOUT injecting an initial prompt. Used to bring a
    // restored/loaded conversation back to a live TUI so a slash command (e.g.
    // /compact) can be injected. Requires sessionId/resumeFrom.
    skipInitialMessage?: boolean;
    // Note: planMode and thinkingMode are handled through message prefixes
}

export interface ProcessCallbacks {
    onData: (data: any) => void;
    onError: (error: string) => void;
    /** Fired when the whole PTY session exits (VS Code close / endSession), NOT per-turn. */
    onClose: (code: number | null) => void;
    /** v5.0.1: fired when a single turn finishes (transcript end_turn, B1). */
    onTurnComplete?: (meta: { stopReason: string; sessionId?: string }) => void;
}

/** Valid Claude interactive permission modes (decision C). */
const PERMISSION_MODES = ['bypassPermissions', 'auto', 'acceptEdits', 'plan', 'default'];

// v14 Interactive Options (Architecture A+).
//
// The native AskUserQuestion tool is unusable from the webview: under the v5 PTY
// driver it renders a BLOCKING arrow-key menu inside the claude TUI that the
// webview (which only tails the transcript JSONL) can neither display nor drive,
// so the user is stuck on "processing" until they hit Stop. Instead we remove the
// tool with --disallowedTools and instruct the model (via --append-system-prompt)
// to emit the SAME schema as a fenced ```ask JSON block, then stop. The webview
// parses that block and renders clickable cards; the chosen label is injected
// back as the next user message.
//
// Probe-validated (scripts/verify-askq-options*.js, 2026-06-14, claude 2.1.85):
//   - the model reliably emits a parseable ```ask block (single/multi-select,
//     multi-question) and does NOT barrel ahead;
//   - that turn ends cleanly with stop_reason === "end_turn" (7/7 runs), so the
//     existing B1 completion detection already unlocks the UI -- NO out-of-band
//     turn boundary is required;
//   - --disallowedTools AskUserQuestion truly removes the tool (no native
//     tool_use, no "Answer questions?" error).
const ASK_OPTIONS_DISALLOWED_TOOL = 'AskUserQuestion';
// Mirrors the schema of the native AskUserQuestion tool so the model (which knows
// it intimately) emits well-formed JSON. Wording is intentionally NEUTRAL: it
// frames the ```ask block as THE way to ask questions in this environment and
// never mentions that any tool was disabled, so the model does not narrate the
// mechanism to the user or go meta about "missing tools" (see F5 UX finding).
// Kept as a single appended system-prompt fragment.
// Protocol wording is aligned with the native AskUserQuestion tool contract
// (reverse-engineered from leaked Claude Code prompts + the Agent SDK user-input
// docs; see specs/updatePRDv14.md section 7). Matching the native contract means
// (a) the model -- trained on that contract -- emits well-formed blocks more
// reliably, and (b) a future switch back to the native tool stays schema-
// compatible. A+ keeps the SAME schema; only the carrier differs (a fenced
// `ask` text block instead of a tool_use call).
const ASK_OPTIONS_PROTOCOL = [
    'ASKING THE USER QUESTIONS: In this environment, the way to ask the user a',
    'question or offer a choice is to output a fenced code block tagged `ask`.',
    'Use this ONLY when you are blocked on a decision that is genuinely the',
    "user's to make -- one you cannot resolve from the request, the code, or",
    'sensible defaults. Do NOT use it for chit-chat or for decisions you should',
    'make yourself. When blocked this way, do NOT guess and do NOT proceed.',
    'Output a fenced code block tagged `ask` whose body is ONLY minified JSON:',
    '{"questions":[{"question":"...","header":"short","options":[{"label":"...","description":"..."}],"multiSelect":false}]}',
    'Constraints: 1-4 questions; each question has 2-4 options; "header" is a very',
    'short chip label (<=12 chars); each "label" is concise (1-5 words) and its',
    '"description" explains the trade-off. Every question must include "multiSelect".',
    'The client renders this block as clickable option cards, so present your',
    'choices ONLY through the block -- do not also restate them as a plain list.',
    'Set multiSelect:true when several options may be chosen together. You may include',
    'multiple entries in "questions" when you need to ask about more than one thing.',
    'If you recommend a specific option, make it the FIRST option and append',
    '" (Recommended)" to its label. Then STOP and end your turn, waiting for the',
    'user reply; do not write code or call any tool until the user has answered.',
    'Never describe this mechanism to the user or discuss which tools are available;',
    'just ask naturally using the block.',
].join(' ');

export class ClaudeProcessService {
    // The long-lived interactive PTY session (undefined => no session alive).
    private _pty: pty.IPty | undefined;
    // Tails the session's transcript JSONL; routes lines to the current callbacks.
    private _tail: TranscriptTailService | undefined;
    // Refreshed on every startProcess() call (the provider builds new callbacks per turn).
    private _callbacks: ProcessCallbacks | undefined;
    // Absolute path of the transcript file currently being tailed.
    private _currentTranscriptFile: string | undefined;
    // Optional Stop-hook-based completion fallback (B2). Off unless opted in.
    private _stopHookFallback = new StopHookFallbackService();

    // Lifecycle flags.
    private _isStarting = false;          // guards concurrent startProcess() (first spawn)
    private _turnInProgress = false;      // a generation is in flight (injected, not yet end_turn)
    private _sessionReady = false;        // PTY TUI has settled and accepts input

    // Readiness detection (silence-window heuristic on PTY stdout).
    private _readyTimer: NodeJS.Timeout | undefined;
    private _readyResolve: (() => void) | undefined;
    // When the current PTY session was spawned (drives READY_MIN_MS floor).
    private _spawnTs = 0;

    // Subsequent-turn reinject watchdog timer: re-sends a dropped paste when the
    // transcript fails to grow after injection. undefined => not armed.
    private _reinjectTimer: NodeJS.Timeout | undefined;

    // B3 (PTY-idle completion fallback) state. claude does NOT always write the
    // turn's final assistant line with stop_reason=end_turn: responses that
    // contain a thinking block (and some large-context first turns) are
    // finalized with stop_reason=null, so B1 (TranscriptTailService end_turn
    // detection) never fires and the UI hangs forever. The robust idle signal is
    // the TUI's spinner stopping: while generating, claude repaints the spinner
    // every few hundred ms (continuous PTY output); when the turn truly ends the
    // PTY goes quiet. We complete the turn after IDLE_SILENCE_MS of PTY silence,
    // but ONLY once an assistant line has appeared this turn (the gate below) so
    // the pre-generation quiet gap (MCP startup / reinject wait) cannot
    // false-complete. Deduped against B1/B2 via the shared _completeTurn guard.
    private _idleTimer: NodeJS.Timeout | undefined;
    // True once the transcript has produced an assistant line for the current
    // turn -> generation has actually started, so PTY silence now means "done".
    private _assistantSeenThisTurn = false;
    // True once a real user/assistant transcript line appears for the current
    // turn, i.e. claude actually accepted the injected prompt. file-history-
    // snapshot lines do NOT set this, so they cannot fool the reinject watchdog
    // into thinking a dropped prompt was accepted.
    private _promptAcceptedThisTurn = false;

    // Guards against two slash commands typing into the PTY at the same time.
    // injectSlashCommand types char-by-char with delays; if a second call starts
    // before the first finishes, their keystrokes interleave into garbage
    // (observed: "//mmooddeell..." when /model was injected twice). True while a
    // command is mid-injection.
    private _slashInjecting = false;

    // Throttled PTY raw-stream debug logging (avoid flooding on TUI repaints).
    private _ptyLogLastTs = 0;
    private _ptyLogBytes = 0;

    // Accumulated pre-ready PTY output, used to detect startup gating dialogs
    // (e.g. the workspace-trust / bypass-permissions confirmation). Capped to the
    // most recent bytes.
    private _startupBuffer = '';
    // Event-driven startup-gate guard. A fresh launch can show TWO blocking
    // dialogs in sequence (workspace-trust, THEN bypass-permissions), and the
    // second one can paint AFTER silence-readiness fires. They are tracked
    // independently so each is answered exactly once, the instant it paints, so
    // the prompt's own Enter never lands on an unanswered dialog (which on a
    // fresh machine makes claude exit code 1 — the first prompt is silently lost
    // and the session keeps re-spawning). Set true per type after we answer so
    // repaints don't re-trigger. Scanning continues for STARTUP_GATE_WINDOW_MS
    // post-spawn (see _startupGateDeadline) to catch a late-painting 2nd gate.
    private _trustGateHandled = false;
    private _bypassGateHandled = false;
    private _startupGateDeadline = 0;

    // Input-box readiness: a POSITIVE signal that the TUI input box can actually
    // accept keystrokes, detected from its footer marker ("shift+tab to cycle" /
    // "? for shortcuts"). The silence heuristic only proves output went quiet,
    // which on a cold --resume can happen ~15s BEFORE the input box paints; a
    // slash command typed into that gap is silently eaten. Slash-command
    // injection (/compact, /model) gates on this flag instead.
    private _inputBoxReady = false;
    private _inputBoxReadyResolvers: Array<(ready: boolean) => void> = [];
    // Rolling buffer for footer-marker scanning; kept separate from
    // _startupBuffer because the marker can paint AFTER silence-readiness fires
    // (so we must keep scanning post-ready), and capped to recent bytes.
    private _markerBuffer = '';

    // Rolling buffer for image-chip scanning. The interactive TUI converts a
    // bare absolute image path (pasted ALONE) into an "[Image #N]" attachment
    // chip; staged image injection waits for that chip before pasting the next
    // path / the message text. Reset at the start of each staged injection so a
    // prior turn's chip cannot false-trigger. Capped to recent bytes.
    private _chipScanBuffer = '';
    // Staged-injection idempotency guards. The first-turn (_discoverWithReinject)
    // and subsequent-turn (_beginSubsequentTurn) reinject watchdogs both re-call
    // _beginTurn when the transcript does not grow. For a staged image turn that
    // would otherwise stack duplicate chips, so:
    //  - _stagedInjectInProgress: a staged injection is mid-flight -> ignore any
    //    re-entrant _beginTurn (do not start a second one).
    //  - _stagedArmed: images mounted + text pasted, the input box only needs its
    //    submitting Enter -> a watchdog re-call re-sends Enter ONLY (never re-stages).
    private _stagedInjectInProgress = false;
    private _stagedArmed = false;

    // Runtime self-edit permission gate (post-ready). Editing a file UNDER a
    // `.claude/` dir (skills/hooks/settings) makes claude paint a blocking
    // confirmation menu ("Do you want to make this edit to X? / 1. Yes / 2. Yes,
    // and allow Claude to edit its own settings for this session / 3. No") that
    // `bypassPermissions` does NOT auto-answer (self-modification is treated as
    // code injection). The PTY driver cannot answer it, so the turn hangs (~69s,
    // until the next user message's Enter accidentally accepts it). We detect the
    // menu and auto-select option 2 (session-wide grant) so subsequent `.claude`
    // edits in the same session never re-gate. _permGateAnswering debounces the
    // many repaints of one menu (cleared after the menu has had time to dismiss).
    private _permGateBuffer = '';
    private _permGateAnswering = false;

    private static readonly READY_SILENCE_MS = 400;   // quiet window => TUI ready
    // Floor before a silence window may resolve "ready". claude prints a short
    // preamble (cmd.exe title + node warnings) then pauses >400ms loading its
    // ~13MB bundle; that startup gap is NOT the input box. Injecting into it
    // gets the prompt silently eaten (and the bypass dialog hasn't painted yet,
    // so the gate detector would miss it). The real input box renders ~2s in.
    private static readonly READY_MIN_MS = 1800;
    private static readonly READY_HARD_CAP_MS = 8000; // resolve anyway after this
    private static readonly DISCOVER_TIMEOUT_MS = 12000; // total budget to land the first prompt
    private static readonly DISCOVER_POLL_MS = 200;
    // Re-inject the prompt this often while waiting for the transcript to appear.
    // claude silently DROPS a paste sent before its input box is interactive
    // (e.g. MCP servers still loading after the TUI first paints), and the
    // transcript is created only once a prompt is actually accepted -> its
    // absence means the prompt was eaten, so we re-send. Dropped pastes are not
    // buffered (verified: the transcript shows the prompt exactly once after
    // several re-injects), so repeating injection cannot duplicate the message.
    private static readonly REINJECT_INTERVAL_MS = 3500;
    // B3: PTY silence window that means the spinner stopped => the turn ended.
    // claude's spinner is animated client-side on a timer and repaints every
    // ~150-400ms throughout generation (including thinking and tool execution),
    // so output never goes quiet this long mid-turn; sustained silence is a
    // reliable end-of-generation signal. Generous margin over the repaint cadence
    // to avoid completing on a transient stall.
    private static readonly IDLE_SILENCE_MS = 1500;
    private static readonly PTY_LOG_THROTTLE_MS = 300; // min gap between raw-stream log lines
    private static readonly PTY_LOG_PREVIEW_CHARS = 160; // truncate raw-stream preview
    private static readonly STARTUP_BUFFER_CAP = 16000; // retained pre-ready bytes for gate detection
    private static readonly STARTUP_GATE_NAV_DELAY_MS = 200; // pause between Down and Enter when accepting the gate
    private static readonly STARTUP_GATE_WINDOW_MS = 25000; // keep scanning for startup gates this long after spawn (a 2nd gate can paint post-readiness)
    private static readonly SELF_EDIT_GATE_DEBOUNCE_MS = 2500; // ignore self-edit-menu repaints after answering, until it dismisses
    // Delay between writing a bracketed-paste block and the submitting Enter.
    // claude's TUI shows a transient "Pasting" state; an Enter sent in the same
    // tick is swallowed and the prompt never submits (no turn, no response). A
    // short settle window lets the paste commit first. Validated against the
    // native claude.exe by scripts/verify-claude-trust-paste.js.
    private static readonly PASTE_SUBMIT_DELAY_MS = 250;
    // Subsequent-turn reinject watchdog: max re-sends before giving up. The first
    // turn uses _discoverWithReinject instead; this covers turns 2+, where a paste
    // can still be silently dropped if the input box is briefly busy (heavy MCP
    // activity, or a new turn submitted right after the previous turn's very early
    // transcript flush).
    private static readonly REINJECT_MAX_RETRIES = 3;

    // Slash-command injection (e.g. `/compact`). Unlike user prompts, slash
    // commands are TYPED char-by-char (not bracketed-paste) so the TUI's
    // slash-command menu recognizes and arms the command; a per-char gap lets
    // the menu filter, and a longer settle window precedes the submitting Enter.
    // Validated against the native claude.exe by scripts/verify-claude-precompact.js.
    private static readonly SLASH_CHAR_DELAY_MS = 60;
    private static readonly SLASH_SUBMIT_DELAY_MS = 1000;
    // Staged image injection: after pasting a bare image path ALONE, the TUI
    // takes a beat to render it as an "[Image #N]" attachment chip. Wait up to
    // IMAGE_CHIP_TIMEOUT_MS per image (polling every IMAGE_CHIP_POLL_MS) for that
    // chip; on timeout we degrade to inlining the path for a Read (Task 4). The
    // ready-gate timeout bounds how long we wait for the input box before staging.
    // Validated by scripts/verify-image-staged.js / verify-image-staged-edge.js.
    private static readonly IMAGE_CHIP_TIMEOUT_MS = 2500;
    private static readonly IMAGE_CHIP_POLL_MS = 100;
    private static readonly IMAGE_CHIP_READY_TIMEOUT_MS = 8000;
    // Max time injectSlashCommand waits for the input-box footer marker before
    // typing. A cold --resume (e.g. /compact on a freshly loaded conversation)
    // can take ~15-20s to paint the input box; an alive idle session resolves
    // instantly (marker was already seen at startup). Bounded so we never block
    // forever — on timeout we type anyway (best-effort, better than nothing).
    private static readonly SLASH_READY_TIMEOUT_MS = 120_000;

    // Strips ANSI/OSC/control sequences from a terminal stream.
    private static readonly ANSI_PATTERN = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[PX^_].*?\x1b\\|[@-_])/g;

    constructor(
        private _windowsCompatibility: WindowsCompatibility,
        private _configurationManager: ConfigurationManagerFacade,
        private _conversationManager: ConversationManager
    ) {}

    /** True while a PTY session is alive (session-alive, not turn-in-progress). */
    public isProcessRunning(): boolean {
        return this._pty !== undefined;
    }

    /** True while a generation is in flight (between injection and end_turn). */
    public isTurnInProgress(): boolean {
        return this._turnInProgress;
    }

    /**
     * Complete the current turn in response to an ```ask block. An ask block is
     * a turn boundary (the model emits it and stops for input), but when it
     * follows a tool call in the same turn its transcript line carries
     * stop_reason=null — so neither B1 (end_turn) nor B2 (stop hook) fires.
     * Without this the turn guard stays stuck true and the user's answer is
     * rejected as "still processing". Routed through the shared _completeTurn so
     * the B1/B2 dedup guard still applies (no double completion).
     */
    public completeTurnFromAsk(): void {
        this._completeTurn('ask_block', this._currentSessionId());
    }

    /**
     * Type a slash command (e.g. `/compact`) into the live PTY and submit it.
     * Used for native compaction (route B): the command runs server-side inside
     * the existing session — no new turn/session is started, so this does NOT
     * touch `_turnInProgress` or the reinject watchdog. If a turn is in flight
     * the TUI queues the command and runs it once idle.
     */
    public async injectSlashCommand(command: string): Promise<void> {
        if (!this._pty) {
            debugError('ClaudeProcessService', 'injectSlashCommand called with no live PTY', { command });
            return;
        }
        // Refuse to interleave with another in-flight slash injection: char-by-char
        // typing from two concurrent calls would mangle the input box (e.g.
        // "//mmooddeell..." when /model fired twice from a double UI event).
        if (this._slashInjecting) {
            debugError('ClaudeProcessService', 'Slash command already injecting; ignoring concurrent request', { command });
            return;
        }
        this._slashInjecting = true;
        try {
            // Gate on the input box actually being ready to accept keystrokes. After
            // a cold --resume the silence heuristic resolves "ready" well before the
            // input box paints, so typing immediately gets the command silently
            // eaten (the historical /compact-after-resume timeout). The footer marker
            // is the reliable positive signal; an alive idle session resolves at once.
            const ready = await this.waitForInputBoxReady(ClaudeProcessService.SLASH_READY_TIMEOUT_MS);
            if (!this._pty) {
                debugError('ClaudeProcessService', 'PTY exited while waiting for input-box readiness', { command });
                return;
            }
            if (!ready) {
                debugError('ClaudeProcessService', 'Input box not confirmed ready before slash command; typing anyway', { command });
            }
            debugLog('ClaudeProcessService', 'Injecting slash command', { command, inputBoxReady: ready });
            for (const ch of command) {
                this._pty.write(ch);
                await this._sleep(ClaudeProcessService.SLASH_CHAR_DELAY_MS);
            }
            // Settle, then submit. (Enter in the same tick is swallowed by the TUI.)
            await this._sleep(ClaudeProcessService.SLASH_SUBMIT_DELAY_MS);
            try {
                this._pty?.write('\r');
                debugLog('ClaudeProcessService', 'Submitted slash command (Enter sent after settle)');
            } catch (error) {
                debugError('ClaudeProcessService', 'Failed to submit slash command Enter', error);
            }
        } finally {
            this._slashInjecting = false;
        }
    }

    private _sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Resolves true once the TUI input box is ready to accept keystrokes (its
     * footer marker has painted), or false on timeout. Resolves immediately if
     * the marker was already seen (alive idle session). Used to gate slash
     * commands so they are not typed into a TUI that cannot yet receive them.
     */
    public waitForInputBoxReady(timeoutMs: number): Promise<boolean> {
        if (this._inputBoxReady) {
            return Promise.resolve(true);
        }
        if (!this._pty) {
            return Promise.resolve(false);
        }
        return new Promise<boolean>((resolve) => {
            let settled = false;
            const done = (val: boolean): void => {
                if (settled) { return; }
                settled = true;
                resolve(val);
            };
            this._inputBoxReadyResolvers.push((ready: boolean) => done(ready));
            setTimeout(() => done(false), timeoutMs);
        });
    }

    /**
     * Start (or reuse) the interactive PTY session and inject one user message.
     * If a session is already alive, the message is injected into it directly.
     */
    public async startProcess(options: ProcessOptions, callbacks: ProcessCallbacks): Promise<void> {
        // Always refresh callbacks: the provider creates a fresh callbacks object per turn.
        this._callbacks = callbacks;

        // Session already alive -> this is a subsequent turn, inject + watchdog.
        if (this._pty) {
            this._beginSubsequentTurn(options);
            return;
        }

        if (this._isStarting) {
            throw new Error('A Claude session is already starting');
        }
        this._isStarting = true;

        try {
            const { execEnvironment, args } = await this._prepareProcessExecution(options);
            if (!execEnvironment.claudeExecutablePath) {
                throw new Error('Claude executable path could not be determined');
            }

            // Snapshot transcript dir BEFORE launch so we can discover the new session file.
            const since = Date.now();

            // Spawn the interactive PTY session.
            this._spawnSession(execEnvironment, args, options.cwd);

            // Enable the optional Stop hook completion fallback (B2) for this session.
            this._enableStopHookFallback();

            // Wait for the TUI to settle before injecting the first message. Any
            // blocking startup dialog (workspace-trust or bypass-permissions) is
            // answered event-driven by _handleStartupGate the moment it paints,
            // so by the time readiness resolves the real input box is live.
            await this._waitForReady();

            // Resume case: the transcript file already exists -> tail only new appends.
            const sid = options.resumeFrom || options.sessionId;
            if (sid) {
                const file = resolveSessionFile(options.cwd, sid);
                let fromOffset = 0;
                try { fromOffset = fs.statSync(file).size; } catch { /* not yet on disk */ }
                this._startTail(file, fromOffset);
            }

            // Resume-only mode (e.g. bring a loaded conversation back to life so a
            // slash command can be injected): the PTY is live and tailing; do NOT
            // inject a prompt and do NOT run fresh-session discovery.
            if (options.skipInitialMessage) {
                return;
            }

            // Inject the first user message. Reset staged guards: this is a fresh
            // turn, not a watchdog re-call (those must preserve the guards).
            this._resetStagedState();
            this._promptAcceptedThisTurn = false;
            this._beginTurn(options);

            if (!sid) {
                // Fresh session: claude writes the transcript only after it accepts
                // the first prompt. Discover the new jsonl, re-injecting on an
                // interval until it appears (the input box can silently drop the
                // first paste while still loading, e.g. MCP servers), then tail
                // from the beginning.
                const file = await this._discoverWithReinject(options, since);
                if (file) {
                    this._startTail(file, 0);
                } else {
                    debugError('ClaudeProcessService', 'Could not discover new transcript file after launch (after re-injects)');
                }
            } else {
                // Resume: the transcript already exists and is being tailed, so
                // _discoverWithReinject's file-appearance heuristic does not apply.
                // The input box can still be loading when we inject (the footer
                // readiness marker can appear after _waitForReady resolves), which
                // silently drops the first paste and leaves the turn with no reply.
                // Arm the reinject watchdog so a dropped resume prompt is re-sent.
                this._armReinjectWatchdog(options);
            }
        } finally {
            this._isStarting = false;
        }
    }

    /**
     * Interrupt the current generation by sending ESC to the PTY.
     * This does NOT kill the session (use endSession/dispose for that).
     */
    public async stopProcess(): Promise<void> {
        if (this._pty) {
            try {
                this._pty.write('\x1b'); // ESC interrupts claude's current turn
                debugLog('ClaudeProcessService', 'Sent ESC interrupt (turn stopped, session kept)');
            } catch (error) {
                debugError('ClaudeProcessService', 'Failed to send ESC interrupt', error);
            }
            this._turnInProgress = false;
            // User interrupted -> never resurrect the prompt via the watchdog,
            // and abort any in-flight staged image injection (its loop checks
            // _turnInProgress between writes).
            this._clearReinjectWatchdog();
            this._clearIdleTimer();
            this._assistantSeenThisTurn = false;
            this._promptAcceptedThisTurn = false;
            this._resetStagedState();
        }
    }

    /**
     * Terminate the whole PTY session and its process tree (taskkill /t /f on Windows),
     * and stop tailing. Used for new-session / load-history / dispose.
     */
    public endSession(): void {
        if (this._pty) {
            const pid = this._pty.pid;
            debugLog('ClaudeProcessService', 'Ending PTY session', { pid });
            if (pid) {
                this._windowsCompatibility.killProcess(pid).catch(error => {
                    debugError('ClaudeProcessService', 'Error killing PTY process tree', error);
                });
            }
            try { this._pty.kill(); } catch { /* may already be dead */ }
        }
        this._cleanupSession();
    }

    /**
     * Clean up resources (VS Code close / extension deactivate). Kills the process
     * tree to prevent orphan claude processes (Windows does not auto-reap children).
     */
    public dispose(): void {
        this.endSession();
    }

    // -----------------------------------------------------------------------
    // Session spawn / lifecycle
    // -----------------------------------------------------------------------

    /** Spawn the interactive claude PTY and attach data/exit handlers. */
    private _spawnSession(execEnvironment: ExecutionEnvironment, args: string[], cwd: string): void {
        const claudePath = execEnvironment.claudeExecutablePath!;
        const env = this._sanitizeEnv(execEnvironment.spawnOptions.env);
        // Disable the CLI's framework auto-compaction for THIS spawned session
        // only. The PTY architecture reuses one long-lived interactive session,
        // so context accumulates across turns and the CLI eventually self-runs
        // `/compact` (lossy; also splits UI-vs-model context). DISABLE_AUTO_COMPACT
        // is a process-level gate (cli.js honors 1/true/yes/on) that suppresses
        // ONLY auto-compaction — manual `/compact` (route B) still works. Going
        // through env (not settings.json) keeps direct CLI users unaffected.
        // NOT DISABLE_COMPACT: that would also kill manual /compact.
        if (this._isAutoCompactDisabled()) {
            env.DISABLE_AUTO_COMPACT = '1';
        }
        const ptyOptions: pty.IWindowsPtyForkOptions = {
            name: 'xterm-256color',
            cols: 120,
            rows: 40,
            cwd,
            env,
            // Force the winpty backend on Windows. ConPTY deadlocks synchronously
            // when spawned from the VS Code extension host: that host is a utility
            // process with NO attached console, and ConPTY's pseudo-console / conin
            // -conout pipe setup never returns there (this is also why VS Code runs
            // its own terminals in a dedicated ptyHost process, not the ext host).
            // Symptom: pty.spawn() blocks the ext-host main thread -> no response,
            // Stop button frozen. winpty hosts the PTY in a standalone
            // winpty-agent.exe that carries its own console, so it works without a
            // parent console. node-pty docs also flag ConPTY as "too unstable to
            // enable by default". useConpty is a no-op on non-Windows.
            useConpty: false
        };

        // Direct spawn on every platform. On Windows node-pty wraps a .cmd in
        // cmd.exe automatically, so an npm-installed claude.cmd runs fine
        // (verified by scripts/verify-pty-spawn.js). The old Windows-only Git Bash
        // detour (`bash -l -c "exec claude"`) was built on a false "ConPTY cannot
        // exec .cmd" assumption and added a shell layer that could hang. taskkill
        // /t /f reaps the whole tree (claude.cmd -> cmd.exe -> node), orphan-safe.
        debugLog('ClaudeProcessService', 'Spawning interactive claude (direct)', { claudePath, args, useConpty: false });
        this._pty = pty.spawn(claudePath, args, ptyOptions);
        // Synchronous marker: if this line logs, pty.spawn() did NOT deadlock.
        debugLog('ClaudeProcessService', 'PTY spawn returned', { pid: this._pty.pid });

        this._sessionReady = false;
        this._startupBuffer = '';
        this._trustGateHandled = false;
        this._bypassGateHandled = false;
        this._startupGateDeadline = Date.now() + ClaudeProcessService.STARTUP_GATE_WINDOW_MS;
        this._inputBoxReady = false;
        this._markerBuffer = '';
        this._chipScanBuffer = '';
        this._stagedInjectInProgress = false;
        this._stagedArmed = false;
        this._currentTranscriptFile = undefined;
        this._spawnTs = Date.now();

        // PTY stdout is NOT parsed as content (transcript is the source of truth).
        // It only drives readiness detection + debug logging.
        this._pty.onData((data: string) => this._onPtyData(data));

        this._pty.onExit(({ exitCode }) => {
            debugLog('ClaudeProcessService', 'PTY session exited', { exitCode });
            const cb = this._callbacks;
            this._cleanupSession();
            cb?.onClose(exitCode ?? null);
        });
    }

    /** Strip embedded bracketed-paste markers so injected content cannot close or
     * reopen our own paste wrapper (matches reference sanitizePromptText). */
    private _stripPasteMarkers(s: string): string {
        return s.split('\x1b[200~').join('').split('\x1b[201~').join('');
    }

    /** Reset staged-injection guards at a genuine new-turn boundary (NOT on a
     * watchdog re-call, which must preserve them to stay idempotent). */
    private _resetStagedState(): void {
        this._stagedInjectInProgress = false;
        this._stagedArmed = false;
    }

    /** Inject one user message into the live PTY and submit it (matches reference). */
    private _beginTurn(options: ProcessOptions): void {
        if (!this._pty) {
            return;
        }
        this._turnInProgress = true;
        // Fresh turn -> reset the B3 idle gate. Watchdog re-calls of _beginTurn
        // happen only BEFORE any assistant line appears (they stop once the
        // transcript grows), so clearing this here cannot drop a real signal.
        this._assistantSeenThisTurn = false;
        this._clearIdleTimer();

        // Image turn -> staged injection (paste each path alone to mount an
        // "[Image #N]" attachment chip, then the text, then a single Enter). A
        // path embedded in multi-line text gets swallowed by the TUI, losing the
        // image; the chip path delivers a true multimodal attachment. See
        // scripts/verify-image-staged.js and PRD v13 §2.1.
        const imageAbsPaths = (options.imagesInMessage ?? []).filter((p) => typeof p === 'string' && p.trim().length > 0);
        if (imageAbsPaths.length > 0) {
            if (this._stagedInjectInProgress) {
                // A staged injection is already running for this turn; a watchdog
                // re-call must not start a second one (would stack duplicate chips).
                return;
            }
            if (this._stagedArmed) {
                // Images already mounted + text pasted, but the transcript did not
                // grow -> the submitting Enter was dropped. Re-send Enter ONLY.
                debugLog('ClaudeProcessService', 'Staged message already armed; re-sending submit Enter (idempotent)');
                this._submitStaged();
                return;
            }
            void this._injectStagedMessage(imageAbsPaths, this._stripPasteMarkers(options.message ?? ''));
            return;
        }

        const rawText = options.message ?? '';

        // Non-image file references are handled upstream by expanding "@path"
        // mentions to absolute paths (ClaudeChatProvider._expandFileMentions) so
        // Claude can Read the file directly. The TUI's @-mention picker does not
        // fire for our injected paste, so we do NOT rely on it here.

        // Strip any embedded bracketed-paste markers so user text cannot close or
        // reopen our own paste wrapper (matches reference sanitizePromptText).
        const text = this._stripPasteMarkers(rawText);

        debugLog('ClaudeProcessService', 'Injecting user message', {
            textLength: text.length,
            multiline: text.includes('\n'),
            preview: text.slice(0, ClaudeProcessService.PTY_LOG_PREVIEW_CHARS)
        });

        // Inject via bracketed paste (for every prompt, not just multi-line) so
        // the TUI treats the whole block as one atomic paste rather than typed
        // keystrokes. Then submit with Enter AFTER a short delay: an Enter in the
        // same tick is swallowed while the TUI is still in its "Pasting" state,
        // so the prompt never submits and no turn starts. This paste+delay+Enter
        // sequence is validated against the native claude.exe by
        // scripts/verify-claude-trust-paste.js.
        this._pty.write(`\x1b[200~${text}\x1b[201~`);
        setTimeout(() => {
            try {
                this._pty?.write('\r');
                debugLog('ClaudeProcessService', 'Submitted prompt (Enter sent after paste delay)');
            } catch (error) {
                debugError('ClaudeProcessService', 'Failed to submit prompt Enter', error);
            }
        }, ClaudeProcessService.PASTE_SUBMIT_DELAY_MS);
    }

    /**
     * Staged image injection. Paste each image's bare absolute path ALONE so the
     * TUI converts it into an "[Image #N]" attachment chip (a true multimodal
     * attachment), wait for that chip, then paste the text and submit once. A
     * path embedded in multi-line text is swallowed by the TUI -> the image is
     * lost; staging avoids that. Idempotent under watchdog re-calls via
     * _stagedInjectInProgress / _stagedArmed (see _beginTurn).
     */
    private async _injectStagedMessage(imageAbsPaths: string[], text: string): Promise<void> {
        this._stagedInjectInProgress = true;
        // Reset the chip scan buffer so a prior turn's "[Image #N]" cannot
        // false-trigger this turn's chip detection.
        this._chipScanBuffer = '';
        try {
            // Gate on input-box readiness: a path pasted before the box is
            // interactive is dropped (same risk the text path's watchdog covers).
            const ready = await this.waitForInputBoxReady(ClaudeProcessService.IMAGE_CHIP_READY_TIMEOUT_MS);
            if (!ready || !this._pty) {
                debugError('ClaudeProcessService', 'Input box not ready for staged image injection; degrading to inline');
                this._degradeToInline(imageAbsPaths, text);
                return;
            }

            debugLog('ClaudeProcessService', 'Staged image injection start', { images: imageAbsPaths.length, hasText: text.length > 0 });

            for (let i = 0; i < imageAbsPaths.length; i++) {
                // Bail if the session died or the user interrupted mid-stage.
                if (!this._pty || !this._turnInProgress) {
                    return;
                }
                const p = this._stripPasteMarkers(imageAbsPaths[i]);
                // Paste the path ALONE (no other chars, no Enter) so the TUI treats
                // it as an attachable file rather than prompt text.
                this._pty.write(`\x1b[200~${p}\x1b[201~`);
                const ok = await this._waitForImageChip(i + 1, ClaudeProcessService.IMAGE_CHIP_TIMEOUT_MS);
                if (!ok) {
                    // Chip never appeared (older/newer TUI, odd path). Keep the
                    // chips already mounted and degrade the REMAINING images to an
                    // inline Read path so we never fully lose an image. (Task 4.)
                    debugError('ClaudeProcessService', 'Image chip not detected; degrading remaining images to inline', { chipIndex: i + 1 });
                    this._degradeToInline(imageAbsPaths.slice(i), text);
                    return;
                }
                debugLog('ClaudeProcessService', 'Image chip mounted', { chipIndex: i + 1 });
            }

            if (!this._pty) {
                return;
            }
            // All images mounted -> paste the (optional, possibly multi-line) text,
            // then arm and submit. Text after chips stays in the prompt body and is
            // NOT swallowed (only a bare path on its own line is).
            if (text) {
                this._pty.write(`\x1b[200~${text}\x1b[201~`);
            }
            this._stagedArmed = true;
            await this._sleep(ClaudeProcessService.PASTE_SUBMIT_DELAY_MS);
            this._submitStaged();
        } catch (error) {
            // Never let a staged-injection failure escape and wedge the turn.
            debugError('ClaudeProcessService', 'Staged image injection failed', error);
        } finally {
            this._stagedInjectInProgress = false;
        }
    }

    /**
     * Degrade path: chips did not appear, so inline the (remaining) image absolute
     * paths into the text and submit as one paste. Claude then Reads them (one
     * extra round-trip) instead of receiving a native attachment -- never a total
     * image loss. Any chips already mounted this turn stay in the input box; this
     * only handles the un-mounted remainder.
     *
     * Layout safety (per PRD v13 §1): a path ALONE on its own line inside a
     * multi-line paste is swallowed by the TUI. So we strip trailing whitespace
     * from the text first (so it never ends in a newline) and join the paths onto
     * the text's LAST line with spaces -- the paths are never alone on a line.
     * When there is no text, the paths form a single line together (single-step
     * inline form, also safe).
     */
    private _degradeToInline(remainingImageAbsPaths: string[], text: string): void {
        const flatText = text.replace(/\s+$/, ''); // no trailing newline before a path
        const parts: string[] = [];
        if (flatText) {
            parts.push(flatText);
        }
        for (const p of remainingImageAbsPaths) {
            parts.push(this._stripPasteMarkers(p));
        }
        const inline = parts.join(' ').trim();
        this._stagedArmed = true; // a single paste is in the box; only Enter remains
        try {
            if (this._pty && inline) {
                this._pty.write(`\x1b[200~${inline}\x1b[201~`);
            }
        } catch (error) {
            debugError('ClaudeProcessService', 'Failed to write inline-degrade paste', error);
        }
        setTimeout(() => this._submitStaged(), ClaudeProcessService.PASTE_SUBMIT_DELAY_MS);
    }

    /** Send the single submitting Enter for a staged/degraded message. */
    private _submitStaged(): void {
        try {
            this._pty?.write('\r');
            debugLog('ClaudeProcessService', 'Submitted staged message (Enter)');
        } catch (error) {
            debugError('ClaudeProcessService', 'Failed to submit staged message Enter', error);
        }
    }

    /**
     * Resolve true once the n-th image attachment chip ("[Image #<n>]") is seen
     * in the PTY stream, or false on timeout. Scans the rolling _chipScanBuffer
     * fed by _onPtyData (no separate PTY listener). The bracketed form is matched
     * so a pasted path that merely CONTAINS "imageN" (e.g. image1.png) cannot
     * false-trigger before the real chip renders.
     */
    private _waitForImageChip(n: number, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        return new Promise<boolean>((resolve) => {
            const poll = (): void => {
                if (!this._pty) {
                    resolve(false);
                    return;
                }
                if (this._detectImageChip(this._chipScanBuffer, n)) {
                    resolve(true);
                    return;
                }
                if (Date.now() >= deadline) {
                    resolve(false);
                    return;
                }
                setTimeout(poll, ClaudeProcessService.IMAGE_CHIP_POLL_MS);
            };
            poll();
        });
    }

    /** True when a "[Image #m]" chip with m >= n is present (ANSI stripped). */
    private _detectImageChip(buffer: string, n: number): boolean {
        const stripped = buffer.replace(ClaudeProcessService.ANSI_PATTERN, '');
        const re = /\[\s*image\s*#?\s*(\d+)\s*\]/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(stripped)) !== null) {
            if (parseInt(m[1], 10) >= n) {
                return true;
            }
        }
        return false;
    }

    /**
     * Inject a subsequent-turn message and arm the reinject watchdog. Unlike the
     * first turn (covered by _discoverWithReinject), turns 2+ inject exactly once
     * into an already-settled TUI. That paste can still be silently dropped if the
     * input box is momentarily busy (heavy MCP activity, or a turn submitted right
     * after the previous turn's very early transcript flush).
     */
    private _beginSubsequentTurn(options: ProcessOptions): void {
        this._clearReinjectWatchdog();
        // Fresh turn -> clear staged guards so the watchdog's later re-calls
        // (which preserve them) behave correctly for this new message.
        this._resetStagedState();
        this._promptAcceptedThisTurn = false;
        this._beginTurn(options);
        this._armReinjectWatchdog(options);
    }

    /**
     * Arm a reinject watchdog that re-sends the prompt if claude never accepts it.
     * Shared by the resume path (fresh PTY + existing sid) and subsequent turns
     * (live PTY). Acceptance is detected via _promptAcceptedThisTurn -- a real
     * user/assistant transcript line. file-history-snapshot lines do NOT count, so
     * a turn that only produced snapshots (the dropped-paste symptom) correctly
     * triggers a re-inject. Stops the instant acceptance is observed so an accepted
     * prompt is never injected twice (idempotent).
     */
    private _armReinjectWatchdog(options: ProcessOptions): void {
        let attempts = 0;
        const tick = (): void => {
            this._reinjectTimer = undefined;
            // Turn finished or session gone -> nothing to recover.
            if (!this._pty || !this._turnInProgress) {
                return;
            }
            // Prompt accepted (real transcript line appeared) -> stop; re-injecting
            // would duplicate it.
            if (this._promptAcceptedThisTurn) {
                return;
            }
            if (attempts >= ClaudeProcessService.REINJECT_MAX_RETRIES) {
                debugError('ClaudeProcessService', 'Prompt still not accepted after max re-injects', { attempts });
                return;
            }
            attempts++;
            debugLog('ClaudeProcessService', 'Prompt not accepted (no real transcript line); re-injecting', { attempts });
            this._beginTurn(options);
            this._reinjectTimer = setTimeout(tick, ClaudeProcessService.REINJECT_INTERVAL_MS);
        };
        this._reinjectTimer = setTimeout(tick, ClaudeProcessService.REINJECT_INTERVAL_MS);
    }

    /** Cancel the subsequent-turn reinject watchdog if armed. */
    private _clearReinjectWatchdog(): void {
        if (this._reinjectTimer) {
            clearTimeout(this._reinjectTimer);
            this._reinjectTimer = undefined;
        }
    }

    /**
     * Answers a blocking startup dialog the instant it is detected. Each of the
     * two gate types fires at most once per session (`_trustGateHandled` /
     * `_bypassGateHandled`), so a fresh machine that shows BOTH in sequence gets
     * each answered (the 2nd may paint after silence-readiness — see _onPtyData).
     * The two dialogs need OPPOSITE keys:
     *  - Workspace trust ("Do you trust the files in this folder?" / "Yes, I trust
     *    this folder" / "No, exit"): selection already defaults to "Yes", so a
     *    bare Enter confirms it.
     *  - Bypass-permissions ("WARNING: Bypass Permissions mode" / "No, exit" /
     *    "Yes, I accept"): default is "No, exit", so we move Down to "Yes, I
     *    accept" before confirming.
     * Either way the prompt's own Enter must never land on the dialog, or claude
     * exits / denies and the user's message is silently lost (no turn, no reply).
     */
    private _handleStartupGate(): void {
        if (!this._pty) {
            return;
        }
        const kind = this._detectStartupGate(this._startupBuffer);
        if (!kind) {
            return;
        }
        if (kind === 'bypass') {
            if (this._bypassGateHandled) {
                return;
            }
            this._bypassGateHandled = true;
            debugLog('ClaudeProcessService', 'Bypass-permissions dialog detected; selecting "Yes, I accept"');
            this._pty.write('\x1b[B'); // Down -> "Yes, I accept" (default is "No, exit")
            setTimeout(() => {
                try { this._pty?.write('\r'); } catch { /* session gone */ }
            }, ClaudeProcessService.STARTUP_GATE_NAV_DELAY_MS);
        } else {
            if (this._trustGateHandled) {
                return;
            }
            this._trustGateHandled = true;
            debugLog('ClaudeProcessService', 'Workspace-trust dialog detected; confirming "Yes, I trust this folder"');
            this._pty.write('\r'); // default selection is already "Yes, I trust this folder"
        }
        // Drop the matched dialog from the buffer so this gate cannot re-trigger
        // on repaints AND so the OTHER gate (which paints next, on a fresh
        // machine) is detected cleanly without stale text confusing the match.
        this._startupBuffer = '';
    }

    /**
     * Classifies a blocking startup dialog in raw PTY output, or null if none.
     * Strips terminal control sequences and keeps only lowercase alphanumerics so
     * cursor-positioned repaints (winpty redraws words out of place) still match.
     */
    private _detectStartupGate(buffer: string): 'trust' | 'bypass' | null {
        const compact = buffer
            .replace(ClaudeProcessService.ANSI_PATTERN, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        if (compact.includes('yesitrustthisfolder') && compact.includes('noexit')) {
            return 'trust';
        }
        if (compact.includes('yesiaccept') && compact.includes('noexit')) {
            return 'bypass';
        }
        return null;
    }

    /**
     * Auto-answer the runtime self-edit confirmation gate that blocks edits to
     * files under a `.claude/` dir (skills / hooks / settings) even in
     * bypassPermissions. We select option 2 ("Yes, and allow Claude to edit its
     * own settings for this session") so the grant lasts the whole session and
     * subsequent `.claude` edits never re-gate. Default highlight is option 1
     * ("Yes"), so one Down then Enter lands on option 2.
     *
     * Accumulates into its own rolling buffer (the menu spans several lines and
     * may arrive split across chunks). _permGateAnswering debounces the menu's
     * repaints; it is cleared after the menu has had time to dismiss, so a later
     * distinct gate can still be answered.
     */
    private _handleSelfEditGate(data: string): void {
        if (!this._pty || !this._isAutoAcceptEditGate()) {
            return;
        }
        this._permGateBuffer = (this._permGateBuffer + data).slice(-ClaudeProcessService.STARTUP_BUFFER_CAP);
        if (this._permGateAnswering || !this._detectSelfEditGate(this._permGateBuffer)) {
            return;
        }
        this._permGateAnswering = true;
        this._permGateBuffer = ''; // drop the matched menu so it can't re-trigger
        debugLog('ClaudeProcessService', 'Self-edit gate detected; selecting option 2 (allow for session)');
        try { this._pty.write('\x1b[B'); } catch { /* session gone */ }
        setTimeout(() => {
            try { this._pty?.write('\r'); } catch { /* session gone */ }
        }, ClaudeProcessService.STARTUP_GATE_NAV_DELAY_MS);
        // Release the debounce once the menu has dismissed and the edit proceeds.
        setTimeout(() => { this._permGateAnswering = false; }, ClaudeProcessService.SELF_EDIT_GATE_DEBOUNCE_MS);
    }

    /**
     * True when raw PTY output holds the self-edit confirmation menu. Keyed off
     * the distinctive option-2 wording ("Yes, and allow Claude to edit its own
     * settings for this session"), which appears ONLY for `.claude` self-edits
     * and is far more stable than the per-tool question line. ANSI-stripped and
     * reduced to lowercase alphanumerics so winpty's out-of-place repaints match.
     */
    private _detectSelfEditGate(buffer: string): boolean {
        const compact = buffer
            .replace(ClaudeProcessService.ANSI_PATTERN, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        return compact.includes('allowclaudetoedititsownsettingsforthissession');
    }

    /** Whether to auto-accept the runtime self-edit permission gate (default true). */
    private _isAutoAcceptEditGate(): boolean {
        try {
            return vscode.workspace
                .getConfiguration('claudeCodeChatUI')
                .get<boolean>('autoAcceptEditGate', true);
        } catch {
            return true;
        }
    }

    /**
     * Accumulates PTY output and flips _inputBoxReady the first time the TUI's
     * footer marker paints, waking any waitForInputBoxReady() callers. No-op once
     * already ready. The buffer is capped and independent of _startupBuffer
     * because the marker can appear after silence-readiness has fired.
     */
    private _scanInputBoxReady(data: string): void {
        if (this._inputBoxReady) {
            return;
        }
        this._markerBuffer = (this._markerBuffer + data).slice(-ClaudeProcessService.STARTUP_BUFFER_CAP);
        if (!this._detectInputBoxReady(this._markerBuffer)) {
            return;
        }
        this._inputBoxReady = true;
        this._markerBuffer = '';
        debugLog('ClaudeProcessService', 'Input box ready (footer marker detected)');
        const resolvers = this._inputBoxReadyResolvers.splice(0);
        for (const resolve of resolvers) {
            resolve(true);
        }
    }

    /**
     * True when the input-box footer marker is present. Strips terminal control
     * sequences and keeps only lowercase alphanumerics so cursor-positioned
     * repaints still match (same normalization as _detectStartupGate). The TUI
     * footer reads "(shift+tab to cycle)" and "? for shortcuts".
     */
    private _detectInputBoxReady(buffer: string): boolean {
        const compact = buffer
            .replace(ClaudeProcessService.ANSI_PATTERN, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        return compact.includes('shifttabtocycle') || compact.includes('forshortcuts');
    }

    /** Reset all session state. Safe to call repeatedly. */
    private _cleanupSession(): void {
        if (this._readyTimer) {
            clearTimeout(this._readyTimer);
            this._readyTimer = undefined;
        }
        this._clearReinjectWatchdog();
        this._clearIdleTimer();
        this._assistantSeenThisTurn = false;
        this._promptAcceptedThisTurn = false;
        this._readyResolve = undefined;
        if (this._tail) {
            this._tail.stop();
        }
        this._stopHookFallback.stopWatching();
        this._pty = undefined;
        this._turnInProgress = false;
        this._sessionReady = false;
        this._startupBuffer = '';
        this._trustGateHandled = false;
        this._bypassGateHandled = false;
        this._startupGateDeadline = 0;
        this._inputBoxReady = false;
        this._markerBuffer = '';
        this._chipScanBuffer = '';
        this._permGateBuffer = '';
        this._permGateAnswering = false;
        this._stagedInjectInProgress = false;
        this._stagedArmed = false;
        this._currentTranscriptFile = undefined;
        // Wake any pending readiness waiters so they resolve false (session gone)
        // instead of hanging until their own timeout.
        const resolvers = this._inputBoxReadyResolvers.splice(0);
        for (const resolve of resolvers) {
            resolve(false);
        }
    }

    // -----------------------------------------------------------------------
    // Readiness detection (silence window on PTY stdout)
    // -----------------------------------------------------------------------

    private _onPtyData(data: string): void {
        // Raw-stream debug logging (throttled). Runs in both pre- and post-ready
        // phases so we can tell whether claude is actually producing output.
        this._logPtyData(data);

        // Scan for the input-box footer marker on EVERY chunk, pre- and
        // post-ready: on a slow --resume the silence/hard-cap readiness can
        // resolve well before the input box paints, so this positive signal must
        // keep being checked even after _sessionReady is set.
        this._scanInputBoxReady(data);

        // Accumulate output for image-chip detection (post-ready: chips paint
        // only while a turn is being composed, long after the session is ready).
        this._chipScanBuffer = (this._chipScanBuffer + data).slice(-ClaudeProcessService.STARTUP_BUFFER_CAP);

        // Auto-answer the runtime self-edit confirmation gate (post-ready). This
        // is what makes editing `.claude/` skills/hooks hang under bypassPermissions
        // until the next user message. Scanned on every chunk so it fires the
        // instant the menu paints, mid-turn.
        this._handleSelfEditGate(data);

        // B3: any PTY output means the spinner is still animating (turn ongoing),
        // so push the idle-completion deadline out. Gated to a turn that has
        // already produced assistant content (see _armIdleCompletion).
        this._armIdleCompletion();

        // Answer blocking startup dialogs the instant they paint (event-driven).
        // A fresh machine shows TWO in sequence (workspace-trust, then bypass-
        // permissions) and the SECOND can appear AFTER silence-readiness fires —
        // so keep scanning for a bounded window post-spawn, even once ready, until
        // both gate types are answered. Waiting until "ready" alone is too late:
        // the dialog itself produces the quiet window, so readiness can fire while
        // it is still up, and the prompt's Enter would then dismiss it the wrong
        // way (default "No, exit" => claude exits code 1, first prompt lost). The
        // gate signatures are highly specific, so scanning post-ready is safe.
        if (Date.now() < this._startupGateDeadline && (!this._trustGateHandled || !this._bypassGateHandled)) {
            this._startupBuffer = (this._startupBuffer + data).slice(-ClaudeProcessService.STARTUP_BUFFER_CAP);
            this._handleStartupGate();
        }

        if (this._sessionReady) {
            return;
        }
        // Reset the quiet-window timer on every chunk; when output goes quiet for
        // READY_SILENCE_MS we treat the TUI as ready to accept input (subject to
        // the READY_MIN_MS floor that skips claude's startup load gap).
        if (this._readyTimer) {
            clearTimeout(this._readyTimer);
        }
        this._readyTimer = setTimeout(() => this._onReadySilence(), ClaudeProcessService.READY_SILENCE_MS);
    }

    /**
     * A silence window elapsed. Resolve "ready" only once we are past the
     * READY_MIN_MS floor; an earlier quiet period is claude's startup load gap
     * (bundle loading), not its input box. Firing then would inject the prompt
     * into a TUI that cannot yet accept keystrokes (the prompt is eaten) and run
     * the bypass-dialog check before the dialog has painted. If we're still
     * inside the floor, wait out the remainder and re-check for silence.
     */
    private _onReadySilence(): void {
        if (this._sessionReady) {
            return;
        }
        const remaining = ClaudeProcessService.READY_MIN_MS - (Date.now() - this._spawnTs);
        if (remaining > 0) {
            this._readyTimer = setTimeout(() => this._onReadySilence(), remaining);
            return;
        }
        this._markReady('silence');
    }

    /**
     * Throttled raw PTY output logger. Accumulates byte counts across chunks and
     * emits at most one preview line per PTY_LOG_THROTTLE_MS so TUI repaints
     * (spinners, redraws) don't flood the debug log. Control chars are escaped.
     */
    private _logPtyData(data: string): void {
        this._ptyLogBytes += data.length;
        const now = Date.now();
        if (now - this._ptyLogLastTs < ClaudeProcessService.PTY_LOG_THROTTLE_MS) {
            return;
        }
        this._ptyLogLastTs = now;
        const preview = data
            .slice(0, ClaudeProcessService.PTY_LOG_PREVIEW_CHARS)
            .replace(/[\x00-\x1f\x7f]/g, (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`);
        debugLog('ClaudeProcessService', 'PTY raw output', {
            ready: this._sessionReady,
            bytesSinceLast: this._ptyLogBytes,
            preview
        });
        this._ptyLogBytes = 0;
    }

    private _waitForReady(): Promise<void> {
        if (this._sessionReady) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            this._readyResolve = resolve;
            // Hard cap so we never block forever if the TUI never goes fully quiet.
            setTimeout(() => this._markReady('hard-cap'), ClaudeProcessService.READY_HARD_CAP_MS);
        });
    }

    private _markReady(reason: string = 'unknown'): void {
        if (this._sessionReady) {
            return;
        }
        this._sessionReady = true;
        debugLog('ClaudeProcessService', 'PTY TUI ready', { reason });
        if (this._readyTimer) {
            clearTimeout(this._readyTimer);
            this._readyTimer = undefined;
        }
        const resolve = this._readyResolve;
        this._readyResolve = undefined;
        resolve?.();
    }

    // -----------------------------------------------------------------------
    // Transcript tail wiring
    // -----------------------------------------------------------------------

    /** Start (or switch) tailing the given transcript file. */
    private _startTail(file: string, fromOffset: number): void {
        this._currentTranscriptFile = file;
        if (!this._tail) {
            this._tail = new TranscriptTailService({
                onLine: (json) => {
                    this._onTranscriptLine(json);
                    this._callbacks?.onData(json);
                },
                // B1: transcript end_turn. Routed through the shared dedup entry.
                onTurnComplete: (meta) => this._completeTurn(meta.stopReason, this._currentSessionId()),
                onError: (err) => this._callbacks?.onError(String(err))
            });
        }
        debugLog('ClaudeProcessService', 'Tailing transcript', { file, fromOffset });
        this._tail.switchFile(file, { fromOffset });
    }

    /** sessionId derived from the transcript file currently being tailed. */
    private _currentSessionId(): string | undefined {
        return this._currentTranscriptFile
            ? path.basename(this._currentTranscriptFile, '.jsonl')
            : undefined;
    }

    /**
     * Single completion entry point shared by B1 (transcript end_turn) and B2
     * (Stop hook sentinel). The `_turnInProgress` guard guarantees a turn is
     * only completed once regardless of which detector fires first.
     */
    private _completeTurn(stopReason: string, sessionId: string | undefined): void {
        if (!this._turnInProgress) {
            // already completed by the other detector (B1/B2 dedup)
            debugLog('ClaudeProcessService', 'Turn completion ignored (already completed)', { stopReason, sessionId });
            return;
        }
        debugLog('ClaudeProcessService', 'Turn complete', { stopReason, sessionId });
        this._turnInProgress = false;
        // Turn finished -> cancel any pending reinject so it cannot fire late.
        this._clearReinjectWatchdog();
        // B3: stop the idle watchdog so it cannot re-complete the next turn.
        this._clearIdleTimer();
        this._assistantSeenThisTurn = false;
        this._promptAcceptedThisTurn = false;
        this._callbacks?.onTurnComplete?.({ stopReason, sessionId });
    }

    /**
     * B3: a transcript line arrived. The first assistant line of a turn proves
     * generation has actually started, which arms PTY-silence completion (the
     * spinner is now running, so a later quiet window means the turn ended). The
     * gate guards against completing on the pre-generation quiet gap (MCP startup
     * / reinject wait) before claude has produced anything.
     */
    private _onTranscriptLine(json: any): void {
        if (!this._turnInProgress) {
            return;
        }
        const lineType = json?.type;
        // A real user/assistant line proves claude accepted the prompt -> stop the
        // reinject watchdog. Snapshot lines (file-history-snapshot) are excluded.
        if (lineType === 'user' || lineType === 'assistant') {
            this._promptAcceptedThisTurn = true;
        }
        if (!this._assistantSeenThisTurn && lineType === 'assistant') {
            this._assistantSeenThisTurn = true;
            this._armIdleCompletion();
        }
    }

    /**
     * B3: (re)arm the idle-completion timer. No-op unless a turn is in flight and
     * its generation has started (an assistant line was seen). Every PTY chunk
     * and the first assistant line push the deadline out; when the spinner stops
     * the PTY falls silent and the timer fires _onIdleSilence after IDLE_SILENCE_MS.
     */
    private _armIdleCompletion(): void {
        if (!this._turnInProgress || !this._assistantSeenThisTurn) {
            return;
        }
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
        }
        this._idleTimer = setTimeout(() => this._onIdleSilence(), ClaudeProcessService.IDLE_SILENCE_MS);
    }

    /** B3: cancel the idle-completion timer if armed. */
    private _clearIdleTimer(): void {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = undefined;
        }
    }

    /**
     * B3: the PTY went quiet for IDLE_SILENCE_MS after generation started -> the
     * spinner stopped, so the turn ended. Completes the turn for the cases B1
     * misses (final assistant line written with stop_reason=null, e.g. responses
     * with a thinking block). Routed through the shared _completeTurn so B1/B2
     * still dedup (whichever fires first wins; the rest are ignored).
     */
    private _onIdleSilence(): void {
        this._idleTimer = undefined;
        if (!this._turnInProgress) {
            return;
        }
        debugLog('ClaudeProcessService', 'PTY idle after generation; completing turn (B3)');
        this._completeTurn('pty_idle', this._currentSessionId());
    }

    /**
     * Enable the optional Stop hook completion fallback (B2) if the user opted in.
     * Installs the hook once (idempotent) and watches the sentinel for the
     * duration of the session. Best-effort: failures degrade silently to B1.
     */
    private _enableStopHookFallback(): void {
        if (!this._stopHookFallback.isEnabled()) {
            // Disabled: clean up a previously-installed hook so the toggle is
            // fully reversible (no-op write when nothing is present).
            this._stopHookFallback.uninstall().catch(error =>
                debugError('ClaudeProcessService', 'Failed to uninstall Stop hook fallback', error)
            );
            return;
        }
        this._stopHookFallback.install().catch(error =>
            debugError('ClaudeProcessService', 'Failed to install Stop hook fallback', error)
        );
        this._stopHookFallback.startWatching((signal) => {
            // Only honor the sentinel for the session we are currently tailing.
            const current = this._currentSessionId();
            if (signal.sessionId && current && signal.sessionId !== current) {
                return;
            }
            this._completeTurn('stop_hook', signal.sessionId ?? current);
        });
    }

    /**
     * Poll the project transcript dir for a session file modified at/after
     * `since` (claude creates it only after it accepts the first prompt),
     * re-injecting the prompt every REINJECT_INTERVAL_MS until it appears. The
     * caller has already injected once; this recovers the case where that paste
     * was dropped because the input box was not yet interactive. Bounded by
     * DISCOVER_TIMEOUT_MS. Returns the file path, or undefined if none appeared.
     */
    private async _discoverWithReinject(options: ProcessOptions, since: number): Promise<string | undefined> {
        const deadline = Date.now() + ClaudeProcessService.DISCOVER_TIMEOUT_MS;
        let nextReinjectAt = Date.now() + ClaudeProcessService.REINJECT_INTERVAL_MS;
        while (Date.now() < deadline) {
            const file = findLatestSessionFile(options.cwd, since);
            if (file) {
                return file;
            }
            if (Date.now() >= nextReinjectAt) {
                debugLog('ClaudeProcessService', 'No transcript yet; re-injecting prompt');
                this._beginTurn(options);
                nextReinjectAt = Date.now() + ClaudeProcessService.REINJECT_INTERVAL_MS;
            }
            await new Promise(r => setTimeout(r, ClaudeProcessService.DISCOVER_POLL_MS));
        }
        return undefined;
    }

    // -----------------------------------------------------------------------
    // Spawn helpers
    // -----------------------------------------------------------------------

    /** node-pty wants a plain string env map; drop undefined values. */
    private _sanitizeEnv(env: NodeJS.ProcessEnv | undefined): { [key: string]: string } {
        const out: { [key: string]: string } = {};
        const src = env || process.env;
        for (const key of Object.keys(src)) {
            const value = src[key];
            if (typeof value === 'string') {
                out[key] = value;
            }
        }
        return out;
    }

    /** Whether to suppress the CLI's framework auto-compaction (default true). */
    private _isAutoCompactDisabled(): boolean {
        try {
            return vscode.workspace
                .getConfiguration('claudeCodeChatUI')
                .get<boolean>('disableAutoCompact', true);
        } catch {
            return true;
        }
    }

    /** Whether to launch 1M-capable models with the [1m] suffix (default true). */
    private _is1MContextEnabled(): boolean {
        try {
            return vscode.workspace
                .getConfiguration('claudeCodeChatUI')
                .get<boolean>('enable1MContext', true);
        } catch {
            return true;
        }
    }

    /** Read the configured interactive permission mode (decision C; default bypass). */
    private _getPermissionMode(): string {
        try {
            const mode = vscode.workspace.getConfiguration('claudeCodeChatUI').get<string>('permission.mode');
            if (mode && PERMISSION_MODES.includes(mode)) {
                return mode;
            }
        } catch {
            // Fall through to default.
        }
        return 'bypassPermissions';
    }

    /**
     * Prepare execution environment and arguments.
     */
    private async _prepareProcessExecution(options: ProcessOptions): Promise<{
        execEnvironment: ExecutionEnvironment;
        args: string[];
    }> {
        // Get execution environment
        const execEnvironment = await this._windowsCompatibility.getExecutionEnvironment();

        // Build MCP configuration if enabled
        const { configPath: mcpConfigPath } = await this._configurationManager.buildMcpConfig();

        // Build command arguments
        const args = await this._buildCommandArgs(options, mcpConfigPath);

        // Merge MCP environment variables if needed
        const mcpStatus = this._configurationManager.getMcpStatus();
        if (mcpStatus.servers) {
            mcpStatus.servers.forEach((server: any) => {
                if (server.env && typeof server.env === 'object') {
                    execEnvironment.spawnOptions.env = {
                        ...execEnvironment.spawnOptions.env,
                        ...server.env
                    };
                }
            });
        }

        // Add API configuration to environment variables if custom API is enabled.
        // Only pass env vars for official 'claude' command; third-party CLIs have
        // their own auth. This is the only place we touch auth-related env (decision E).
        const apiConfig = this._configurationManager.getApiConfig();
        const cliCommand = apiConfig.cliCommand || 'claude';
        const isOfficialClaude = cliCommand === 'claude';

        const secretApiKey = await SecretService.getInstance().getAnthropicApiKey();
        const effectiveApiKey = secretApiKey || '';

        if (apiConfig.useCustomAPI && effectiveApiKey && apiConfig.baseUrl && isOfficialClaude) {
            execEnvironment.spawnOptions.env = {
                ...execEnvironment.spawnOptions.env,
                ANTHROPIC_API_KEY: effectiveApiKey,
                ANTHROPIC_BASE_URL: apiConfig.baseUrl
            };
            debugLog('ClaudeProcessService', 'Using custom API with official claude', {
                baseUrl: apiConfig.baseUrl,
                hasKey: !!effectiveApiKey
            });
        } else if (apiConfig.useCustomAPI && !isOfficialClaude) {
            debugLog('ClaudeProcessService', 'Using third-party CLI', {
                cliCommand: cliCommand,
                note: 'API env vars not passed - CLI has its own auth'
            });
        }

        return { execEnvironment, args };
    }

    /**
     * Build command arguments for the interactive Claude CLI (no `-p`).
     */
    private async _buildCommandArgs(options: ProcessOptions, mcpConfigPath: string | null): Promise<string[]> {
        const args: string[] = [];

        // Interactive mode: select the permission mode instead of -p/stream-json.
        // Default 'bypassPermissions' preserves the previous frictionless behavior.
        args.push('--permission-mode', this._getPermissionMode());

        // Add MCP config if available
        if (mcpConfigPath) {
            args.push('--mcp-config', mcpConfigPath);
        }

        // Add session resume (used when starting the PTY for an existing session)
        if (options.resumeFrom) {
            args.push('--resume', options.resumeFrom);
        } else if (options.sessionId) {
            args.push('--resume', options.sessionId);
        }

        // Add model if not default. When 1M context is enabled and the selected
        // model supports it, append the `[1m]` suffix so the CLI launches with
        // the 1M-token window (native GA; no beta header). Validation still uses
        // the bare model id (the suffix is not part of VALID_MODELS).
        if (options.model && options.model !== 'default' && VALID_MODELS.includes(options.model as ValidModel)) {
            const modelArg =
                this._is1MContextEnabled() && MODELS_SUPPORTING_1M.has(options.model)
                    ? `${options.model}[1m]`
                    : options.model;
            args.push('--model', modelArg);
        }

        // Add custom instructions
        if (options.customInstructions) {
            args.push('--custom-instructions');
            args.push(options.customInstructions);
        }

        // v14 Interactive Options: remove the native AskUserQuestion tool so the
        // model emits a ```ask block instead of opening a webview-undriveable TUI
        // menu (see ASK_OPTIONS_PROTOCOL above).
        args.push('--disallowedTools', ASK_OPTIONS_DISALLOWED_TOOL);

        // Assemble the appended system prompt from all fragments. The ```ask
        // protocol is ALWAYS appended; MCP prompts are added when MCP is enabled.
        // Both are concatenated into a single --append-system-prompt value so
        // neither clobbers the other.
        const systemPromptFragments: string[] = [ASK_OPTIONS_PROTOCOL];

        const mcpStatus = this._configurationManager.getMcpStatus();
        debugLog('ClaudeProcessService', 'MCP Status', {
            status: mcpStatus.status,
            serverCount: mcpStatus.servers?.length || 0,
            serverNames: mcpStatus.servers?.map((s: any) => s.name) || []
        });

        if (mcpStatus.status === 'configured' && mcpStatus.servers && mcpStatus.servers.length > 0) {
            const mcpPrompts = getMcpSystemPrompts(mcpStatus.servers);
            if (mcpPrompts && mcpPrompts.trim()) {
                systemPromptFragments.push(mcpPrompts.trim());
            }
        }

        const appendedSystemPrompt = systemPromptFragments.join('\n\n');
        if (appendedSystemPrompt) {
            args.push('--append-system-prompt');
            args.push(appendedSystemPrompt);
        }

        return args;
    }

    // -----------------------------------------------------------------------
    // Temp file cleanup (unchanged from the -p implementation)
    // -----------------------------------------------------------------------

    /**
     * Clean up Claude CLI temporary files (tmpclaude-*-cwd).
     */
    public static cleanupTempFiles(workspacePath: string): void {
        ClaudeProcessService.cleanupTempFilesInDir(workspacePath);
        ClaudeProcessService.cleanupTempFilesRecursive();
    }

    private static cleanupTempFilesInDir(dirPath: string): void {
        try {
            const files = fs.readdirSync(dirPath);
            const tempFileRegex = /^tmpclaude-[a-f0-9]+-cwd$/;
            const tempFiles = files.filter(f => tempFileRegex.test(f));

            if (tempFiles.length > 0) {
                debugLog('ClaudeProcessService', `Cleaning up ${tempFiles.length} Claude temp file(s) in ${dirPath}`, {
                    files: tempFiles
                });

                for (const file of tempFiles) {
                    try {
                        const filePath = path.join(dirPath, file);
                        fs.unlinkSync(filePath);
                        debugLog('ClaudeProcessService', `Deleted temp file: ${file}`);
                    } catch (err) {
                        debugError('ClaudeProcessService', `Failed to delete temp file: ${file}`, err);
                    }
                }
            }
        } catch (error) {
            debugError('ClaudeProcessService', `Error during temp file cleanup in ${dirPath}`, error);
        }
    }

    public static async cleanupTempFilesRecursive(): Promise<void> {
        try {
            const pattern = '**/tmpclaude-*-cwd';
            const exclude = '**/node_modules/**';

            const files = await vscode.workspace.findFiles(pattern, exclude);

            if (files.length === 0) {
                return;
            }

            debugLog('ClaudeProcessService', `Found ${files.length} Claude temp file(s) recursively`, {
                files: files.map(f => f.fsPath)
            });

            const tempFileRegex = /^tmpclaude-[a-f0-9]+-cwd$/;

            await Promise.all(files.map(async (uri) => {
                try {
                    const fileName = path.basename(uri.fsPath);
                    if (tempFileRegex.test(fileName)) {
                        await vscode.workspace.fs.delete(uri, { useTrash: false });
                        debugLog('ClaudeProcessService', `Deleted temp file (recursive): ${uri.fsPath}`);
                    }
                } catch (err) {
                    debugError('ClaudeProcessService', `Failed to delete temp file: ${uri.fsPath}`, err);
                }
            }));

            debugLog('ClaudeProcessService', `Cleaned up ${files.length} temp file(s) recursively`);
        } catch (error) {
            debugError('ClaudeProcessService', 'Error during recursive temp file cleanup', error);
        }
    }
}
