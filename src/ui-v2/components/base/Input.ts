/**
 * Input Component
 * Reusable input component with various types
 */

import { Component } from '../Component';
import { ComponentProps } from '../../types';

export interface InputProps extends ComponentProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url';
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  name?: string;
  autocomplete?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  size?: 'small' | 'medium' | 'large';
  error?: boolean;
  success?: boolean;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onEnter?: () => void;
}

interface InputState {
  value: string;
  focused: boolean;
}

export class Input extends Component<InputProps, InputState> {
  protected getDefaultProps(): Partial<InputProps> {
    return {
      type: 'text',
      value: '',
      disabled: false,
      readonly: false,
      required: false,
      size: 'medium',
      error: false,
      success: false
    };
  }

  protected getInitialState(): InputState {
    return {
      value: this.props.value || '',
      focused: false
    };
  }

  protected onMount(): void {
    const input = this.element?.querySelector('input');
    if (input) {
      input.addEventListener('input', this.handleInput.bind(this));
      input.addEventListener('focus', this.handleFocus.bind(this));
      input.addEventListener('blur', this.handleBlur.bind(this));
      input.addEventListener('keydown', this.handleKeyDown.bind(this));
    }
  }

  protected onUnmount(): void {
    const input = this.element?.querySelector('input');
    if (input) {
      input.removeEventListener('input', this.handleInput.bind(this));
      input.removeEventListener('focus', this.handleFocus.bind(this));
      input.removeEventListener('blur', this.handleBlur.bind(this));
      input.removeEventListener('keydown', this.handleKeyDown.bind(this));
    }
  }

  private handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    
    this.setState({ value });
    
    if (this.props.onChange) {
      this.props.onChange(value);
    }
  }

  private handleFocus(): void {
    this.setState({ focused: true });
    
    if (this.props.onFocus) {
      this.props.onFocus();
    }
  }

  private handleBlur(): void {
    this.setState({ focused: false });
    
    if (this.props.onBlur) {
      this.props.onBlur();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event);
    }
    
    if (event.key === 'Enter' && this.props.onEnter) {
      event.preventDefault();
      this.props.onEnter();
    }
  }

  render(): string {
    const {
      type,
      placeholder,
      disabled,
      readonly,
      required,
      name,
      autocomplete,
      maxLength,
      minLength,
      pattern,
      size,
      error,
      success,
      className,
      id
    } = this.props;
    
    const { value, focused } = this.state;

    const classes = this.getClassNames(
      'input',
      'input-field',
      size && `input-${size}`,
      error && 'input-error',
      success && 'input-success',
      focused && 'focused',
      disabled && 'disabled',
      className
    );

    return `
      <input
        ${id ? `id="${id}"` : ''}
        type="${type}"
        class="${classes}"
        value="${this.escapeHtml(value)}"
        ${placeholder ? `placeholder="${this.escapeHtml(placeholder)}"` : ''}
        ${disabled ? 'disabled' : ''}
        ${readonly ? 'readonly' : ''}
        ${required ? 'required' : ''}
        ${name ? `name="${name}"` : ''}
        ${autocomplete ? `autocomplete="${autocomplete}"` : ''}
        ${maxLength ? `maxlength="${maxLength}"` : ''}
        ${minLength ? `minlength="${minLength}"` : ''}
        ${pattern ? `pattern="${pattern}"` : ''}
      />
    `;
  }
}

/**
 * Textarea Component
 * Multi-line text input
 */
export interface TextareaProps extends Omit<InputProps, 'type'> {
  rows?: number;
  cols?: number;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  autoResize?: boolean;
}

export class Textarea extends Component<TextareaProps, InputState> {
  protected getDefaultProps(): Partial<TextareaProps> {
    return {
      value: '',
      disabled: false,
      readonly: false,
      required: false,
      size: 'medium',
      rows: 4,
      resize: 'vertical',
      autoResize: false,
      error: false,
      success: false
    };
  }

  protected getInitialState(): InputState {
    return {
      value: this.props.value || '',
      focused: false
    };
  }

  protected onMount(): void {
    const textarea = this.element?.querySelector('textarea');
    if (textarea) {
      textarea.addEventListener('input', this.handleInput.bind(this));
      textarea.addEventListener('focus', this.handleFocus.bind(this));
      textarea.addEventListener('blur', this.handleBlur.bind(this));
      textarea.addEventListener('keydown', this.handleKeyDown.bind(this));
      
      if (this.props.autoResize) {
        this.adjustHeight();
      }
    }
  }

  private handleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    const value = target.value;
    
    this.setState({ value });
    
    if (this.props.onChange) {
      this.props.onChange(value);
    }
    
    if (this.props.autoResize) {
      this.adjustHeight();
    }
  }

  private adjustHeight(): void {
    const textarea = this.element?.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }

  private handleFocus(): void {
    this.setState({ focused: true });
    
    if (this.props.onFocus) {
      this.props.onFocus();
    }
  }

  private handleBlur(): void {
    this.setState({ focused: false });
    
    if (this.props.onBlur) {
      this.props.onBlur();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event);
    }
    
    if (event.key === 'Enter' && !event.shiftKey && this.props.onEnter) {
      event.preventDefault();
      this.props.onEnter();
    }
  }

  render(): string {
    const {
      placeholder,
      disabled,
      readonly,
      required,
      name,
      maxLength,
      minLength,
      rows,
      cols,
      resize,
      autoResize,
      size,
      error,
      success,
      className,
      id
    } = this.props;
    
    const { value, focused } = this.state;

    const classes = this.getClassNames(
      'input',
      'textarea',
      size && `input-${size}`,
      error && 'input-error',
      success && 'input-success',
      focused && 'focused',
      disabled && 'disabled',
      autoResize && 'textarea-auto',
      className
    );

    const style = resize !== 'vertical' ? `resize: ${resize};` : '';

    return `
      <textarea
        ${id ? `id="${id}"` : ''}
        class="${classes}"
        ${placeholder ? `placeholder="${this.escapeHtml(placeholder)}"` : ''}
        ${disabled ? 'disabled' : ''}
        ${readonly ? 'readonly' : ''}
        ${required ? 'required' : ''}
        ${name ? `name="${name}"` : ''}
        ${maxLength ? `maxlength="${maxLength}"` : ''}
        ${minLength ? `minlength="${minLength}"` : ''}
        ${rows ? `rows="${rows}"` : ''}
        ${cols ? `cols="${cols}"` : ''}
        ${style ? `style="${style}"` : ''}
      >${this.escapeHtml(value)}</textarea>
    `;
  }
}