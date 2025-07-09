/**
 * Icon Component
 * Displays icons with consistent styling
 */

import { Component } from '../Component';
import { ComponentProps } from '../../types';

export interface IconProps extends ComponentProps {
  name: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  color?: string;
  spin?: boolean;
  title?: string;
}

// Icon mapping - maps icon names to Unicode or emoji
const ICON_MAP: Record<string, string> = {
  // UI Icons
  'settings': '⚙️',
  'close': '✕',
  'check': '✓',
  'plus': '+',
  'minus': '-',
  'arrow-up': '↑',
  'arrow-down': '↓',
  'arrow-left': '←',
  'arrow-right': '→',
  'chevron-up': '⌃',
  'chevron-down': '⌄',
  'chevron-left': '‹',
  'chevron-right': '›',
  'menu': '☰',
  'dots': '⋯',
  'search': '🔍',
  'filter': '⊕',
  
  // File Icons
  'file': '📄',
  'folder': '📁',
  'folder-open': '📂',
  'image': '🖼️',
  'code': '💻',
  'document': '📃',
  
  // Action Icons
  'copy': '📋',
  'paste': '📌',
  'cut': '✂️',
  'save': '💾',
  'download': '⬇',
  'upload': '⬆',
  'refresh': '🔄',
  'sync': '🔁',
  'undo': '↶',
  'redo': '↷',
  'delete': '🗑️',
  'edit': '✏️',
  
  // Status Icons
  'info': 'ℹ️',
  'warning': '⚠️',
  'error': '❌',
  'success': '✅',
  'question': '❓',
  'help': '❔',
  'loading': '⏳',
  
  // Communication Icons
  'message': '💬',
  'chat': '💭',
  'send': '📤',
  'receive': '📥',
  'mail': '✉️',
  'notification': '🔔',
  
  // Tool Icons
  'tool': '🔧',
  'wrench': '🔧',
  'hammer': '🔨',
  'gear': '⚙️',
  'terminal': '⌨️',
  'command': '⌘',
  
  // AI/Claude Icons
  'claude': '🤖',
  'ai': '🤖',
  'brain': '🧠',
  'sparkles': '✨',
  'magic': '🪄',
  
  // Data Icons
  'database': '🗄️',
  'chart': '📊',
  'graph': '📈',
  'analytics': '📊',
  
  // User Icons
  'user': '👤',
  'users': '👥',
  'profile': '👤',
  'account': '👤',
  
  // Time Icons
  'clock': '🕐',
  'calendar': '📅',
  'history': '🕐',
  'time': '⏰',
  
  // Other Icons
  'book': '📚',
  'bookmark': '🔖',
  'star': '⭐',
  'heart': '❤️',
  'flag': '🚩',
  'pin': '📍',
  'link': '🔗',
  'lock': '🔒',
  'unlock': '🔓',
  'key': '🔑',
  'shield': '🛡️',
  'bug': '🐛',
  'rocket': '🚀',
  'fire': '🔥',
  'zap': '⚡',
  'sun': '☀️',
  'moon': '🌙',
  'cloud': '☁️',
  'camera': '📷'
};

export class Icon extends Component<IconProps> {
  protected getDefaultProps(): Partial<IconProps> {
    return {
      size: 'medium',
      spin: false
    };
  }

  render(): string {
    const {
      name,
      size,
      color,
      spin,
      title,
      className,
      id
    } = this.props;

    const icon = ICON_MAP[name] || name;
    
    const classes = this.getClassNames(
      'icon',
      size && `icon-${size}`,
      spin && 'icon-spin',
      className
    );

    const style = color ? `color: ${color};` : '';

    return `
      <span
        ${id ? `id="${id}"` : ''}
        class="${classes}"
        ${title ? `title="${this.escapeHtml(title)}"` : ''}
        ${style ? `style="${style}"` : ''}
        aria-hidden="true"
      >
        ${icon}
      </span>
    `;
  }
}

/**
 * Icon helper function to get icon string
 */
export function getIcon(name: string): string {
  return ICON_MAP[name] || name;
}

/**
 * Tool-specific icon component
 */
export interface ToolIconProps extends IconProps {
  toolName: string;
}

export class ToolIcon extends Icon {
  protected getDefaultProps(): Partial<ToolIconProps> {
    return {
      ...super.getDefaultProps(),
      size: 'small'
    };
  }

  render(): string {
    const { toolName, className } = this.props;
    
    // Map tool names to appropriate icons
    const toolIconMap: Record<string, string> = {
      'bash': 'terminal',
      'read': 'file',
      'write': 'edit',
      'edit': 'edit',
      'grep': 'search',
      'find': 'search',
      'git': 'code',
      'npm': 'package',
      'node': 'code',
      'python': 'code',
      default: 'tool'
    };
    
    const iconName = toolIconMap[toolName.toLowerCase()] || toolIconMap.default;
    
    return super.render.call({
      ...this,
      props: {
        ...this.props,
        name: iconName,
        className: this.getClassNames('tool-icon', className)
      }
    });
  }
}

/**
 * Status icon component
 */
export interface StatusIconProps extends IconProps {
  status: 'success' | 'error' | 'warning' | 'info' | 'loading';
}

export class StatusIcon extends Icon {
  protected getDefaultProps(): Partial<StatusIconProps> {
    return {
      ...super.getDefaultProps(),
      status: 'info'
    };
  }

  render(): string {
    const { status, className } = this.props;
    
    const statusIconMap: Record<string, string> = {
      'success': 'success',
      'error': 'error',
      'warning': 'warning',
      'info': 'info',
      'loading': 'loading'
    };
    
    const statusColorMap: Record<string, string> = {
      'success': 'var(--vscode-testing-iconPassed)',
      'error': 'var(--vscode-testing-iconFailed)',
      'warning': 'var(--vscode-editorWarning-foreground)',
      'info': 'var(--vscode-editorInfo-foreground)',
      'loading': 'var(--vscode-foreground)'
    };
    
    return super.render.call({
      ...this,
      props: {
        ...this.props,
        name: statusIconMap[status],
        color: this.props.color || statusColorMap[status],
        spin: status === 'loading' || this.props.spin,
        className: this.getClassNames('status-icon', `status-${status}`, className)
      }
    });
  }
}