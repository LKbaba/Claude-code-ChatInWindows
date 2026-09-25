/**
 * Message Processor Service
 * Handles parsing and processing of Claude CLI JSON stream responses
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getToolStatusText, optimizeToolInput } from '../utils/utils';
import { getModelContextWindow } from '../utils/constants';
import { ConversationManager } from '../managers/ConversationManager';
import { OperationTracker } from '../managers/OperationTracker';
import { Operation, OperationType, OperationData } from '../types/Operation';
import { debugLog, debugError } from './DebugLogger';

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
}

export interface TokenUpdate {
    totalTokensInput: number;
    totalTokensOutput: number;
    currentInputTokens: number;
    currentOutputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    // Current context occupancy = latest assistant message's
    // input + cache_creation + cache_read tokens (not cumulative, no output).
    // Single source of truth for the context indicator (PRD updatePRDv18 F1.1).
    contextTokens: number;
    // Indicator denominator = min(configured window, model's real window)
    contextLimit: number;
}

export interface FinalResult {
    sessionId?: string;
    totalCost?: number;
    duration?: number;
    turns?: number;
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
    private _currentMessageId: string | undefined;
    // True when the LATEST assistant emission of the current turn was plain
    // text containing leaked ANTML tool-call markup (known Opus 4.8
    // serialization regression: the model emits `<invoke name="...">` as
    // ordinary text — often prefixed by a stray "court"/"count" token — the
    // API ends the turn and the tool is never executed). A subsequent real
    // tool_use clears the flag. Consumed by the provider at process close
    // to drive the auto-retry fallback.
    private _leakedToolCallDetected: boolean = false;
    // Session context for context-window computation (set by the provider at
    // session start; model is re-calibrated from the CLI init message).
    // Intentionally NOT cleared in reset() — it is session configuration, not stream state.
    private _sessionModel: string | undefined;
    private _contextWindowTokens: number | undefined;
    // Last context occupancy reported by a MAIN-thread assistant message.
    // Subagent (sidechain) messages carry usage of their own separate small
    // context — they must not overwrite the main conversation's indicator,
    // so for sidechain updates we re-send this value instead.
    private _lastMainContextTokens: number = 0;

    // Opening of a leaked ANTML tool-call tag, e.g. `<invoke name="Read">`
    // (namespace prefix is usually dropped when the leak happens) or a bare
    // `<function_calls>` block wrapper.
    private static readonly LEAKED_TOOL_CALL_RE = /<(?:antml:)?(?:invoke\s+name\s*=|function_calls>)/i;

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
        this._currentMessageId = undefined;
        this._leakedToolCallDetected = false;
        this._lastMainContextTokens = 0;
    }

    /**
     * Return whether the turn ended with a leaked (text-form) tool call and
     * clear the flag. Called by the provider on process close to decide
     * whether to auto-retry (see ClaudeChatProvider onClose handler).
     */
    public consumeLeakedToolCall(): boolean {
        const detected = this._leakedToolCallDetected;
        this._leakedToolCallDetected = false;
        return detected;
    }

    /**
     * Heuristic detection of the Opus 4.8 "tool call emitted as plain text"
     * regression. A real leak terminates the assistant message right at the
     * markup, whereas legitimate prose quoting such markup (docs, examples)
     * normally continues afterwards or wraps it in a code fence.
     */
    private static _detectLeakedToolCall(text: string): boolean {
        const trimmed = text.trimEnd();
        const tailStart = Math.max(0, trimmed.length - 2000);
        const relIdx = trimmed.slice(tailStart).search(MessageProcessor.LEAKED_TOOL_CALL_RE);
        if (relIdx === -1) {
            return false;
        }
        // Odd number of ``` fences before the match => markup sits inside a
        // fenced code block, i.e. an intentional quoted example — not a leak.
        const fenceCount = (trimmed.slice(0, tailStart + relIdx).match(/```/g) ?? []).length;
        if (fenceCount % 2 === 1) {
            return false;
        }
        // The message must effectively END with/inside the markup: either a
        // closing tag at the very end, or the opening tag itself sits in the
        // last few hundred chars (truncated leak).
        return /<\/(?:antml:)?(?:invoke|parameter|function_calls)>$/i.test(trimmed)
            || MessageProcessor.LEAKED_TOOL_CALL_RE.test(trimmed.slice(-400));
    }

    /**
     * Set session context used for context-window computation.
     * Called by the provider before each process start.
     */
    public setSessionContext(model: string, contextWindowTokens: number): void {
        this._sessionModel = model;
        this._contextWindowTokens = contextWindowTokens;
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

        // Handle known message types
        if ((type === 'assistant' || type === 'user' || type === 'system') && jsonData.message) {
            // parent_tool_use_id (envelope-level) is non-null for messages
            // emitted from inside a subagent (Task tool sidechain).
            const isSidechain = jsonData.parent_tool_use_id != null;
            this._processMessage(jsonData.message, callbacks, isSidechain);
        } else if (type === 'system' && jsonData.subtype === 'init') {
            // CLI init message: contains session_id, tools, model, etc.
            this._processSystemInit(jsonData, callbacks);
        } else if (type === 'system' && jsonData.subtype === 'compact_boundary') {
            // CLI compacted the conversation (auto or manual /compact).
            // Previously fell into the unhandled branch and was silently dropped,
            // which was one of the root causes of the "stuck at 16-18%" indicator bug.
            this._processCompactBoundary(jsonData, callbacks);
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
            // Task-list tools actually offered this session (verifies the TODO env injection)
            taskTools: Array.isArray(jsonData.tools)
                ? jsonData.tools.filter((t: string) => /^(Todo|Task)/.test(t))
                : undefined,
            skills: jsonData.skills?.length
        });

        // Calibrate session model from CLI-reported value (authoritative;
        // may carry a date suffix or "[1m]" — normalized at lookup time)
        if (typeof jsonData.model === 'string' && jsonData.model) {
            this._sessionModel = jsonData.model;
        }

        if (this._isFirstSystemMessage) {
            this._isFirstSystemMessage = false;
            callbacks.sendToWebview({ type: 'connected' });
        }
    }

    /**
     * Process compact_boundary system message.
     * Exact CLI 2.1.85 wire format (captured by probe P2, snake_case):
     * {"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"auto","pre_tokens":67113}}
     */
    private _processCompactBoundary(jsonData: any, callbacks: MessageCallbacks): void {
        const metadata = jsonData.compact_metadata ?? {};
        const trigger: string = metadata.trigger ?? 'auto';
        const preTokens: number = metadata.pre_tokens ?? 0;

        debugLog('MessageProcessor', 'Compact boundary received', { trigger, preTokens });

        // saveMessage both posts to the webview and persists to conversation
        // history, so the divider is replayed when the session is restored
        callbacks.saveMessage({
            type: 'compactBoundary',
            data: { trigger, preTokens }
        });
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
    private _processMessage(message: any, callbacks: MessageCallbacks, isSidechain: boolean = false): void {
        // Process token usage
        if (message.usage) {
            this._updateTokens(message.usage, callbacks, isSidechain);
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
                // Track leaked tool-call markup; the LAST assistant emission
                // of the turn decides (a later tool_use clears the flag)
                this._leakedToolCallDetected = MessageProcessor._detectLeakedToolCall(content.text);
                if (this._leakedToolCallDetected) {
                    debugLog('MessageProcessor', 'Leaked tool-call markup detected in assistant text (Opus 4.8 serialization bug)');
                }
                // Regular text response - handled by onAssistantMessage callback
                callbacks.onAssistantMessage(content.text);
            } else if (content.type === 'thinking' && content.text) {
                // Thinking process
                callbacks.saveMessage({
                    type: 'thinking',
                    data: content.text
                });
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
        // A real structured tool call arrived — any earlier text was not the
        // final emission of the turn, so it cannot be a terminating leak
        this._leakedToolCallDetected = false;
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
            case 'TaskCreate':
                if (content.input?.subject) {
                    details = ` • ${content.input.subject}`;
                }
                break;
            case 'TaskUpdate':
                if (content.input?.taskId) {
                    details = ` • #${content.input.taskId}${content.input.status ? ` → ${content.input.status}` : ''}`;
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
            case 'AskUserQuestion':
                if (content.input?.questions?.length) {
                    details = ` • ${content.input.questions.length} question(s)`;
                }
                break;
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
        // Always hide AskUserQuestion and ExitPlanMode results (regardless of error status)
        // CLI's -p mode auto-returns error messages, then Claude will reprocess with plain text
        // - AskUserQuestion: "Error: Answer questions?" → Claude redisplays question as text
        // - ExitPlanMode: "Exit plan mode?" → Claude confirms exit and continues
        if (toolName === 'AskUserQuestion' || toolName === 'ExitPlanMode') {
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
    private _updateTokens(usage: any, callbacks: MessageCallbacks, isSidechain: boolean = false): void {
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        // Cache-related tokens are not counted in totals, only passed to frontend for display
        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
        const cacheReadTokens = usage.cache_read_input_tokens || 0;

        this._totalTokensInput += inputTokens;
        this._totalTokensOutput += outputTokens;
        this._currentRequestTokensInput += inputTokens;
        this._currentRequestTokensOutput += outputTokens;

        // Current context occupancy: the latest message's input_tokens already
        // includes the full history (cache fields are split for billing), so
        // this is NOT accumulated across turns and excludes output_tokens.
        // After a compact the value naturally drops — that drop is correct info.
        //
        // Sidechain (subagent) messages run in their own separate context:
        // their usage still counts toward billing totals above, but must not
        // drive the main conversation's context indicator — keep the last
        // main-thread value instead.
        let contextTokens: number;
        if (isSidechain) {
            contextTokens = this._lastMainContextTokens;
        } else {
            contextTokens = inputTokens + cacheCreationTokens + cacheReadTokens;
            this._lastMainContextTokens = contextTokens;
        }

        // Denominator: configured window clamped to the model's real window
        // (prevents advertising 400K on a 200K model like haiku)
        const modelWindow = getModelContextWindow(this._sessionModel ?? '');
        const contextLimit = Math.min(this._contextWindowTokens ?? modelWindow, modelWindow);

        callbacks.onTokenUpdate({
            totalTokensInput: this._totalTokensInput,
            totalTokensOutput: this._totalTokensOutput,
            currentInputTokens: inputTokens,
            currentOutputTokens: outputTokens,
            cacheCreationTokens: cacheCreationTokens,
            cacheReadTokens: cacheReadTokens,
            contextTokens: contextTokens,
            contextLimit: contextLimit
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

        // Current request tokens are already tracked in the instance variables
        const currentTokensInput = this._currentRequestTokensInput;
        const currentTokensOutput = this._currentRequestTokensOutput;

        // Update tracking
        this._requestCount++;
        if (jsonData.total_cost_usd) {
            this._totalCost += jsonData.total_cost_usd;
        }

        // Send result info
        callbacks.onFinalResult({
            sessionId: jsonData.session_id,
            totalCost: jsonData.total_cost_usd,
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
                currentCost: jsonData.total_cost_usd,
                currentDuration: jsonData.duration_ms,
                currentTurns: jsonData.num_turns,
                currentTokensInput: currentTokensInput,
                currentTokensOutput: currentTokensOutput
            }
        });

        // Reset current request tokens
        this._currentRequestTokensInput = 0;
        this._currentRequestTokensOutput = 0;
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