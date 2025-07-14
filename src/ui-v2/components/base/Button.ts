/**
 * Button Component
 * Reusable button component with multiple variants
 */

import { Component } from '../Component';
import { ButtonProps } from '../../types';

export class Button extends Component<ButtonProps> {
  protected getDefaultProps(): Partial<ButtonProps> {
    return {
      variant: 'primary',
      size: 'medium',
      disabled: false,
      icon: undefined,
      children: 'Button'
    };
  }

  protected onMount(): void {
    // Add click event listener
    if (this.props.onClick && !this.props.disabled) {
      this.addEventListener('button', 'click', this.handleClick.bind(this));
    }
  }

  protected onUnmount(): void {
    // Remove click event listener
    if (this.props.onClick) {
      this.removeEventListener('button', 'click', this.handleClick.bind(this));
    }
  }

  private handleClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    
    if (this.props.onClick && !this.props.disabled) {
      this.props.onClick();
    }
  }

  render(): string {
    const {
      variant,
      size,
      disabled,
      icon,
      children,
      className,
      id
    } = this.props;

    const classes = this.getClassNames(
      'btn',
      variant && `btn-${variant}`,
      size && `btn-${size}`,
      disabled && 'disabled',
      className
    );

    const iconHtml = icon ? `<span class="btn-icon">${icon}</span>` : '';
    const content = typeof children === 'string' ? children : this.renderChildren();

    return `
      <button
        ${id ? `id="${id}"` : ''}
        class="${classes}"
        ${disabled ? 'disabled' : ''}
        type="button"
      >
        ${iconHtml}
        ${content}
      </button>
    `;
  }
}

/**
 * Icon Button Component
 * Button that only shows an icon
 */
export class IconButton extends Button {
  protected getDefaultProps(): Partial<ButtonProps> {
    return {
      ...super.getDefaultProps(),
      variant: 'icon',
      size: 'small',
      children: ''
    };
  }

  render(): string {
    const {
      icon,
      disabled,
      className,
      id,
      title
    } = this.props;

    const classes = this.getClassNames(
      'btn',
      'btn-icon',
      'icon-button',
      disabled && 'disabled',
      className
    );

    if (!icon) {
      console.warn('IconButton requires an icon prop');
    }

    return `
      <button
        ${id ? `id="${id}"` : ''}
        class="${classes}"
        ${disabled ? 'disabled' : ''}
        ${title ? `title="${this.escapeHtml(title)}"` : ''}
        type="button"
      >
        ${icon || '?'}
      </button>
    `;
  }
}

/**
 * Button Group Component
 * Groups multiple buttons together
 */
import { ComponentProps } from '../../types';

export interface ButtonGroupProps extends ComponentProps {
  buttons: ButtonProps[];
  orientation?: 'horizontal' | 'vertical';
}

export class ButtonGroup extends Component<ButtonGroupProps> {
  protected getDefaultProps(): Partial<ButtonGroupProps> {
    return {
      buttons: [],
      orientation: 'horizontal'
    };
  }

  protected onMount(): void {
    // Mount button components
    this.props.buttons.forEach((buttonProps, index) => {
      const button = new Button(buttonProps);
      this.children.push(button);
      
      const container = this.element?.querySelector(`[data-button-index="${index}"]`);
      if (container) {
        button.mount(container as HTMLElement);
      }
    });
  }

  render(): string {
    const { buttons, orientation, className, id } = this.props;

    const classes = this.getClassNames(
      'btn-group',
      orientation === 'vertical' && 'btn-group-vertical',
      className
    );

    return `
      <div ${id ? `id="${id}"` : ''} class="${classes}">
        ${buttons.map((_, index) => 
          `<div data-button-index="${index}"></div>`
        ).join('')}
      </div>
    `;
  }
}