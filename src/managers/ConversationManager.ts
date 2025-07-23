import * as vscode from 'vscode';
import * as path from 'path';

export interface ConversationMessage {
    timestamp: string;
    messageType: string;
    data: any;
}

export interface ConversationIndex {
    filename: string;
    sessionId: string;
    startTime: string;
    endTime: string;
    messageCount: number;
    totalCost: number;
    firstUserMessage: string;
    lastUserMessage: string;
}

export interface ConversationData {
    sessionId: string;
    startTime: string | undefined;
    endTime: string;
    messageCount: number;
    totalCost: number;
    totalTokens: {
        input: number;
        output: number;
    };
    messages: ConversationMessage[];
    filename: string;
}

export class ConversationManager {
    private _conversationsPath: string | undefined;
    private _currentConversation: ConversationMessage[] = [];
    private _conversationStartTime: string | undefined;
    private _conversationIndex: ConversationIndex[] = [];

    constructor(private readonly _context: vscode.ExtensionContext) {
        // Load conversation index from workspace state
        this._conversationIndex = this._context.workspaceState.get('claude.conversationIndex', []);
    }

    get currentConversation(): ConversationMessage[] {
        return this._currentConversation;
    }

    get conversationStartTime(): string | undefined {
        return this._conversationStartTime;
    }

    get conversationIndex(): ConversationIndex[] {
        return this._conversationIndex;
    }

    clearCurrentConversation(): void {
        this._currentConversation = [];
        this._conversationStartTime = undefined;
    }

    addMessage(message: ConversationMessage): void {
        // Initialize conversation if this is the first message
        if (this._currentConversation.length === 0) {
            this._conversationStartTime = new Date().toISOString();
        }

        this._currentConversation.push(message);
    }

    async initializeConversations(): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {return;}

            const storagePath = this._context.storageUri?.fsPath;
            if (!storagePath) {return;}

            this._conversationsPath = path.join(storagePath, 'conversations');

            // Create conversations directory if it doesn't exist
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(this._conversationsPath));
            } catch {
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(this._conversationsPath));
                // DEBUG: console.log(`Created conversations directory at: ${this._conversationsPath}`);
            }
        } catch (error: any) {
            console.error('Failed to initialize conversations directory:', error.message);
        }
    }

    async saveCurrentConversation(
        currentSessionId: string | undefined,
        totalCost: number,
        totalTokensInput: number,
        totalTokensOutput: number
    ): Promise<void> {
        if (!this._conversationsPath || this._currentConversation.length === 0) {return;}
        if(!currentSessionId) {return;}

        try {
            // Create filename from first user message and timestamp
            const firstUserMessage = this._currentConversation.find(m => m.messageType === 'userInput');
            const firstMessage = firstUserMessage ? firstUserMessage.data : 'conversation';
            const startTime = this._conversationStartTime || new Date().toISOString();
            const sessionId = currentSessionId || 'unknown';

            // Clean and truncate first message for filename
            const cleanMessage = firstMessage
                .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
                .replace(/\s+/g, '-') // Replace spaces with dashes
                .substring(0, 50) // Limit length
                .toLowerCase();

            const datePrefix = startTime.substring(0, 16).replace('T', '_').replace(/:/g, '-');
            const filename = `${datePrefix}_${cleanMessage}.json`;

            const conversationData: ConversationData = {
                sessionId: sessionId,
                startTime: this._conversationStartTime,
                endTime: new Date().toISOString(),
                messageCount: this._currentConversation.length,
                totalCost: totalCost,
                totalTokens: {
                    input: totalTokensInput,
                    output: totalTokensOutput
                },
                messages: this._currentConversation,
                filename
            };

            const filePath = path.join(this._conversationsPath, filename);
            const content = new TextEncoder().encode(JSON.stringify(conversationData, null, 2));
            await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), content);

            // Update conversation index
            this.updateConversationIndex(filename, conversationData);

            // DEBUG: console.log(`Saved conversation: ${filename}`, this._conversationsPath);
        } catch (error: any) {
            console.error('Failed to save conversation:', error.message);
        }
    }

    private updateConversationIndex(filename: string, conversationData: ConversationData): void {
        // Extract first and last user messages
        const userMessages = conversationData.messages.filter((m: any) => m.messageType === 'userInput');
        const firstUserMessage = userMessages.length > 0 ? userMessages[0].data : 'No user message';
        const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].data : firstUserMessage;

        // Create or update index entry
        const indexEntry: ConversationIndex = {
            filename: filename,
            sessionId: conversationData.sessionId,
            startTime: conversationData.startTime || '',
            endTime: conversationData.endTime,
            messageCount: conversationData.messageCount,
            totalCost: conversationData.totalCost,
            firstUserMessage: firstUserMessage.substring(0, 100), // Truncate for storage
            lastUserMessage: lastUserMessage.substring(0, 100)
        };

        // Remove any existing entry for this session (in case of updates)
        this._conversationIndex = this._conversationIndex.filter(entry => entry.filename !== conversationData.filename);

        // Add new entry at the beginning (most recent first)
        this._conversationIndex.unshift(indexEntry);

        // Keep only last 50 conversations to avoid workspace state bloat
        if (this._conversationIndex.length > 50) {
            this._conversationIndex = this._conversationIndex.slice(0, 50);
        }

        // Save to workspace state
        this._context.workspaceState.update('claude.conversationIndex', this._conversationIndex);
    }

    getLatestConversation(): ConversationIndex | undefined {
        return this._conversationIndex.length > 0 ? this._conversationIndex[0] : undefined;
    }

    async loadConversationHistory(filename: string): Promise<ConversationData | undefined> {
        // DEBUG: console.log("_loadConversationHistory");
        if (!this._conversationsPath) {return undefined;}

        try {
            const filePath = path.join(this._conversationsPath, filename);
            // DEBUG: console.log("filePath", filePath);
            
            let conversationData;
            try {
                const fileUri = vscode.Uri.file(filePath);
                const content = await vscode.workspace.fs.readFile(fileUri);
                conversationData = JSON.parse(new TextDecoder().decode(content));
            } catch {
                return undefined;
            }
            
            // DEBUG: console.log("conversationData", conversationData);
            // Load conversation into current state
            this._currentConversation = conversationData.messages || [];
            this._conversationStartTime = conversationData.startTime;

            return conversationData;
        } catch (error: any) {
            console.error('Failed to load conversation history:', error.message);
            return undefined;
        }
    }

    // 获取当前token使用情况
    getCurrentTokenUsage(currentTokensInput: number, currentTokensOutput: number): {
        used: number;
        total: number;
        percentage: number;
        inputTokens: number;
        outputTokens: number;
    } {
        const TOTAL_TOKENS = 200000; // Claude的200K上下文窗口
        const SAFETY_BUFFER = 10000; // 安全缓冲区，预留10K
        const effectiveTotal = TOTAL_TOKENS - SAFETY_BUFFER;
        
        const totalUsed = currentTokensInput + currentTokensOutput;
        const usedPercentage = (totalUsed / effectiveTotal) * 100;
        // 计算剩余百分比
        const remainingPercentage = Math.max(0, 100 - usedPercentage);
        
        return {
            used: totalUsed,
            total: effectiveTotal,
            percentage: Math.round(remainingPercentage), // 返回剩余百分比
            inputTokens: currentTokensInput,
            outputTokens: currentTokensOutput
        };
    }

}