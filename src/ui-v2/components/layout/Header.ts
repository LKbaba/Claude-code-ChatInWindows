/**
 * Header Component
 * Application header with title, status, and actions
 */

import { Component } from '../Component';
import { ComponentProps } from '../../types';
import { IconButton } from '../base/Button';
import { Icon } from '../base/Icon';

export interface HeaderProps extends ComponentProps {
  title?: string;
  showSessionInfo?: boolean;
  sessionId?: string;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  onSettingsClick?: () => void;
  onStatsClick?: () => void;
  onHistoryClick?: () => void;
  onNewSessionClick?: () => void;
}

export class Header extends Component<HeaderProps> {
  protected getDefaultProps(): Partial<HeaderProps> {
    return {
      title: 'Claude Code Chat',
      showSessionInfo: true,
      tokens: {
        input: 0,
        output: 0,
        total: 0
      },
      cost: 0
    };
  }

  protected onMount(): void {
    // Mount icon buttons
    this.mountIconButtons();
  }

  private mountIconButtons(): void {
    const buttonConfigs = [
      { id: 'historyBtn', icon: 'book', title: 'Conversation History', onClick: this.props.onHistoryClick },
      { id: 'statsBtn', icon: 'chart', title: 'Usage Statistics', onClick: this.props.onStatsClick },
      { id: 'settingsBtn', icon: 'settings', title: 'Settings', onClick: this.props.onSettingsClick }
    ];

    buttonConfigs.forEach(config => {
      if (config.onClick) {
        const container = this.element?.querySelector(`#${config.id}-container`);
        if (container) {
          const button = new IconButton({
            icon: config.icon,
            title: config.title,
            onClick: config.onClick
          });
          button.mount(container as HTMLElement);
        }
      }
    });

    // Mount new session button if handler provided
    if (this.props.onNewSessionClick) {
      const newSessionContainer = this.element?.querySelector('#newSessionBtn-container');
      if (newSessionContainer) {
        // Button creation is handled in render method with inline onclick
        // For simplicity, using inline onclick in render method
      }
    }
  }

  render(): string {
    const {
      title,
      showSessionInfo,
      sessionId,
      tokens,
      cost,
      onNewSessionClick,
      className,
      id
    } = this.props;

    const classes = this.getClassNames('header', className);

    const tokenDisplay = showSessionInfo && tokens ? `
      <div class="token-display" id="tokenDisplay">
        <span class="token-item">
          <span class="token-label">Input:</span>
          <span id="inputTokens">${tokens.input}</span>
        </span>
        <span class="token-item">
          <span class="token-label">Output:</span>
          <span id="outputTokens">${tokens.output}</span>
        </span>
        <span class="token-item">
          <span class="token-label">Cost:</span>
          $<span id="totalCost">${(cost || 0).toFixed(2)}</span>
        </span>
      </div>
    ` : '';

    const sessionBadge = showSessionInfo && sessionId ? `
      <div class="session-badge">
        <span class="session-icon">💬</span>
        <span class="session-id">${sessionId}</span>
      </div>
    ` : '';

    return `
      <div ${id ? `id="${id}"` : ''} class="${classes}">
        <div class="header-left">
          <h2>${title}</h2>
          ${sessionBadge}
          ${tokenDisplay}
        </div>
        <div class="header-right">
          <div id="historyBtn-container"></div>
          <div id="statsBtn-container"></div>
          <div id="settingsBtn-container"></div>
          ${onNewSessionClick ? `
            <button class="btn btn-primary" id="newSessionBtn" onclick="${this.componentId}_newSession()">
              New Chat
            </button>
          ` : ''}
        </div>
      </div>
      ${onNewSessionClick ? `
        <script>
          function ${this.componentId}_newSession() {
            ${onNewSessionClick.toString()}();
          }
        </script>
      ` : ''}
    `;
  }
}

/**
 * Compact Header Component
 * Smaller header for embedded contexts
 */
export class CompactHeader extends Header {
  protected getDefaultProps(): Partial<HeaderProps> {
    return {
      ...super.getDefaultProps(),
      showSessionInfo: false
    };
  }

  render(): string {
    const { title, className } = this.props;
    
    const classes = this.getClassNames('header', 'header-compact', className);

    return `
      <div class="${classes}">
        <h3>${title}</h3>
        <div class="header-actions">
          <div id="settingsBtn-container"></div>
        </div>
      </div>
    `;
  }
}