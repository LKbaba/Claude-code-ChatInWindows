/**
 * Message Processor Service
 * Handles parsing and processing of Claude CLI JSON stream responses
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getToolStatusText, optimizeToolInput } from '../utils/utils';
import { ConversationManager } from '../managers/ConversationManager';
import { OperationTracker } from '../managers/OperationTracker';
import { Operation, OperationType, OperationData } from '../types/Operation';
import { debugLog, debugError } from './DebugLogger';
import { computeUsageCost, MODEL_PRICING } from './ModelPricing';

export interface MessageCallbacks {
    onSystemMessage: (data: any) => void;
    onAssistantMessage: (data: any) => void;
    onToolStatus: (toolName: string, details: string) => void;
    onToolResult: (data: any) => void;
    onTokenUpdate: (tokens: TokenUpdate) => void;
    onFinalResult: (result: FinalResult) => void;
    onError: (error: string) => void;
    sendToWebview: (message: any) => void;
    saveMessage: (message: any) => void;
    onOperationTracked?: (operation: Operation) => void;
    // Plan Mode state change callback: triggered when Claude calls EnterPlanMode/ExitPlanMode
    onPlanModeChange?: (isInPlanMode: boolean) => void;
    // Native compaction (route B): the transcript `compact_boundary` line fires
    // this with the pre/post token stats once server-side compaction completes.
    onCompactBoundary?: (meta: CompactBoundaryMeta) => void;
    // Native compaction summary text (the `isCompactSummary` user line).
    onCompactSummary?: (summaryText: string) => void;
    // v14 Interactive Options (Architecture A+): fired when an assistant text block
    // contains a valid fenced ```ask JSON block. The webview renders clickable
    // cards; the chosen label(s) are injected back as the next user message.
    // NOTE: the ask block IS the turn boundary, and the provider finalizes the
    // turn (unlock + 💰) from this callback. A bare single-turn ask ends with
    // stop_reason === "end_turn" (B1 also fires), but an ask that follows a tool
    // call in the same turn ends with stop_reason === null and the turn closes via
    // the Stop hook -- so B1 never fires and this callback is the ONLY finalize
    // path. Provider._finalizeTurn is idempotent so the end_turn case is safe.
    // We still do NOT add null/tool_use to TranscriptTailService's terminal set
    // (those mid-stream states must stay non-terminal for non-ask turns).
    onAskOptions?: (request: AskOptionsRequest) => void;
}

// ---------------------------------------------------------------------------
// v14 Interactive Options: ```ask block schema (mirrors the native
// AskUserQuestion tool input, which the model is disallowed from calling).
// ---------------------------------------------------------------------------
export interface AskOption {
    label: string;
    description?: string;
}

export interface AskQuestion {
    question: string;
    header?: string;
    options: AskOption[];
    multiSelect?: boolean;
}

export interface AskOptionsRequest {
    id: string;
    questions: AskQuestion[];
}

export interface CompactBoundaryMeta {
    trigger: string;      // "manual" (user /compact) or "auto" (context filled)
    preTokens: number;    // context size before compaction
    postTokens: number;   // context size after compaction
    durationMs: number;
}

export interface TokenUpdate {
    totalTokensInput: number;
    totalTokensOutput: number;
    currentInputTokens: number;
    currentOutputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
}

export interface FinalResult {
    sessionId?: string;
    totalCost?: number;
    duration?: number;
    turns?: number;
}

// Matches the FIRST fenced ```ask block in an assistant text blob (tolerant of
// casing / surrounding whitespace). Body is expected to be minified JSON per the
// ASK_OPTIONS_PROTOCOL in ClaudeProcessService. Not global -> no lastIndex state.
const ASK_BLOCK_RE = /```\s*ask\s*\n([\s\S]*?)```/i;

interface ParsedAskBlock {
    questions: AskQuestion[];
    // The assistant text with the ```ask fence removed (may be empty).
    strippedText: string;
}

// Parse + validate a ```ask block out of an assistant text blob. Returns null
// when no block is present OR the block is malformed (bad JSON / missing
// required fields); the caller then renders the original text verbatim so a
// non-compliant model response degrades to a plain question instead of hanging.
function parseAskBlock(text: string): ParsedAskBlock | null {
    const m = text.match(ASK_BLOCK_RE);
    if (!m) return null;

    let json: any;
    try {
        json = JSON.parse(m[1].trim());
    } catch {
        return null;
    }

    const rawQuestions = json?.questions;
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return null;

    const questions: AskQuestion[] = [];
    for (const q of rawQuestions) {
        const options = q?.options;
        if (!q || typeof q.question !== 'string' || !q.question || !Array.isArray(options) || options.length === 0) {
            return null;
        }
        const normOptions: AskOption[] = [];
        for (const o of options) {
            if (!o || typeof o.label !== 'string' || !o.label) return null;
            normOptions.push({
                label: o.label,
                description: typeof o.description === 'string' ? o.description : undefined,
            });
        }
        questions.push({
            question: q.question,
            header: typeof q.header === 'string' ? q.header : undefined,
            options: normOptions,
            multiSelect: q.multiSelect === true,
        });
    }

    return { questions, strippedText: text.replace(ASK_BLOCK_RE, '').trim() };
}

export class MessageProcessor {
    private _totalTokensInput: number = 0;
    private _totalTokensOutput: number = 0;
    private _totalCost: number = 0;
    private _requestCount: number = 0;
    private _isFirstSystemMessage: boolean = true;
    private _lastToolUseId: string | undefined;
    private _lastToolName: string | undefined;
    private _lastToolInput: any | undefined;
    private _lastOperationTracked: boolean = false;
    private _currentRequestTokensInput: number = 0;
    private _currentRequestTokensOutput: number = 0;
    // Per-turn cost accumulator (subscription/PTY mode computes cost from tokens).
    private _currentRequestCost: number = 0;
    // Models seen without a pricing entry; warn once each to avoid log spam.
    private _warnedUnknownModels: Set<string> = new Set();
    // Tripwires: warn once if assumptions behind the flat-rate pricing break.
    private _warnedFastSpeed: boolean = false;
    private _warned200kModels: Set<string> = new Set();
    private _currentMessageId: string | undefined;

    constructor(
        private _conversationManager: ConversationManager,
        private _operationTracker: OperationTracker,
        private _workspaceRoot?: string
    ) {}

    /**
     * Reset state for a new conversation
     */
    public reset(): void {
        this._totalTokensInput = 0;
        this._totalTokensOutput = 0;
        this._totalCost = 0;
        this._requestCount = 0;
        this._isFirstSystemMessage = true;
        this._lastToolUseId = undefined;
        this._lastToolName = undefined;
        this._lastToolInput = undefined;
        this._lastOperationTracked = false;
        this._currentRequestTokensInput = 0;
        this._currentRequestTokensOutput = 0;
        this._currentRequestCost = 0;
        this._currentMessageId = undefined;
    }

    /**
     * Get current totals
     */
    public getTotals(): {
        totalCost: number;
        totalTokensInput: number;
        totalTokensOutput: number;
        requestCount: number;
    } {
        return {
            totalCost: this._totalCost,
            totalTokensInput: this._totalTokensInput,
            totalTokensOutput: this._totalTokensOutput,
            requestCount: this._requestCount
        };
    }

    /**
     * Finalize a conversation turn (one end_turn). Increments the request
     * counter, snapshots the current-turn cost/token tallies for the 💰 bubble,
     * then resets the per-turn accumulators. Used in PTY mode where there is no
     * `result` event to mark a turn boundary.
     */
    public completeTurn(): {
        cost: number;
        tokensInput: number;
        tokensOutput: number;
    } {
        this._requestCount++;
        const turn = {
            cost: this._currentRequestCost,
            tokensInput: this._currentRequestTokensInput,
            tokensOutput: this._currentRequestTokensOutput
        };
        this._currentRequestCost = 0;
        this._currentRequestTokensInput = 0;
        this._currentRequestTokensOutput = 0;
        return turn;
    }

    /**
     * Process a JSON line from Claude's output stream
     */
    public processJsonLine(line: string, callbacks: MessageCallbacks): void {
        try {
            const jsonData = JSON.parse(line);
            debugLog('MessageProcessor', `Received JSON: ${jsonData.type}`, jsonData);
            this.processJsonData(jsonData, callbacks);
        } catch (error) {
            // Not JSON, might be plain text
            debugLog('MessageProcessor', 'Non-JSON line', line);
            callbacks.sendToWebview({ type: 'text', data: line });
        }
    }

    /**
     * Process parsed JSON data directly (avoids stringify/parse round-trip)
     */
    public processJsonData(jsonData: any, callbacks: MessageCallbacks): void {
        const type = jsonData.type;

        // --- Native compaction (route B: injected `/compact`) ---
        // The boundary marker carries the pre/post token stats and is written
        // BEFORE the summary line. Both manual (`/compact`) and auto (context
        // filled) compaction emit this same line (only `trigger` differs).
        if (type === 'system' && jsonData.subtype === 'compact_boundary') {
            const m = jsonData.compactMetadata || {};
            callbacks.onCompactBoundary?.({
                trigger: typeof m.trigger === 'string' ? m.trigger : 'manual',
                preTokens: Number(m.preTokens) || 0,
                postTokens: Number(m.postTokens) || 0,
                durationMs: Number(m.durationMs) || 0
            });
            return;
        }
        // The compacted summary rides on a user-role line flagged
        // `isCompactSummary`. Route it to the compact handler instead of
        // rendering it as an ordinary user message.
        if (jsonData.isCompactSummary === true) {
            callbacks.onCompactSummary?.(this._extractMessageText(jsonData.message));
            return;
        }
        // Suppress the slash-command echo lines native `/compact` writes to the
        // transcript (`<command-name>` / `<local-command-stdout>` / caveat) —
        // these are internal TUI artifacts, never real user input.
        if (type === 'user' && this._isSlashCommandEcho(jsonData.message)) {
            return;
        }

        // Handle known message types
        if ((type === 'assistant' || type === 'user' || type === 'system') && jsonData.message) {
            // Subagent (Agent/Task) sidechain lines are tailed from
            // `{sessionId}/subagents/agent-*.jsonl` and forwarded so their tool
            // steps render inline (v4-style). They carry their own `message.usage`
            // which is billed separately, so render the content but DO NOT count
            // those tokens/cost toward the main turn's context/💰 totals.
            const isSidechain = jsonData.isSidechain === true;
            this._processMessage(jsonData.message, callbacks, isSidechain);
        } else if (type === 'system' && jsonData.subtype === 'init') {
            // CLI init message: contains session_id, tools, model, etc.
            this._processSystemInit(jsonData, callbacks);
        } else if (type === 'result') {
            this._processResult(jsonData, callbacks);
        } else if (type === 'tool_progress') {
            // CLI sends progress updates for long-running tools
            this._processToolProgress(jsonData, callbacks);
        } else if (type === 'rate_limit_event') {
            // Rate limiting info from CLI — log for diagnostics
            debugLog('MessageProcessor', 'Rate limit event', jsonData.rate_limit_info);
        } else if (jsonData.error) {
            this._processError(jsonData, callbacks);
        } else if (type) {
            // Log unhandled message types instead of silently discarding
            debugLog('MessageProcessor', `Unhandled message type: ${type}`, {
                type,
                subtype: jsonData.subtype,
                keys: Object.keys(jsonData)
            });
        }
    }

    /**
     * Process system init message (session metadata from CLI)
     */
    private _processSystemInit(jsonData: any, callbacks: MessageCallbacks): void {
        debugLog('MessageProcessor', 'System init received', {
            session_id: jsonData.session_id,
            model: jsonData.model,
            tools: jsonData.tools?.length,
            skills: jsonData.skills?.length
        });

        if (this._isFirstSystemMessage) {
            this._isFirstSystemMessage = false;
            callbacks.sendToWebview({ type: 'connected' });
        }
    }

    /**
     * Process tool_progress messages from CLI
     */
    private _processToolProgress(jsonData: any, callbacks: MessageCallbacks): void {
        const toolName = jsonData.tool_name || 'unknown';
        const elapsed = jsonData.elapsed_time_seconds || 0;
        const toolUseId = jsonData.tool_use_id;

        debugLog('MessageProcessor', `Tool progress: ${toolName} (${elapsed}s)`, { toolUseId });

        // Reuse existing toolStatus channel to update UI
        callbacks.sendToWebview({
            type: 'toolStatus',
            data: {
                status: `⏳ ${getToolStatusText(toolName)} (${Math.floor(elapsed)}s)`,
                toolName,
                toolUseId
            }
        });
    }

    /**
     * Process a message object
     */
    /** Extract plain text from a transcript message (content may be string or block array). */
    private _extractMessageText(message: any): string {
        const content = message?.content;
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
                .map((c: any) => c.text)
                .join('\n');
        }
        return '';
    }

    /**
     * True for the internal slash-command echo lines Claude writes when a slash
     * command runs (e.g. `/compact`): the command name/message/args block and
     * the `<local-command-stdout>` / `<local-command-caveat>` wrappers. These
     * must not be rendered as user chat messages.
     */
    private _isSlashCommandEcho(message: any): boolean {
        if (!message || message.role !== 'user') {
            return false;
        }
        const text = this._extractMessageText(message).trimStart();
        return text.startsWith('<command-name>') ||
            text.startsWith('<command-message>') ||
            text.startsWith('<local-command-stdout>') ||
            text.startsWith('<local-command-caveat>');
    }

    private _processMessage(message: any, callbacks: MessageCallbacks, isSidechain: boolean = false): void {
        // Transcript JSONL has no `system/init` line, so emit the one-time
        // `connected` signal on the first message of any role. Idempotent via
        // _isFirstSystemMessage (the legacy init/system paths share the flag).
        if (this._isFirstSystemMessage) {
            this._isFirstSystemMessage = false;
            callbacks.sendToWebview({ type: 'connected' });
        }

        // Process token usage.
        // NOTE (transcript double-count guard): transcript writes each content
        // block (thinking/text/tool_use) of a single assistant message as a
        // SEPARATE line, and every such line repeats `message.usage` with growing
        // values; only the terminal block of a message carries a non-null
        // `stop_reason` together with the cumulative usage. Counting every line
        // would multiply-count tokens, so only accumulate on the terminal block.
        // Legacy stream-json assistant messages always carry a stop_reason, so
        // this gate is a no-op for the old `-p` path.
        //
        // v14 EXCEPTION: an ask block that follows a tool call in the same turn
        // carries stop_reason=null (the turn ends via the Stop hook, not end_turn),
        // yet that line IS terminal and holds the turn's cumulative usage. Treat a
        // message bearing a valid ask block as terminal too, or its tokens (incl.
        // the bulk cache-read/creation) get dropped and the 💰 bubble under-counts.
        // Sidechain (subagent) usage is billed on a separate pool and must not
        // inflate the main turn's token/context/cost accounting — skip it.
        const isAskTerminal = this._messageHasAskBlock(message, callbacks);
        if (!isSidechain && message.usage && (message.stop_reason != null || isAskTerminal)) {
            this._updateTokens(message.usage, message.model, callbacks);
        }

        // Process message content by role
        switch (message.role) {
            case 'system':
                this._processSystemMessage(message, callbacks);
                break;
            case 'assistant':
                this._processAssistantMessage(message, callbacks);
                break;
            case 'user':
                this._processUserMessage(message, callbacks);
                break;
        }
    }

    /**
     * Process system messages
     */
    private _processSystemMessage(message: any, callbacks: MessageCallbacks): void {
        if (this._isFirstSystemMessage) {
            this._isFirstSystemMessage = false;
            callbacks.sendToWebview({ type: 'connected' });
        }

        if (message.content && Array.isArray(message.content)) {
            message.content.forEach((content: any) => {
                if (content.type === 'text' && content.text) {
                    callbacks.onSystemMessage(content.text);
                    callbacks.saveMessage({
                        type: 'system',
                        data: content.text
                    });
                }
            });
        }
    }

    /**
     * v14: true when an assistant message carries a parseable fenced ```ask
     * block (and the ask flow is wired). Such a message is a turn boundary even
     * when its transcript stop_reason is null, so callers treat it as terminal
     * for token accumulation. Uses the same parseAskBlock as the dispatch path,
     * so the gate and the actual onAskOptions dispatch always agree.
     */
    private _messageHasAskBlock(message: any, callbacks: MessageCallbacks): boolean {
        if (!callbacks.onAskOptions) { return false; }
        if (message.role !== 'assistant' || !Array.isArray(message.content)) { return false; }
        return message.content.some((c: any) =>
            c && c.type === 'text' && typeof c.text === 'string' && parseAskBlock(c.text) !== null
        );
    }

    /**
     * Process assistant messages
     */
    private _processAssistantMessage(message: any, callbacks: MessageCallbacks): void {
        debugLog('MessageProcessor', 'Processing assistant message', message);
        if (!message.content || !Array.isArray(message.content)) return;

        // Generate or use existing message ID
        this._currentMessageId = message.id || `msg_${Date.now()}`;

        message.content.forEach((content: any) => {
            if (content.type === 'text' && content.text) {
                debugLog('MessageProcessor', 'Assistant text', content.text);
                // v14 Interactive Options: intercept a fenced ```ask block and
                // dispatch it as clickable cards instead of leaking raw JSON into
                // the chat bubble. A malformed block (or no callback wired) falls
                // through to normal text rendering -> graceful degrade, never hang.
                const ask = callbacks.onAskOptions ? parseAskBlock(content.text) : null;
                if (ask) {
                    const askId = `${this._currentMessageId}_ask`;
                    debugLog('MessageProcessor', 'Parsed ask block', {
                        id: askId,
                        questions: ask.questions.length,
                    });
                    // Show any prose that surrounded the ask block, never the JSON.
                    if (ask.strippedText) {
                        callbacks.onAssistantMessage(ask.strippedText);
                    }
                    callbacks.onAskOptions!({ id: askId, questions: ask.questions });
                } else {
                    if (callbacks.onAskOptions && ASK_BLOCK_RE.test(content.text)) {
                        debugLog('MessageProcessor', 'Ask block present but malformed -> rendering as plain text');
                    }
                    // Regular text response - handled by onAssistantMessage callback
                    callbacks.onAssistantMessage(content.text);
                }
            } else if (content.type === 'thinking') {
                // Thinking process. Transcript JSONL stores the reasoning text in
                // `content.thinking`; the legacy stream-json path used `content.text`.
                const thinkingText = content.thinking || content.text;
                if (thinkingText) {
                    callbacks.saveMessage({
                        type: 'thinking',
                        data: thinkingText
                    });
                }
            } else if (content.type === 'tool_use') {
                // Tool usage
                this._processToolUse(content, callbacks);
            }
        });
    }

    /**
     * Process tool use
     */
    private _processToolUse(content: any, callbacks: MessageCallbacks): void {
        // Reset tracking flag for new tool use
        this._lastOperationTracked = false;
        
        // Store tool info for result matching
        this._lastToolUseId = content.id;
        this._lastToolName = content.name;
        this._lastToolInput = content.input;

        // Optimize tool inputs for Windows compatibility
        content.input = optimizeToolInput(
            content.name,
            content.input
        );

        // Track operation based on tool type
        this._trackOperation(content, callbacks);
        this._lastOperationTracked = true;

        // Send tool use message
        callbacks.saveMessage({
            type: 'toolUse',
            data: {
                toolName: content.name,
                toolInfo: `🔧 Executing: ${content.name}`,
                rawInput: content.input,
                toolUseId: content.id
            }
        });

        // Send tool status update
        const toolStatusText = getToolStatusText(content.name);
        let details = this._getToolDetails(content);
        callbacks.onToolStatus(content.name, toolStatusText + details);
    }

    /**
     * Track operation based on tool usage
     */
    private _trackOperation(content: any, callbacks: MessageCallbacks): void {
        debugLog('MessageProcessor', '_trackOperation called', content);

        let operationType: OperationType | null = null;
        let operationData: OperationData = {};

        switch (content.name) {
            case 'Write':
                operationType = OperationType.FILE_CREATE;
                operationData = {
                    filePath: content.input.file_path,
                    content: content.input.content || ''
                };
                break;

            case 'Edit':
                operationType = OperationType.FILE_EDIT;
                operationData = {
                    filePath: content.input.file_path,
                    oldString: content.input.old_string || '',
                    newString: content.input.new_string || '',
                    replaceAll: content.input.replace_all || false
                };
                break;

            case 'MultiEdit':
                operationType = OperationType.MULTI_EDIT;
                operationData = {
                    filePath: content.input.file_path,
                    edits: content.input.edits || [],
                    isMultiEdit: true
                };
                break;

            case 'Bash':
                // Analyze bash command for file operations
                const command = content.input.command || '';
                const fileOpResult = this._analyzeBashCommand(command);

                if (fileOpResult) {
                    operationType = fileOpResult.type;
                    operationData = fileOpResult.data;
                } else {
                    operationType = OperationType.BASH_COMMAND;
                    operationData = {
                        command: command
                    };
                }
                break;

            case 'EnterPlanMode':
                // Claude entered Plan Mode, notify frontend to update UI state
                debugLog('MessageProcessor', 'Claude entered Plan Mode');
                if (callbacks.onPlanModeChange) {
                    callbacks.onPlanModeChange(true);
                }
                break;

            case 'ExitPlanMode':
                // Claude exited Plan Mode, notify frontend to restore normal state
                debugLog('MessageProcessor', 'Claude exited Plan Mode');
                if (callbacks.onPlanModeChange) {
                    callbacks.onPlanModeChange(false);
                }
                break;
        }

        // Track the operation if we identified one
        debugLog('MessageProcessor', 'Tracking operation', { operationType, operationData, hasTracker: !!this._operationTracker });

        if (operationType && this._operationTracker) {
            const operation = this._operationTracker.trackOperation(
                operationType,
                operationData,
                this._currentMessageId,
                content.id
            );
            debugLog('MessageProcessor', 'Created operation', operation);

            // Notify callback if available
            if (callbacks.onOperationTracked) {
                debugLog('MessageProcessor', 'Calling onOperationTracked callback');
                callbacks.onOperationTracked(operation);
            } else {
                debugLog('MessageProcessor', 'No onOperationTracked callback available');
            }
        }
    }

    /**
     * Parse operation input from tool result content
     */
    private _parseOperationFromResult(toolName: string, resultContent: string): any {
        switch (toolName) {
            case 'Write':
                // Parse "File created successfully at: [path]"
                const writeMatch = resultContent.match(/File created successfully at:\s*(.+)/);
                if (writeMatch) {
                    return {
                        file_path: writeMatch[1].trim(),
                        content: '' // Content not available from result
                    };
                }
                break;
                
            case 'Edit':
            case 'MultiEdit':
                // Parse "File updated successfully at: [path]" or similar
                const editMatch = resultContent.match(/File (?:updated|edited) successfully at:\s*(.+)/);
                if (editMatch) {
                    return {
                        file_path: editMatch[1].trim(),
                        old_string: '',
                        new_string: ''
                    };
                }
                break;
                
            case 'Bash':
                // For bash commands, we need to analyze the command from result
                // This is more complex and would need the actual command
                return null;
        }
        
        return null;
    }

    /**
     * Analyze bash command to extract file operations
     */
    private _analyzeBashCommand(command: string): { type: OperationType; data: OperationData } | null {
        // Remove file (non-recursive rm only; recursive rm is handled below as DIRECTORY_DELETE)
        if (command.includes('rm ') && !command.includes('rmdir') && !command.match(/rm\s+-[a-z]*r/)) {
            // Match either quoted or unquoted paths
            const quotedMatch = command.match(/rm\s+(?:-[f]+\s+)?["']([^"']+)["']/);
            const unquotedMatch = command.match(/rm\s+(?:-[f]+\s+)?([^\s]+)/);

            const match = quotedMatch || unquotedMatch;
            if (match) {
                const filePath = match[1].trim();
                return {
                    type: OperationType.FILE_DELETE,
                    data: {
                        filePath: filePath,
                        content: '' // We'll need to read content before deletion in UndoRedoManager
                    }
                };
            }
        }

        // Rename/move file
        if (command.includes('mv ')) {
            // Match either quoted or unquoted paths
            const quotedMatch = command.match(/mv\s+["']([^"']+)["']\s+["']([^"']+)["']/);
            const mixedMatch1 = command.match(/mv\s+["']([^"']+)["']\s+([^\s]+)/);
            const mixedMatch2 = command.match(/mv\s+([^\s]+)\s+["']([^"']+)["']/);
            const unquotedMatch = command.match(/mv\s+([^\s]+)\s+([^\s]+)/);
            
            const match = quotedMatch || mixedMatch1 || mixedMatch2 || unquotedMatch;
            if (match) {
                const oldPath = match[1].trim();
                const newPath = match[2].trim();
                return {
                    type: OperationType.FILE_RENAME,
                    data: {
                        oldPath: oldPath,
                        newPath: newPath
                    }
                };
            }
        }

        // Create directory
        if (command.includes('mkdir')) {
            // Match either quoted or unquoted paths
            const quotedMatch = command.match(/mkdir\s+(?:-p\s+)?["']([^"']+)["']/);
            const unquotedMatch = command.match(/mkdir\s+(?:-p\s+)?([^\s]+)/);
            
            const match = quotedMatch || unquotedMatch;
            if (match) {
                const dirPath = match[1].trim();
                return {
                    type: OperationType.DIRECTORY_CREATE,
                    data: {
                        dirPath: dirPath
                    }
                };
            }
        }

        // Remove directory
        if (command.includes('rmdir') || (command.includes('rm') && command.includes('-r'))) {
            // Match either quoted or unquoted paths
            const quotedMatch = command.match(/(?:rmdir|rm\s+-r[f]*)\s+["']([^"']+)["']/);
            const unquotedMatch = command.match(/(?:rmdir|rm\s+-r[f]*)\s+([^\s]+)/);
            
            const match = quotedMatch || unquotedMatch;
            if (match) {
                const dirPath = match[1].trim();
                return {
                    type: OperationType.DIRECTORY_DELETE,
                    data: {
                        dirPath: dirPath
                    }
                };
            }
        }

        return null;
    }

    /**
     * Get tool-specific details for status display
     */
    private _getToolDetails(content: any): string {
        let details = '';
        const fileName = this._extractFileName(content);

        switch (content.name) {
            case 'Read':
            case 'Edit':
            case 'Write':
            case 'MultiEdit':
            case 'NotebookRead':
            case 'NotebookEdit':
                if (fileName) details = ` • ${fileName}`;
                break;
            case 'Bash':
                if (content.input?.command) {
                    const cmd = content.input.command.substring(0, 50);
                    details = ` • ${cmd}${content.input.command.length > 50 ? '...' : ''}`;
                }
                break;
            case 'Grep':
                // v1.0.45 redesigned Grep tool - show more parameters
                if (content.input?.pattern) {
                    const pattern = content.input.pattern.substring(0, 30);
                    details = ` • "${pattern}${content.input.pattern.length > 30 ? '...' : ''}"`;
                    
                    // Add path info if specified
                    if (content.input.path && content.input.path !== '.') {
                        details += ` in ${content.input.path}`;
                    }
                    
                    // Add include pattern if specified
                    if (content.input.include) {
                        details += ` (${content.input.include})`;
                    }
                }
                break;
            case 'WebFetch':
                if (content.input?.url) {
                    try {
                        const url = new URL(content.input.url);
                        details = ` • ${url.hostname}`;
                    } catch {
                        details = ` • ${content.input.url.substring(0, 30)}...`;
                    }
                }
                break;
            // Subagent tools
            case 'Agent':
            case 'Task': // Legacy alias
                if (content.input?.description) {
                    details = ` • ${content.input.description}`;
                } else if (content.input?.prompt) {
                    const prompt = content.input.prompt.substring(0, 50);
                    details = ` • ${prompt}${content.input.prompt.length > 50 ? '...' : ''}`;
                }
                break;
            case 'TaskOutput':
            case 'TaskStop':
                if (content.input?.task_id) {
                    details = ` • task: ${content.input.task_id}`;
                }
                break;
            case 'KillShell':
                if (content.input?.shell_id) {
                    details = ` • shell: ${content.input.shell_id}`;
                }
                break;
            case 'ToolSearch':
                if (content.input?.query) {
                    details = ` • ${content.input.query}`;
                }
                break;
            case 'EnterWorktree':
                details = ' • creating isolated worktree';
                break;
            // (AskUserQuestion case removed: v14 disallows the native tool; see
            // ASK_OPTIONS_PROTOCOL / onAskOptions for the ```ask replacement.)
            case 'Skill':
                if (content.input?.skill) {
                    details = ` • /${content.input.skill}`;
                }
                break;
            case 'EnterPlanMode':
            case 'ExitPlanMode':
                // These tools don't have special parameters to display
                break;
        }

        return details;
    }

    /**
     * Extract filename from tool input
     */
    private _extractFileName(content: any): string {
        const filePath = content.input?.file_path || 
                        content.input?.path || 
                        content.input?.notebook_path ||
                        (content.input?.edits?.[0]?.file_path);
        
        return filePath ? path.basename(filePath) : '';
    }

    /**
     * Process user messages (tool results)
     */
    private _processUserMessage(message: any, callbacks: MessageCallbacks): void {
        if (!message.content || !Array.isArray(message.content)) return;

        message.content.forEach((content: any) => {
            if (content.type === 'tool_result') {
                this._processToolResult(content, callbacks);
            }
        });
    }

    /**
     * Process tool results
     */
    private _processToolResult(content: any, callbacks: MessageCallbacks): void {
        const isError = content.is_error === true;
        const toolName = this._lastToolName;
        let resultContent = content.content || '';

        debugLog('MessageProcessor', 'Processing tool result', {
            toolName,
            contentType: typeof resultContent,
            isError,
            lastOperationTracked: this._lastOperationTracked
        });

        // Track operation when we get successful tool results
        // This handles cases where tool_use info isn't in assistant messages
        if (!isError && toolName && !this._lastOperationTracked) {
            debugLog('MessageProcessor', 'Tracking operation from tool result', toolName);

            // Parse operation data from result content
            const operationInput = this._parseOperationFromResult(toolName, resultContent);
            debugLog('MessageProcessor', 'Parsed operation input', operationInput);

            if (operationInput) {
                this._trackOperation({
                    name: toolName,
                    input: operationInput,
                    id: content.tool_use_id || this._lastToolUseId
                }, callbacks);
            } else {
                debugLog('MessageProcessor', 'Failed to parse operation input from result');
            }
        }

        // Reset the tracking flag for next operation
        this._lastOperationTracked = false;

        // Handle object content (e.g., from MCP tools or content block arrays)
        if (typeof resultContent === 'object' && resultContent !== null) {
            if (Array.isArray(resultContent)) {
                // Extract text from content block arrays: [{type:"text",text:"..."},...]
                const textParts = resultContent
                    .filter((block: any) => block.type === 'text' && block.text)
                    .map((block: any) => block.text);
                resultContent = textParts.length > 0
                    ? textParts.join('\n')
                    : JSON.stringify(resultContent, null, 2);
            } else if (toolName && toolName.startsWith('mcp__')) {
                // MCP tool result with special formatting
                resultContent = this._formatMcpToolResult(resultContent, toolName);
                debugLog('MessageProcessor', 'Formatted MCP result', resultContent);
            } else {
                resultContent = JSON.stringify(resultContent, null, 2);
            }
        }

        // Truncate large results
        const MAX_RESULT_LENGTH = 50000;
        if (resultContent.length > MAX_RESULT_LENGTH) {
            resultContent = resultContent.substring(0, MAX_RESULT_LENGTH) + 
                          '\n\n[... truncated due to length ...]';
        }

        // Determine if this result should be hidden
        const shouldHide = this._shouldHideToolResult(toolName, isError);

        callbacks.onToolResult({
            content: resultContent,
            isError: isError,
            toolUseId: content.tool_use_id || this._lastToolUseId,
            toolName: toolName,
            hidden: shouldHide
        });

        callbacks.saveMessage({
            type: 'toolResult',
            data: {
                content: resultContent,
                isError: isError,
                toolUseId: content.tool_use_id || this._lastToolUseId,
                toolName: toolName,
                hidden: shouldHide
            }
        });
    }

    /**
     * Determine if a tool result should be hidden
     */
    private _shouldHideToolResult(toolName: string | undefined, isError: boolean): boolean {
        // Always hide ExitPlanMode results (regardless of error status): its
        // result is the "Exit plan mode?" confirmation prompt, not useful output.
        // (AskUserQuestion is no longer handled here -- v14 disallows the native
        // tool entirely and routes interactive options through the ```ask block /
        // onAskOptions path instead.)
        if (toolName === 'ExitPlanMode') {
            return true;
        }

        if (isError) return false;

        // Don't hide thinking results - we want to show the thinking process
        // Only hide specific tools that don't have useful output
        const hiddenTools = ['Read', 'Edit', 'TodoWrite', 'MultiEdit'];

        // Also hide MCP thinking results that only contain metadata
        // (You can comment out this line if you want to see all MCP results)
        // if (toolName === 'mcp__sequential-thinking__sequentialthinking') return true;

        return toolName ? hiddenTools.includes(toolName) : false;
    }
    
    /**
     * Format MCP tool results for better display
     */
    private _formatMcpToolResult(resultContent: any, toolName: string): string {
        debugLog('MessageProcessor', '_formatMcpToolResult called', {
            toolName,
            resultContentType: typeof resultContent,
            isArray: Array.isArray(resultContent)
        });

        // MCP tools typically return an array of content objects
        if (Array.isArray(resultContent)) {
            const textParts: string[] = [];
            let thoughtCount = 0;

            resultContent.forEach((item: any, index: number) => {
                debugLog('MessageProcessor', `Processing MCP item ${index}`, item);

                // Handle different item structures
                if (item && typeof item === 'object') {
                    // Check for text property
                    if (item.type === 'text' && item.text) {
                        // For sequential thinking, try to parse and format the JSON
                        if (toolName.includes('thinking')) {
                            try {
                                const thoughtData = JSON.parse(item.text);
                                debugLog('MessageProcessor', 'Parsed thought data', { keys: Object.keys(thoughtData) });

                                if (thoughtData.thought) {
                                    thoughtCount++;

                                    // Format thinking step compactly
                                    const stepNum = thoughtData.thoughtNumber ? `${thoughtData.thoughtNumber}/${thoughtData.totalThoughts || '?'}` : `${thoughtCount}`;
                                    let statusText = '⏳ Continue thinking';
                                    if (thoughtData.nextThoughtNeeded === false) {
                                        statusText = '✅ Thinking complete';
                                    } else if (thoughtData.isRevision) {
                                        statusText = `🔄 Revising step ${thoughtData.revisesThought}`;
                                    }
                                    textParts.push(`🧠 Step ${stepNum} • ${statusText}\n${thoughtData.thought}`);
                                } else {
                                    debugLog('MessageProcessor', 'No thought property found in thoughtData');
                                    // For sequential thinking without thought content, show progress
                                    if (thoughtData.thoughtNumber && thoughtData.totalThoughts) {
                                        // Compact format
                                        let status = thoughtData.nextThoughtNeeded === false ? '✅' : '⏳';
                                        textParts.push(`🧠 Thinking Step ${thoughtData.thoughtNumber}/${thoughtData.totalThoughts} ${status}`);

                                        // Show the input thought if available
                                        if (this._lastToolInput && this._lastToolInput.thought) {
                                            textParts.push(`Current thought: ${this._lastToolInput.thought}`);
                                        }
                                    } else {
                                        // Fallback: show the raw data
                                        textParts.push(JSON.stringify(thoughtData, null, 2));
                                    }
                                }
                            } catch (e) {
                                debugLog('MessageProcessor', 'Failed to parse as JSON', e);
                                // If it's not valid JSON, just use the text as is
                                textParts.push(item.text);
                            }
                        } else {
                            // For other MCP tools, just extract the text
                            textParts.push(item.text);
                        }
                    }
                    // Check if item has a direct text property (different structure)
                    else if (item.text && typeof item.text === 'string') {
                        debugLog('MessageProcessor', 'Found direct text property');
                        textParts.push(item.text);
                    }
                    // Check if item itself is the content (e.g., {thought: ..., thoughtNumber: ...})
                    else if (toolName.includes('thinking') && item.thought) {
                        debugLog('MessageProcessor', 'Found direct thought object');
                        thoughtCount++;

                        // Format thinking step compactly
                        const stepNum = item.thoughtNumber ? `${item.thoughtNumber}/${item.totalThoughts || '?'}` : `${thoughtCount}`;
                        let statusText = '⏳ Continue';
                        if (item.nextThoughtNeeded === false) {
                            statusText = '✅ Complete';
                        } else if (item.isRevision) {
                            statusText = `🔄 Revising ${item.revisesThought}`;
                        }
                        textParts.push(`🧠 Step ${stepNum} • ${statusText}\n${item.thought}`);
                    }
                }
            });

            // Join with single line break for compact display
            const result = textParts.join('\n');
            debugLog('MessageProcessor', 'Final formatted result length', result.length);
            return result;
        }

        // Fallback to JSON stringification if not an array
        debugLog('MessageProcessor', 'Not an array, using JSON stringification');
        return JSON.stringify(resultContent, null, 2);
    }

    /**
     * Update token counts
     */
    private _updateTokens(usage: any, model: string | undefined, callbacks: MessageCallbacks): void {
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        // Cache-related tokens are not counted in totals, only passed to frontend for display
        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
        const cacheReadTokens = usage.cache_read_input_tokens || 0;

        this._totalTokensInput += inputTokens;
        this._totalTokensOutput += outputTokens;
        this._currentRequestTokensInput += inputTokens;
        this._currentRequestTokensOutput += outputTokens;

        // Subscription/PTY mode has no `result` event with total_cost_usd, so
        // recompute the cost of this usage block (cache-aware) and accumulate it.
        const blockCost = computeUsageCost(usage, model);
        this._totalCost += blockCost;
        this._currentRequestCost += blockCost;

        // Tripwire: a model with no pricing entry yields $0 cost silently. Warn
        // once per unknown model so missing rates surface (e.g. a new release).
        if (model && !MODEL_PRICING.has(model) && !this._warnedUnknownModels.has(model)) {
            this._warnedUnknownModels.add(model);
            debugError('MessageProcessor', `No pricing for model "${model}"; cost will be $0. Add it to MODEL_PRICING.`);
        }

        // Tripwire: our flat-rate pricing assumes speed=="standard". If a "fast"
        // block ever appears, fast-tier rates would be undercounted. Warn once.
        if (usage.speed === 'fast' && !this._warnedFastSpeed) {
            this._warnedFastSpeed = true;
            debugError('MessageProcessor', `Encountered usage.speed=="fast"; pricing uses standard rates only and may undercount. Add fast-tier rates.`);
        }

        // Tripwire: our pricing assumes flat 1M rates (no >200k surcharge) for the
        // default models. If a single block exceeds 200k input-equivalent tokens,
        // a tiered model (e.g. Sonnet 4.5 1M beta) may be undercounted. Warn once.
        const blockInputEquiv = inputTokens + cacheReadTokens + cacheCreationTokens;
        if (blockInputEquiv > 200_000 && model && !this._warned200kModels.has(model)) {
            this._warned200kModels.add(model);
            debugError('MessageProcessor', `Model "${model}" block exceeds 200k input tokens (${blockInputEquiv}); verify it has no >200k tiered pricing.`);
        }

        callbacks.onTokenUpdate({
            totalTokensInput: this._totalTokensInput,
            totalTokensOutput: this._totalTokensOutput,
            currentInputTokens: inputTokens,
            currentOutputTokens: outputTokens,
            cacheCreationTokens: cacheCreationTokens,
            cacheReadTokens: cacheReadTokens
        });
    }

    /**
     * Process final result
     */
    private _processResult(jsonData: any, callbacks: MessageCallbacks): void {
        // Check for login errors
        if (jsonData.error && typeof jsonData.error === 'string' && 
            jsonData.error.includes('login')) {
            callbacks.onError('Authentication required. Please run "claude login" in your terminal.');
            return;
        }

        // Current request tokens/cost are already tracked in the instance variables.
        const currentTokensInput = this._currentRequestTokensInput;
        const currentTokensOutput = this._currentRequestTokensOutput;
        // Cost is computed from token usage in _updateTokens (cache-aware), so it
        // is already accumulated. Do NOT add jsonData.total_cost_usd here or it
        // would double-count in the legacy stream-json path.
        const currentCost = this._currentRequestCost;

        // Update tracking
        this._requestCount++;

        // Send result info
        callbacks.onFinalResult({
            sessionId: jsonData.session_id,
            totalCost: this._totalCost,
            duration: jsonData.duration_ms,
            turns: jsonData.num_turns
        });

        // Send totals update with current request token details
        callbacks.sendToWebview({
            type: 'updateTotals',
            data: {
                totalCost: this._totalCost,
                totalTokensInput: this._totalTokensInput,
                totalTokensOutput: this._totalTokensOutput,
                requestCount: this._requestCount,
                currentCost: currentCost,
                currentDuration: jsonData.duration_ms,
                currentTurns: jsonData.num_turns,
                currentTokensInput: currentTokensInput,
                currentTokensOutput: currentTokensOutput
            }
        });

        // Reset current request tokens/cost
        this._currentRequestTokensInput = 0;
        this._currentRequestTokensOutput = 0;
        this._currentRequestCost = 0;
    }

    /**
     * Process error messages
     */
    private _processError(jsonData: any, callbacks: MessageCallbacks): void {
        const errorMessage = jsonData.error || 'Unknown error occurred';
        callbacks.onError(errorMessage);
        callbacks.saveMessage({
            type: 'error',
            data: errorMessage
        });
    }
}