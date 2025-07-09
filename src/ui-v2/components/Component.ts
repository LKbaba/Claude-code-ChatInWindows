/**
 * Base Component Class
 * Abstract base class for all UI components
 */

import { VscodeApi } from '../types';

export interface ComponentProps {
  id?: string;
  className?: string;
  children?: Component[] | string;
  [key: string]: any;
}

export interface ComponentState {
  [key: string]: any;
}

export abstract class Component<P extends ComponentProps = ComponentProps, S extends ComponentState = ComponentState> {
  protected props: P;
  protected state: S;
  protected element: HTMLElement | null = null;
  protected children: Component[] = [];
  protected parent: Component | null = null;
  protected mounted: boolean = false;
  
  // Static counter for unique IDs
  private static idCounter = 0;
  protected componentId: string;

  constructor(props: P) {
    this.props = { ...this.getDefaultProps(), ...props };
    this.state = this.getInitialState();
    this.componentId = `component-${Component.idCounter++}`;
    
    // Handle children if provided
    if (props.children) {
      if (Array.isArray(props.children)) {
        this.children = props.children;
        // Set parent reference
        this.children.forEach(child => {
          child.parent = this;
        });
      }
    }
  }

  /**
   * Get default props for the component
   */
  protected getDefaultProps(): Partial<P> {
    return {};
  }

  /**
   * Get initial state for the component
   */
  protected getInitialState(): S {
    return {} as S;
  }

  /**
   * Render the component to HTML string
   */
  abstract render(): string;

  /**
   * Called after the component is mounted to the DOM
   */
  protected onMount(): void {
    // Override in subclasses
  }

  /**
   * Called before the component is unmounted from the DOM
   */
  protected onUnmount(): void {
    // Override in subclasses
  }

  /**
   * Mount the component to a container element
   */
  public mount(container: HTMLElement | string): void {
    const containerEl = typeof container === 'string' 
      ? document.getElementById(container) 
      : container;
      
    if (!containerEl) {
      throw new Error(`Container element not found: ${container}`);
    }

    // Render and insert HTML
    containerEl.innerHTML = this.render();
    
    // Store reference to root element
    this.element = containerEl.firstElementChild as HTMLElement;
    
    // Mount children
    this.mountChildren();
    
    // Call lifecycle method
    this.mounted = true;
    this.onMount();
  }

  /**
   * Mount child components
   */
  protected mountChildren(): void {
    this.children.forEach((child, index) => {
      const childContainer = this.element?.querySelector(`[data-component-slot="${index}"]`);
      if (childContainer) {
        child.mount(childContainer as HTMLElement);
      }
    });
  }

  /**
   * Unmount the component
   */
  public unmount(): void {
    if (!this.mounted) return;
    
    // Call lifecycle method
    this.onUnmount();
    
    // Unmount children
    this.children.forEach(child => child.unmount());
    
    // Remove from DOM
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    
    this.mounted = false;
  }

  /**
   * Update component state
   */
  protected setState(newState: Partial<S>): void {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...newState };
    
    if (this.mounted) {
      this.onStateChange(prevState, this.state);
      this.update();
    }
  }

  /**
   * Called when state changes
   */
  protected onStateChange(prevState: S, newState: S): void {
    // Override in subclasses
  }

  /**
   * Update component props
   */
  public setProps(newProps: Partial<P>): void {
    const prevProps = { ...this.props };
    this.props = { ...this.props, ...newProps };
    
    if (this.mounted) {
      this.onPropsChange(prevProps, this.props);
      this.update();
    }
  }

  /**
   * Called when props change
   */
  protected onPropsChange(prevProps: P, newProps: P): void {
    // Override in subclasses
  }

  /**
   * Update the component's DOM
   */
  protected update(): void {
    if (!this.element || !this.mounted) return;
    
    const parent = this.element.parentElement;
    if (!parent) return;
    
    // Re-render
    const newHtml = this.render();
    const temp = document.createElement('div');
    temp.innerHTML = newHtml;
    const newElement = temp.firstElementChild as HTMLElement;
    
    // Replace in DOM
    parent.replaceChild(newElement, this.element);
    this.element = newElement;
    
    // Re-mount children
    this.mountChildren();
  }

  /**
   * Find a child component by ID
   */
  public findChild(id: string): Component | null {
    for (const child of this.children) {
      if (child.props.id === id) {
        return child;
      }
      const found = child.findChild(id);
      if (found) return found;
    }
    return null;
  }

  /**
   * Add event listener helper
   */
  protected addEventListener(selector: string, event: string, handler: EventListener): void {
    if (!this.element) return;
    
    const elements = this.element.querySelectorAll(selector);
    elements.forEach(el => {
      el.addEventListener(event, handler);
    });
  }

  /**
   * Remove event listener helper
   */
  protected removeEventListener(selector: string, event: string, handler: EventListener): void {
    if (!this.element) return;
    
    const elements = this.element.querySelectorAll(selector);
    elements.forEach(el => {
      el.removeEventListener(event, handler);
    });
  }

  /**
   * Emit a custom event
   */
  protected emit(eventName: string, detail?: any): void {
    if (!this.element) return;
    
    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true
    });
    
    this.element.dispatchEvent(event);
  }

  /**
   * Helper to escape HTML
   */
  protected escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Helper to generate unique IDs
   */
  protected generateId(prefix: string = 'el'): string {
    return `${prefix}-${this.componentId}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Render children to HTML
   */
  protected renderChildren(): string {
    if (typeof this.props.children === 'string') {
      return this.props.children;
    }
    
    return this.children
      .map((child, index) => `<div data-component-slot="${index}">${child.render()}</div>`)
      .join('');
  }

  /**
   * Get class names string
   */
  protected getClassNames(...classes: (string | undefined | false | null)[]): string {
    return classes.filter(Boolean).join(' ');
  }

  /**
   * Get the VS Code API
   */
  protected get vscode(): VscodeApi {
    // @ts-ignore
    return window.vscode || {
      postMessage: (msg: any) => console.log('VS Code API:', msg),
      getState: () => ({}),
      setState: (state: any) => console.log('Set state:', state)
    };
  }
}