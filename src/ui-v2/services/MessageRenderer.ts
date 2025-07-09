/**
 * Message Renderer Service
 * Handles rendering of all message types in the chat interface
 */

import { UIMessage, ToolUseData, ToolResultData } from '../types';
import { 
    formatToolInputUI, 
    formatEditToolDiff, 
    formatMultiEditToolDiff, 
    formatWriteToolDiff,
    escapeHtml,
    formatFilePath,
    toggleResultExpansion
} from '../utils/formatters';
import { parseSimpleMarkdown } from '../utils/markdown';

/**
 * MessageRenderer - Renders different types of messages to the DOM
 */
export class MessageRenderer {
    private container: HTMLElement;
    private toolStatusTimer?: number;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    /**
     * Add a general message
     */
    public addMessage(content: string, type: UIMessage['type'] = 'claude'): void {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        // Add header for main message types (excluding system)
        if (type === 'user' || type === 'claude' || type === 'error') {
            const headerDiv = this.createMessageHeader(type);
            messageDiv.appendChild(headerDiv);
        }
        
        // Add content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (type === 'user' || type === 'claude' || type === 'thinking') {
            contentDiv.innerHTML = content;
        } else if (type === 'system' && content.includes('class="request-stats"')) {
            // Special handling for request stats to render HTML
            contentDiv.innerHTML = content;
        } else {
            const preElement = document.createElement('pre');
            preElement.textContent = content;
            contentDiv.appendChild(preElement);
        }
        
