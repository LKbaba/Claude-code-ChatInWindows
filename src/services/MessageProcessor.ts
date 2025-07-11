/**
 * Message Processor Service
 * Handles parsing and processing of Claude CLI JSON stream responses
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getToolStatusText, optimizeToolInput } from '../utils/utils';
import { ConversationManager } from '../managers/ConversationManager';

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

export class MessageProcessor {
    private _totalTokensInput: number = 0;
    private _totalTokensOutput: number = 0;
    private _totalCost: number = 0;
    private _requestCount: number = 0;
    private _isFirstSystemMessage: boolean = true;
    private _lastToolUseId: string | undefined;
    private _lastToolName: string | undefined;
    private _lastToolInput: any | undefined;
    private _currentRequestTokensInput: number = 0;
    private _currentRequestTokensOutput: number = 0;

    constructor(
        private _conversationManager: ConversationManager,
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
            console.log('[MessageProcessor] Received JSON:', jsonData.type, jsonData);
            this._processJsonData(jsonData, callbacks);
        } catch (error) {
            // Not JSON, might be plain text
            console.log('[MessageProcessor] Non-JSON line:', line);
            callbacks.sendToWebview({ type: 'text', data: line });
        }
    }

    /**
     * Process parsed JSON data
     */
    private _processJsonData(jsonData: any, callbacks: MessageCallbacks): void {
        // Handle different message types
        if ((jsonData.type === 'assistant' || jsonData.type === 'user' || jsonData.type === 'system') && jsonData.message) {
            this._processMessage(jsonData.message, callbacks);
        } else if (jsonData.type === 'result') {
            this._processResult(jsonData, callbacks);
        } else if (jsonData.error) {
            this._processError(jsonData, callbacks);
        }
    }

    /**
     * Process a message object
     */
    private _processMessage(message: any, callbacks: MessageCallbacks): void {
        // Process token usage
        if (message.usage) {
            this._updateTokens(message.usage, callbacks);
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
        console.log('[MessageProcessor] Processing assistant message:', message);
        if (!message.content || !Array.isArray(message.content)) return;

        message.content.forEach((content: any) => {
            if (content.type === 'text' && content.text) {
                console.log('[MessageProcessor] Assistant text:', content.text);
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
        // Store tool info for result matching
        this._lastToolUseId = content.id;
        this._lastToolName = content.name;
        this._lastToolInput = content.input;

        // Optimize tool inputs for Windows compatibility
        content.input = optimizeToolInput(
            content.name,
            content.input
        );

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
        
        console.log('[MessageProcessor] Processing tool result for tool:', toolName);
        console.log('[MessageProcessor] Tool result content type:', typeof resultContent);
        console.log('[MessageProcessor] Tool result content:', resultContent);
        
        // Handle object content (e.g., from MCP tools)
        if (typeof resultContent === 'object' && resultContent !== null) {
            // Check if this is an MCP tool result with special formatting
            if (toolName && toolName.startsWith('mcp__')) {
                resultContent = this._formatMcpToolResult(resultContent, toolName);
                console.log('[MessageProcessor] Formatted MCP result:', resultContent);
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
        console.log('[MessageProcessor] _formatMcpToolResult called with:', {
            toolName,
            resultContentType: typeof resultContent,
            isArray: Array.isArray(resultContent),
            resultContent: resultContent
        });

        // MCP tools typically return an array of content objects
        if (Array.isArray(resultContent)) {
            const textParts: string[] = [];
            let thoughtCount = 0;
            
            resultContent.forEach((item: any, index: number) => {
                console.log(`[MessageProcessor] Processing item ${index}:`, item);
                
                // Handle different item structures
                if (item && typeof item === 'object') {
                    // Check for text property
                    if (item.type === 'text' && item.text) {
                        // For sequential thinking, try to parse and format the JSON
                        if (toolName.includes('thinking')) {
                            try {
                                const thoughtData = JSON.parse(item.text);
                                console.log('[MessageProcessor] Parsed thought data:', thoughtData);
                                
                                // Format each thinking step nicely
                                console.log('[MessageProcessor] Checking thoughtData.thought:', thoughtData.thought);
                                console.log('[MessageProcessor] thoughtData keys:', Object.keys(thoughtData));
                                
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
                                    console.log('[MessageProcessor] No thought property found in thoughtData');
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
                                console.log('[MessageProcessor] Failed to parse as JSON:', e);
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
                        console.log('[MessageProcessor] Found direct text property');
                        textParts.push(item.text);
                    }
                    // Check if item itself is the content (e.g., {thought: ..., thoughtNumber: ...})
                    else if (toolName.includes('thinking') && item.thought) {
                        console.log('[MessageProcessor] Found direct thought object');
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
            console.log('[MessageProcessor] Final formatted result:', result);
            return result;
        }
        
        // Fallback to JSON stringification if not an array
        console.log('[MessageProcessor] Not an array, using JSON stringification');
        return JSON.stringify(resultContent, null, 2);
    }

    /**
     * Update token counts
     */
    private _updateTokens(usage: any, callbacks: MessageCallbacks): void {
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        
        this._totalTokensInput += inputTokens;
        this._totalTokensOutput += outputTokens;
        this._currentRequestTokensInput += inputTokens;
        this._currentRequestTokensOutput += outputTokens;

        callbacks.onTokenUpdate({
            totalTokensInput: this._totalTokensInput,
            totalTokensOutput: this._totalTokensOutput,
            currentInputTokens: inputTokens,
            currentOutputTokens: outputTokens,
            cacheCreationTokens: usage.cache_creation_input_tokens,
            cacheReadTokens: usage.cache_read_input_tokens
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