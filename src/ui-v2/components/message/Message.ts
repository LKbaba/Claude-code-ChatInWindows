/**
 * Message Component
 * Displays individual chat messages with appropriate styling
 */

import { Component } from '../Component';
import { ComponentProps } from '../../types';
import { Icon } from '../base/Icon';

export interface MessageProps extends ComponentProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date | string;
  isStreaming?: boolean;
  error?: boolean;
  tokens?: {
    input?: number;
    output?: number;
  };
  cost?: number;
  sessionId?: string;
  messageId?: string;
  onRestore?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  onRetry?: () => void;
}

export class Message extends Component<MessageProps> {
  protected getDefaultProps(): Partial<MessageProps> {
    return {
      isStreaming: false,
      error: false
    };
  }

  protected onMount(): void {
    // Setup event handlers
    this.setupEventHandlers();
    
    // Apply syntax highlighting if needed
    this.applySyntaxHighlighting();
  }

  private setupEventHandlers(): void {
    // Copy button handler
    const copyBtn = this.element?.querySelector('.message-copy-btn');
    if (copyBtn && this.props.onCopy) {
      copyBtn.addEventListener('click', () => {
        if (this.props.onCopy) {
          this.props.onCopy(this.props.content);
        }
      });
    }

    // Restore button handler
    const restoreBtn = this.element?.querySelector('.message-restore-btn');
    if (restoreBtn && this.props.onRestore && this.props.messageId) {
      restoreBtn.addEventListener('click', () => {
        if (this.props.onRestore && this.props.messageId) {
          this.props.onRestore(this.props.messageId);
        }
      });
    }

    // Retry button handler
    const retryBtn = this.element?.querySelector('.message-retry-btn');
    if (retryBtn && this.props.onRetry) {
      retryBtn.addEventListener('click', () => {
        if (this.props.onRetry) {
          this.props.onRetry();
        }
      });
    }
  }

  private applySyntaxHighlighting(): void {
    // This would integrate with a syntax highlighting library
    // For now, we'll leave it as a placeholder
    const codeBlocks = this.element?.querySelectorAll('pre code');
    codeBlocks?.forEach(block => {
      // Apply highlighting
    });
  }

  private formatTimestamp(timestamp: Date | string): string {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  protected renderMessageContent(content: string): string {
    // Basic markdown-style formatting
    // This is simplified - in real implementation, use the markdown parser
    return content
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  render(): string {
    const {
      role,
      content,
      timestamp,
      isStreaming,
      error,
      tokens,
      cost,
      sessionId,
      messageId,
      onRestore,
      onCopy,
      onRetry,
      className,
      id
    } = this.props;

    const classes = this.getClassNames(
      'message',
      `message-${role}`,
      isStreaming && 'message-streaming',
      error && 'message-error',
      className
    );

    const showActions = role === 'assistant' && !isStreaming;
    const showRestoreButton = showActions && onRestore && messageId;
    const showCopyButton = showActions && onCopy;
    const showRetryButton = error && onRetry;

    const roleIcon = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : 'ℹ️';
    const roleLabel = role === 'user' ? 'You' : role === 'assistant' ? 'Claude' : 'System';

    return `
      <div ${id ? `id="${id}"` : ''} class="${classes}" data-message-id="${messageId || ''}">
        <div class="message-header">
          <div class="message-role">
            <span class="message-role-icon">${roleIcon}</span>
            <span class="message-role-label">${roleLabel}</span>
          </div>
          ${timestamp ? `
            <div class="message-timestamp">${this.formatTimestamp(timestamp)}</div>
          ` : ''}
        </div>
        
        <div class="message-content">
          ${error ? `
            <div class="message-error-content">
              <span class="error-icon">❌</span>
              <span class="error-text">${this.escapeHtml(content)}</span>
            </div>
          ` : this.renderMessageContent(content)}
          
          ${isStreaming ? `
            <span class="message-cursor">▊</span>
          ` : ''}
        </div>
        
        ${(tokens || cost !== undefined || sessionId) && !isStreaming ? `
          <div class="message-metadata">
            ${tokens ? `
              <span class="metadata-item">
                <span class="metadata-label">Tokens:</span>
                ${tokens.input ? `<span class="token-count">↓${tokens.input}</span>` : ''}
                ${tokens.output ? `<span class="token-count">↑${tokens.output}</span>` : ''}
              </span>
            ` : ''}
            ${cost !== undefined ? `
              <span class="metadata-item">
                <span class="metadata-label">Cost:</span>
                <span class="cost-amount">$${cost.toFixed(4)}</span>
              </span>
            ` : ''}
            ${sessionId ? `
              <span class="metadata-item">
                <span class="metadata-label">Session:</span>
                <span class="session-id">${sessionId}</span>
              </span>
            ` : ''}
          </div>
        ` : ''}
        
        ${showActions || showRetryButton ? `
          <div class="message-actions">
            ${showCopyButton ? `
              <button class="message-action-btn message-copy-btn" title="Copy message">
                <span class="action-icon">📋</span>
                Copy
              </button>
            ` : ''}
            ${showRestoreButton ? `
              <button class="message-action-btn message-restore-btn" title="Restore to this point">
                <span class="action-icon">⏪</span>
                Restore
              </button>
            ` : ''}
            ${showRetryButton ? `
              <button class="message-action-btn message-retry-btn" title="Retry">
                <span class="action-icon">🔄</span>
                Retry
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }
}

/**
 * System Message Component
 * Specialized message for system notifications
 */
export class SystemMessage extends Message {
  protected getDefaultProps(): Partial<MessageProps> {
    return {
      ...super.getDefaultProps(),
      role: 'system'
    };
  }

  render(): string {
    const { content, className } = this.props;
    
    const classes = this.getClassNames(
      'system-message',
      className
    );

    return `
      <div class="${classes}">
        <div class="system-message-content">
          <span class="system-icon">ℹ️</span>
          <span class="system-text">${this.escapeHtml(content)}</span>
        </div>
      </div>
    `;
  }
}

/**
 * Thinking Message Component
 * Shows Claude's thinking process
 */
export interface ThinkingMessageProps extends MessageProps {
  thinkingContent?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export class ThinkingMessage extends Message {
  protected getDefaultProps(): Partial<ThinkingMessageProps> {
    return {
      ...super.getDefaultProps(),
      role: 'assistant',
      isExpanded: false
    };
  }

  render(): string {
    const {
      content,
      thinkingContent,
      isExpanded,
      onToggleExpand,
      className
    } = this.props as ThinkingMessageProps;

    if (!thinkingContent) {
      return super.render();
    }

    const classes = this.getClassNames(
      'thinking-message',
      isExpanded && 'thinking-expanded',
      className
    );

    const messageHtml = super.render.call({
      ...this,
      props: {
        ...this.props,
        className: classes
      }
    });

    return `
      ${messageHtml}
      ${thinkingContent ? `
        <div class="thinking-section">
          <button class="thinking-toggle" onclick="${this.componentId}_toggleThinking()">
            <span class="toggle-icon">${isExpanded ? '▼' : '▶'}</span>
            <span class="toggle-label">Thinking Process</span>
          </button>
          ${isExpanded ? `
            <div class="thinking-content">
              ${this.renderMessageContent(thinkingContent)}
            </div>
          ` : ''}
        </div>
        ${onToggleExpand ? `
          <script>
            function ${this.componentId}_toggleThinking() {
              ${onToggleExpand.toString()}();
            }
          </script>
        ` : ''}
      ` : ''}
    `;
  }
}