        messageDiv.appendChild(contentDiv);
        this.appendAndScroll(messageDiv);
    }

    /**
     * Add a tool use message
     */
    public addToolUseMessage(data: ToolUseData): void {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message tool';
        
        // Create modern header with icon
        const headerDiv = document.createElement('div');
        headerDiv.className = 'tool-header';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'tool-icon';
        
        // Set appropriate icon for different tools
        let icon = '🔧';
        if (data.toolName && data.toolName.startsWith('mcp__')) {
            if (data.toolName.includes('thinking')) {
                icon = '🧠';
            } else if (data.toolName.includes('search')) {
                icon = '🔍';
            } else if (data.toolName.includes('read')) {
                icon = '📖';
            } else if (data.toolName.includes('write')) {
                icon = '✍️';
            } else {
                icon = '⚙️';
            }
        }
        iconDiv.textContent = icon;
        
        const toolInfoElement = document.createElement('div');
        toolInfoElement.className = 'tool-info';
        let toolName = data.toolInfo.replace('🔧 Executing: ', '');
        
        // Replace with more user-friendly names
        if (toolName === 'TodoWrite') {
            toolName = 'Update Todos';
        } else if (data.toolName && data.toolName.startsWith('mcp__')) {
            // Extract MCP tool name and make it more readable
            const parts = data.toolName.split('__');
            if (parts.length >= 3) {
                const serverName = parts[1];
                const toolAction = parts[2];
                
                // Create readable name
                if (toolAction === 'sequentialthinking') {
                    toolName = 'Sequential Thinking';
                } else {
                    // Capitalize first letter and add spaces
                    toolName = toolAction.replace(/([A-Z])/g, ' $1').trim();
                    toolName = toolName.charAt(0).toUpperCase() + toolName.slice(1);
                    toolName = `${toolName} (${serverName})`;
                }
            }
        }
        toolInfoElement.textContent = toolName;
        
        headerDiv.appendChild(iconDiv);
        headerDiv.appendChild(toolInfoElement);
        messageDiv.appendChild(headerDiv);
        
        if (data.rawInput) {
            const inputElement = document.createElement('div');
            inputElement.className = 'tool-input';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'tool-input-content';
            
            // Handle TodoWrite specially or format raw input
            if (data.toolName === 'TodoWrite' && data.rawInput.todos) {
                let todoHtml = 'Todo List Update:';
                for (const todo of data.rawInput.todos) {
                    const status = todo.status === 'completed' ? '✅' :
                        todo.status === 'in_progress' ? '🔄' : '⏳';
                    todoHtml += '\n' + status + ' ' + todo.content + ' <span class="priority-badge ' + todo.priority + '">' + todo.priority + '</span>';
                }
                contentDiv.innerHTML = todoHtml;
            } else {
                // Format raw input with expandable content for long values
                // Use diff format for Edit, MultiEdit, and Write tools, regular format for others
                if (data.toolName === 'Edit') {
                    contentDiv.innerHTML = formatEditToolDiff(data.rawInput);
                } else if (data.toolName === 'MultiEdit') {
                    contentDiv.innerHTML = formatMultiEditToolDiff(data.rawInput);
                } else if (data.toolName === 'Write') {
                    contentDiv.innerHTML = formatWriteToolDiff(data.rawInput);
                } else {
                    contentDiv.innerHTML = formatToolInputUI(data.rawInput);
                }
            }
            
            inputElement.appendChild(contentDiv);
            messageDiv.appendChild(inputElement);
        } else if (data.toolInput) {
            // Fallback for pre-formatted input
            const inputElement = document.createElement('div');
            inputElement.className = 'tool-input';
            
            const labelDiv = document.createElement('div');
            labelDiv.className = 'tool-input-label';
            labelDiv.textContent = 'INPUT';
            inputElement.appendChild(labelDiv);
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'tool-input-content';
            contentDiv.textContent = data.toolInput;
            inputElement.appendChild(contentDiv);
            messageDiv.appendChild(inputElement);
        }
        
        this.appendAndScroll(messageDiv);
    }

    /**
     * Add a tool result message
     */
    public addToolResultMessage(data: ToolResultData): void {
        // Clear tool status when result is received
        this.clearToolStatus();
        
        // For tools with hidden flag, just hide loading state
        if (data.hidden && !data.isError) {
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = data.isError ? 'message error' : 'message tool-result';
        
        // Create header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = data.isError ? 'message-icon error' : 'message-icon';
        iconDiv.style.background = data.isError ? 
            'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' : 
            'linear-gradient(135deg, #1cc08c 0%, #16a974 100%)';
        iconDiv.textContent = data.isError ? '❌' : '✅';
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'message-label';
        labelDiv.textContent = data.isError ? 'Error' : 'Result';
        
        headerDiv.appendChild(iconDiv);
        headerDiv.appendChild(labelDiv);
        messageDiv.appendChild(headerDiv);
        
        // Add content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Check if it's a tool result and truncate appropriately
        let content = data.content;
        
        // Special handling for MCP thinking tools - render as Markdown
        if (data.toolName && data.toolName.startsWith('mcp__') && data.toolName.includes('thinking')) {
            // Parse and render as Markdown
            contentDiv.innerHTML = parseSimpleMarkdown(content);
        } else if (content.length > 200 && !data.isError) {
            const truncateAt = 197;
            const truncated = content.substring(0, truncateAt);
            const resultId = 'result_' + Math.random().toString(36).substr(2, 9);
            
            const preElement = document.createElement('pre');
            preElement.innerHTML = '<span id="' + resultId + '_visible">' + escapeHtml(truncated) + '</span>' +
                                   '<span id="' + resultId + '_ellipsis">...</span>' +
                                   '<span id="' + resultId + '_hidden" style="display: none;">' + escapeHtml(content.substring(truncateAt)) + '</span>';
            contentDiv.appendChild(preElement);
            
            // Add expand button container
            const expandContainer = document.createElement('div');
            expandContainer.className = 'diff-expand-container';
            const expandButton = document.createElement('button');
            expandButton.className = 'diff-expand-btn';
            expandButton.textContent = 'Show more';
            expandButton.setAttribute('onclick', 'toggleResultExpansion(\'' + resultId + '\')');
            expandContainer.appendChild(expandButton);
            contentDiv.appendChild(expandContainer);
        } else {
            const preElement = document.createElement('pre');
            preElement.textContent = content;
            contentDiv.appendChild(preElement);
        }
        
        messageDiv.appendChild(contentDiv);
        this.appendAndScroll(messageDiv);
    }

    /**
     * Show tool status message
     */
    public showToolStatus(message: string): void {
        this.clearToolStatus();
        
        const statusDiv = document.createElement('div');
        statusDiv.className = 'tool-status';
        statusDiv.id = 'toolStatus';
        statusDiv.innerHTML = `
            <div class="tool-status-content">
                <div class="tool-status-spinner"></div>
                <span>${message}</span>
            </div>
        `;
        
        this.container.appendChild(statusDiv);
        this.container.scrollTop = this.container.scrollHeight;
        
        // Auto-hide after 30 seconds
        this.toolStatusTimer = window.setTimeout(() => {
            this.clearToolStatus();
        }, 30000);
    }

    /**
     * Clear tool status message
     */
    public clearToolStatus(): void {
        if (this.toolStatusTimer) {
            clearTimeout(this.toolStatusTimer);
            this.toolStatusTimer = undefined;
        }
        
        const statusDiv = document.getElementById('toolStatus');
        if (statusDiv) {
            statusDiv.remove();
        }
    }

    /**
     * Clear all messages
     */
    public clear(): void {
        this.container.innerHTML = '';
    }

    /**
     * Private: Create message header
     */
    private createMessageHeader(type: UIMessage['type']): HTMLElement {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = `message-icon ${type}`;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'message-label';
        
        // Set icon and label based on type
        switch(type) {
            case 'user':
                iconDiv.textContent = '👤';
                labelDiv.textContent = 'You';
                break;
            case 'claude':
                iconDiv.textContent = '🤖';
                labelDiv.textContent = 'Claude';
                break;
            case 'error':
                iconDiv.textContent = '⚠️';
                labelDiv.textContent = 'Error';
                break;
        }
        
        // Add copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.title = 'Copy message';
        copyBtn.onclick = () => this.copyMessageContent(headerDiv.parentElement!);
        copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
        
        headerDiv.appendChild(iconDiv);
        headerDiv.appendChild(labelDiv);
        headerDiv.appendChild(copyBtn);
        
        return headerDiv;
    }

    /**
     * Private: Copy message content
     */
    private copyMessageContent(messageDiv: HTMLElement): void {
        const contentDiv = messageDiv.querySelector('.message-content');
        if (contentDiv) {
            const text = contentDiv.textContent || '';
            navigator.clipboard.writeText(text).then(() => {
                // Visual feedback
                const copyBtn = messageDiv.querySelector('.copy-btn');
                if (copyBtn) {
                    copyBtn.innerHTML = '✓';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
                    }, 1000);
                }
            });
        }
    }

    /**
     * Private: Append message and scroll to bottom
     */
    private appendAndScroll(element: HTMLElement): void {
        this.container.appendChild(element);
        this.container.scrollTop = this.container.scrollHeight;
    }
}

// Export singleton instance (optional - can be created per UI instance)
export const createMessageRenderer = (container: HTMLElement) => new MessageRenderer(container);