/**
 * Layout Component
 * Main application layout structure
 */

import { Component } from '../Component';
import { ComponentProps } from '../../types';

export interface LayoutProps extends ComponentProps {
  header?: Component | string;
  sidebar?: Component | string;
  content?: Component | string;
  footer?: Component | string;
  sidebarPosition?: 'left' | 'right';
  sidebarWidth?: string;
  showSidebar?: boolean;
}

export class Layout extends Component<LayoutProps> {
  protected getDefaultProps(): Partial<LayoutProps> {
    return {
      sidebarPosition: 'left',
      sidebarWidth: '300px',
      showSidebar: false
    };
  }

  protected onMount(): void {
    // Mount child components
    this.mountSection('header');
    this.mountSection('sidebar');
    this.mountSection('content');
    this.mountSection('footer');
  }

  private mountSection(section: 'header' | 'sidebar' | 'content' | 'footer'): void {
    const component = this.props[section];
    if (component && typeof component !== 'string') {
      const container = this.element?.querySelector(`[data-layout-${section}]`);
      if (container) {
        component.mount(container as HTMLElement);
      }
    }
  }

  render(): string {
    const {
      header,
      sidebar,
      content,
      footer,
      sidebarPosition,
      sidebarWidth,
      showSidebar,
      className,
      id
    } = this.props;

    const classes = this.getClassNames(
      'app-layout',
      showSidebar && 'has-sidebar',
      sidebarPosition && `sidebar-${sidebarPosition}`,
      className
    );

    const sidebarStyle = showSidebar ? `width: ${sidebarWidth};` : '';

    return `
      <div ${id ? `id="${id}"` : ''} class="${classes}">
        ${header ? `
          <div class="layout-header" data-layout-header>
            ${typeof header === 'string' ? header : ''}
          </div>
        ` : ''}
        
        <div class="layout-body">
          ${showSidebar && sidebar ? `
            <aside class="layout-sidebar" style="${sidebarStyle}" data-layout-sidebar>
              ${typeof sidebar === 'string' ? sidebar : ''}
            </aside>
          ` : ''}
          
          <main class="layout-content" data-layout-content>
            ${typeof content === 'string' ? content : ''}
          </main>
        </div>
        
        ${footer ? `
          <div class="layout-footer" data-layout-footer>
            ${typeof footer === 'string' ? footer : ''}
          </div>
        ` : ''}
      </div>
    `;
  }
}

/**
 * Split Layout Component
 * Layout with resizable split panels
 */
export interface SplitLayoutProps extends ComponentProps {
  panels: Array<{
    content: Component | string;
    minSize?: string;
    maxSize?: string;
    defaultSize?: string;
  }>;
  orientation?: 'horizontal' | 'vertical';
  resizable?: boolean;
}

export class SplitLayout extends Component<SplitLayoutProps> {
  protected getDefaultProps(): Partial<SplitLayoutProps> {
    return {
      panels: [],
      orientation: 'horizontal',
      resizable: true
    };
  }

  protected onMount(): void {
    // Mount panel components
    this.props.panels.forEach((panel, index) => {
      if (panel.content && typeof panel.content !== 'string') {
        const container = this.element?.querySelector(`[data-panel-${index}]`);
        if (container) {
          panel.content.mount(container as HTMLElement);
        }
      }
    });

    // Initialize resize functionality if enabled
    if (this.props.resizable) {
      this.initializeResize();
    }
  }

  private initializeResize(): void {
    // Simple resize implementation
    const splitters = this.element?.querySelectorAll('.panel-splitter');
    splitters?.forEach((splitter, index) => {
      let isResizing = false;
      let startPos = 0;
      let startSize = 0;

      const handleMouseDown = (e: MouseEvent) => {
        isResizing = true;
        startPos = this.props.orientation === 'horizontal' ? e.clientX : e.clientY;
        const panel = this.element?.querySelector(`[data-panel-${index}]`) as HTMLElement;
        if (panel) {
          startSize = this.props.orientation === 'horizontal' ? panel.offsetWidth : panel.offsetHeight;
        }
        e.preventDefault();
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        
        const currentPos = this.props.orientation === 'horizontal' ? e.clientX : e.clientY;
        const diff = currentPos - startPos;
        const panel = this.element?.querySelector(`[data-panel-${index}]`) as HTMLElement;
        
        if (panel) {
          const newSize = startSize + diff;
          if (this.props.orientation === 'horizontal') {
            panel.style.width = `${newSize}px`;
          } else {
            panel.style.height = `${newSize}px`;
          }
        }
      };

      const handleMouseUp = () => {
        isResizing = false;
      };

      splitter.addEventListener('mousedown', handleMouseDown as EventListener);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  render(): string {
    const {
      panels,
      orientation,
      resizable,
      className,
      id
    } = this.props;

    const classes = this.getClassNames(
      'split-layout',
      `split-${orientation}`,
      resizable && 'resizable',
      className
    );

    return `
      <div ${id ? `id="${id}"` : ''} class="${classes}">
        ${panels.map((panel, index) => {
          const style = panel.defaultSize ? 
            (orientation === 'horizontal' ? `width: ${panel.defaultSize};` : `height: ${panel.defaultSize};`) : 
            '';
          
          return `
            ${index > 0 && resizable ? '<div class="panel-splitter"></div>' : ''}
            <div class="panel" data-panel-${index} style="${style}">
              ${typeof panel.content === 'string' ? panel.content : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}