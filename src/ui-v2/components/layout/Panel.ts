/**
 * Panel Component
 * Container component with optional header and footer
 */

import { Component } from '../Component';
import { ComponentProps } from '../../types';

export interface PanelProps extends ComponentProps {
  title?: string;
  header?: Component | string;
  footer?: Component | string;
  content?: Component | string;
  collapsible?: boolean;
  collapsed?: boolean;
  resizable?: boolean;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  width?: string;
  height?: string;
  padding?: boolean;
  variant?: 'default' | 'bordered' | 'elevated' | 'transparent';
  onCollapse?: (collapsed: boolean) => void;
}

interface PanelState {
  collapsed: boolean;
}

export class Panel extends Component<PanelProps, PanelState> {
  protected getDefaultProps(): Partial<PanelProps> {
    return {
      collapsible: false,
      collapsed: false,
      resizable: false,
      padding: true,
      variant: 'default'
    };
  }

  protected getInitialState(): PanelState {
    return {
      collapsed: this.props.collapsed || false
    };
  }

  protected onMount(): void {
    // Mount child components
    this.mountSection('header');
    this.mountSection('content');
    this.mountSection('footer');

    // Setup collapse toggle if collapsible
    if (this.props.collapsible) {
      const toggleBtn = this.element?.querySelector('.panel-collapse-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', this.handleToggleCollapse.bind(this));
      }
    }

    // Setup resize if enabled
    if (this.props.resizable) {
      this.initializeResize();
    }
  }

  protected onUnmount(): void {
    const toggleBtn = this.element?.querySelector('.panel-collapse-toggle');
    if (toggleBtn) {
      toggleBtn.removeEventListener('click', this.handleToggleCollapse.bind(this));
    }
  }

  private mountSection(section: 'header' | 'content' | 'footer'): void {
    const component = this.props[section];
    if (component && typeof component !== 'string') {
      const container = this.element?.querySelector(`[data-panel-${section}]`);
      if (container) {
        component.mount(container as HTMLElement);
      }
    }
  }

  protected handleToggleCollapse(): void {
    const newCollapsed = !this.state.collapsed;
    this.setState({ collapsed: newCollapsed });
    
    if (this.props.onCollapse) {
      this.props.onCollapse(newCollapsed);
    }
  }

  private initializeResize(): void {
    // Add resize handles
    const handles = ['right', 'bottom', 'bottom-right'];
    handles.forEach(handle => {
      const handleElement = this.element?.querySelector(`.resize-handle-${handle}`);
      if (handleElement) {
        handleElement.addEventListener('mousedown', this.startResize.bind(this, handle) as EventListener);
      }
    });
  }

  private startResize(handle: string, e: MouseEvent): void {
    e.preventDefault();
    const panel = this.element as HTMLElement;
    if (!panel) return;

    const startWidth = panel.offsetWidth;
    const startHeight = panel.offsetHeight;
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (handle.includes('right')) {
        const newWidth = startWidth + deltaX;
        const minWidth = this.props.minWidth ? parseInt(this.props.minWidth) : 200;
        const maxWidth = this.props.maxWidth ? parseInt(this.props.maxWidth) : Infinity;
        panel.style.width = `${Math.max(minWidth, Math.min(maxWidth, newWidth))}px`;
      }

      if (handle.includes('bottom')) {
        const newHeight = startHeight + deltaY;
        const minHeight = this.props.minHeight ? parseInt(this.props.minHeight) : 100;
        const maxHeight = this.props.maxHeight ? parseInt(this.props.maxHeight) : Infinity;
        panel.style.height = `${Math.max(minHeight, Math.min(maxHeight, newHeight))}px`;
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      panel.style.userSelect = '';
    };

    panel.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  render(): string {
    const {
      title,
      header,
      footer,
      content,
      collapsible,
      resizable,
      width,
      height,
      padding,
      variant,
      className,
      id
    } = this.props;

    const { collapsed } = this.state;

    const classes = this.getClassNames(
      'panel',
      variant && `panel-${variant}`,
      collapsed && 'panel-collapsed',
      resizable && 'panel-resizable',
      !padding && 'panel-no-padding',
      className
    );

    const style = [
      width && `width: ${width}`,
      height && `height: ${height}`
    ].filter(Boolean).join('; ');

    const headerContent = header || (title ? `
      <div class="panel-title">
        ${title}
        ${collapsible ? `
          <button class="panel-collapse-toggle" aria-label="Toggle panel">
            <span class="collapse-icon">${collapsed ? '▶' : '▼'}</span>
          </button>
        ` : ''}
      </div>
    ` : '');

    return `
      <div ${id ? `id="${id}"` : ''} class="${classes}" ${style ? `style="${style}"` : ''}>
        ${headerContent ? `
          <div class="panel-header" data-panel-header>
            ${typeof header === 'string' ? headerContent : ''}
          </div>
        ` : ''}
        
        ${!collapsed ? `
          <div class="panel-body" data-panel-content>
            ${typeof content === 'string' ? content : ''}
          </div>
        ` : ''}
        
        ${footer && !collapsed ? `
          <div class="panel-footer" data-panel-footer>
            ${typeof footer === 'string' ? footer : ''}
          </div>
        ` : ''}
        
        ${resizable && !collapsed ? `
          <div class="resize-handle resize-handle-right"></div>
          <div class="resize-handle resize-handle-bottom"></div>
          <div class="resize-handle resize-handle-bottom-right"></div>
        ` : ''}
      </div>
    `;
  }
}

