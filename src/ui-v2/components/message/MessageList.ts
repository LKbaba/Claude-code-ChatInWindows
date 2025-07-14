/**
 * MessageList Component
 * Container for displaying a list of messages with scrolling
 */

import { Component } from '../Component';
import { ComponentProps } from '../../types';
import { Message, SystemMessage, ThinkingMessage } from './Message';
import type { MessageProps, ThinkingMessageProps } from './Message';

export interface MessageData {
  id: string;
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
  thinkingContent?: string;
}

export interface MessageListProps extends ComponentProps {
  messages: MessageData[];
  autoScroll?: boolean;
  showWelcome?: boolean;
  welcomeMessage?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  onMessageRestore?: (messageId: string) => void;
  onMessageCopy?: (content: string) => void;
  onMessageRetry?: (messageId: string) => void;
}

export class MessageList extends Component<MessageListProps> {
  private messageComponents: Map<string, Component> = new Map();
  private scrollContainer: HTMLElement | null = null;
  private shouldAutoScroll: boolean = true;

  protected getDefaultProps(): Partial<MessageListProps> {
    return {
      messages: [],
      autoScroll: true,
      showWelcome: true,
      welcomeMessage: 'Welcome to Claude Code Chat! How can I help you today?',
      isLoading: false,
      loadingMessage: 'Claude is thinking...'
    };
  }

  protected onMount(): void {
    this.scrollContainer = this.element?.querySelector('.message-list-container') as HTMLElement;
    
    // Setup scroll event listener for auto-scroll detection
    if (this.scrollContainer) {
      this.scrollContainer.addEventListener('scroll', this.handleScroll.bind(this));
    }

    // Mount existing messages
    this.mountMessages();

    // Initial scroll to bottom if enabled
    if (this.props.autoScroll) {
      this.scrollToBottom();
    }
  }

  protected onUnmount(): void {
    // Unmount all message components
    this.messageComponents.forEach(component => {
      component.unmount();
    });
    this.messageComponents.clear();

    if (this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll', this.handleScroll.bind(this));
    }
  }

  protected onUpdate(prevProps: MessageListProps): void {
    // Check if messages have changed
    if (prevProps.messages !== this.props.messages) {
      this.updateMessages(prevProps.messages);
    }

    // Scroll to bottom if new messages added and auto-scroll is enabled
    if (this.shouldAutoScroll && this.props.autoScroll) {
      requestAnimationFrame(() => this.scrollToBottom());
    }
  }

  private handleScroll(): void {
    if (!this.scrollContainer) return;

    // Check if user has scrolled up
    const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    this.shouldAutoScroll = isAtBottom;
  }

  private scrollToBottom(): void {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
    }
  }

  private mountMessages(): void {
    this.props.messages.forEach((message, index) => {
      const container = this.element?.querySelector(`[data-message-index="${index}"]`);
      if (container && !this.messageComponents.has(message.id)) {
        const messageComponent = this.createMessageComponent(message);
        messageComponent.mount(container as HTMLElement);
        this.messageComponents.set(message.id, messageComponent);
      }
    });
  }

  private updateMessages(prevMessages: MessageData[]): void {
    const prevIds = new Set(prevMessages.map(m => m.id));
    const currentIds = new Set(this.props.messages.map(m => m.id));

    // Remove messages that no longer exist
    prevIds.forEach(id => {
      if (!currentIds.has(id)) {
        const component = this.messageComponents.get(id);
        if (component) {
          component.unmount();
          this.messageComponents.delete(id);
        }
      }
    });

    // Add new messages
    this.props.messages.forEach((message, index) => {
      if (!prevIds.has(message.id)) {
        const container = this.element?.querySelector(`[data-message-index="${index}"]`);
        if (container) {
          const messageComponent = this.createMessageComponent(message);
          messageComponent.mount(container as HTMLElement);
          this.messageComponents.set(message.id, messageComponent);
        }
      }
    });

    // Update existing messages if needed
    this.props.messages.forEach(message => {
      if (prevIds.has(message.id)) {
        const component = this.messageComponents.get(message.id);
        if (component) {
          // Update component props if needed
          component.setProps(this.createMessageProps(message));
        }
      }
    });
  }

  private createMessageComponent(message: MessageData): Component {
    const props = this.createMessageProps(message);

    if (message.role === 'system') {
      return new SystemMessage(props);
    } else if (message.thinkingContent) {
      return new ThinkingMessage(props as ThinkingMessageProps);
    } else {
      return new Message(props);
    }
  }

  private createMessageProps(message: MessageData): MessageProps {
    return {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      isStreaming: message.isStreaming,
      error: message.error,
      tokens: message.tokens,
      cost: message.cost,
      sessionId: message.sessionId,
      messageId: message.id,
      onRestore: this.props.onMessageRestore,
      onCopy: this.props.onMessageCopy,
      onRetry: message.error ? () => this.props.onMessageRetry?.(message.id) : undefined
    };
  }

  render(): string {
    const {
      messages,
      showWelcome,
      welcomeMessage,
      isLoading,
      loadingMessage,
      className,
      id
    } = this.props;

    const classes = this.getClassNames(
      'message-list',
      className
    );

    const showWelcomeMessage = showWelcome && messages.length === 0 && !isLoading;

    return `
      <div ${id ? `id="${id}"` : ''} class="${classes}">
        <div class="message-list-container">
          ${showWelcomeMessage ? `
            <div class="welcome-message">
              <div class="welcome-icon">👋</div>
              <div class="welcome-text">${this.escapeHtml(welcomeMessage || '')}</div>
              <div class="welcome-suggestions">
                <h4>Try asking me to:</h4>
                <ul>
                  <li>Explain a piece of code</li>
                  <li>Help debug an error</li>
                  <li>Refactor some code</li>
                  <li>Write tests for a function</li>
                  <li>Create a new feature</li>
                </ul>
              </div>
            </div>
          ` : ''}
          
          ${messages.map((message, index) => `
            <div data-message-index="${index}" class="message-wrapper"></div>
          `).join('')}
          
          ${isLoading ? `
            <div class="loading-message">
              <div class="loading-spinner">⏳</div>
              <div class="loading-text">${this.escapeHtml(loadingMessage || '')}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}

/**
 * Compact MessageList Component
 * Smaller version for embedded contexts
 */
export class CompactMessageList extends MessageList {
  protected getDefaultProps(): Partial<MessageListProps> {
    return {
      ...super.getDefaultProps(),
      showWelcome: false
    };
  }

  render(): string {
    const { messages, isLoading, className } = this.props;

    const classes = this.getClassNames(
      'message-list',
      'message-list-compact',
      className
    );

    return `
      <div class="${classes}">
        <div class="message-list-container">
          ${messages.map((message, index) => `
            <div data-message-index="${index}" class="message-wrapper"></div>
          `).join('')}
          
          ${isLoading ? `
            <div class="loading-indicator">
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}