/**
 * Card Component
 * A specialized panel with card-like styling
 */
export interface CardProps extends PanelProps {
  image?: string;
  imageAlt?: string;
  imagePosition?: 'top' | 'bottom' | 'left' | 'right';
  actions?: Component[] | string;
}

export class Card extends Panel {
  protected getDefaultProps(): Partial<CardProps> {
    return {
      ...super.getDefaultProps(),
      variant: 'elevated',
      imagePosition: 'top'
    };
  }

  render(): string {
    const {
      title,
      image,
      imageAlt,
      imagePosition,
      content,
      actions,
      className
    } = this.props as CardProps;

    const classes = this.getClassNames(
      'card',
      imagePosition && `card-image-${imagePosition}`,
      className
    );

    const imageHtml = image ? `
      <div class="card-image">
        <img src="${this.escapeHtml(image)}" alt="${this.escapeHtml(imageAlt || '')}" />
      </div>
    ` : '';

    const actionsHtml = actions ? `
      <div class="card-actions">
        ${typeof actions === 'string' ? actions : ''}
      </div>
    ` : '';

    // Create modified props for parent render
    const modifiedProps: PanelProps = {
      ...this.props,
      className: classes,
      header: title ? `<h3 class="card-title">${title}</h3>` : undefined,
      content: `
        ${imagePosition === 'top' ? imageHtml : ''}
        ${imagePosition === 'left' ? `
          <div class="card-horizontal">
            ${imageHtml}
            <div class="card-content">${content}</div>
          </div>
        ` : imagePosition === 'right' ? `
          <div class="card-horizontal">
            <div class="card-content">${content}</div>
            ${imageHtml}
          </div>
        ` : `<div class="card-content">${content}</div>`}
        ${imagePosition === 'bottom' ? imageHtml : ''}
      `,
      footer: actionsHtml || this.props.footer
    };

    return super.render.call({ ...this, props: modifiedProps });
  }
}

/**
 * Accordion Panel Component
 * Panel that can expand/collapse with animation
 */
export interface AccordionPanelProps extends PanelProps {
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

export class AccordionPanel extends Panel {
  protected getDefaultProps(): Partial<AccordionPanelProps> {
    return {
      ...super.getDefaultProps(),
      collapsible: true,
      variant: 'bordered',
      expanded: false
    };
  }

  protected getInitialState(): PanelState {
    return {
      collapsed: !(this.props as AccordionPanelProps).expanded
    };
  }

  protected handleToggleCollapse(): void {
    const newExpanded = this.state.collapsed;
    this.setState({ collapsed: !newExpanded });
    
    const { onToggle } = this.props as AccordionPanelProps;
    if (onToggle) {
      onToggle(newExpanded);
    }
  }

  render(): string {
    const { className } = this.props;
    
    const classes = this.getClassNames(
      'accordion-panel',
      className
    );

    return super.render.call({
      ...this,
      props: {
        ...this.props,
        className: classes
      }
    });
  }
}