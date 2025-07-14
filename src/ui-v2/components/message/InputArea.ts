/**
 * InputArea Component
 * The area at the bottom of the chat view for user input.
 */

import { Component } from '../Component';
import { Textarea } from '../base/Input';
import { Button } from '../base/Button';
import { InputAreaProps } from '../../types';

interface InputAreaState {
  inputValue: string;
}

export class InputArea extends Component<InputAreaProps, InputAreaState> {
  private inputComponent: Textarea | null = null;
  private sendButton: Button | null = null;

  protected getInitialState(): InputAreaState {
    return {
      inputValue: '',
    };
  }
  
  protected onMount(): void {
    this.inputComponent = new Textarea({
      placeholder: 'Type a message...',
      value: this.state.inputValue,
      onChange: (value: string) => this.setState({ inputValue: value }),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      }
    });
    
    this.sendButton = new Button({
      label: 'Send',
      icon: 'send',
      onClick: () => this.handleSend(),
      disabled: this.props.isProcessing || this.state.inputValue.trim() === '',
    });

    const inputContainer = this.element?.querySelector('.input-container');
    const buttonContainer = this.element?.querySelector('.button-container');

    if(inputContainer) this.inputComponent.mount(inputContainer as HTMLElement);
    if(buttonContainer) this.sendButton.mount(buttonContainer as HTMLElement);
  }
  
  protected onStateChange(prevState: InputAreaState, newState: InputAreaState): void {
      if(prevState.inputValue !== newState.inputValue) {
          this.sendButton?.setProps({ disabled: this.props.isProcessing || newState.inputValue.trim() === '' });
      }
  }

  protected onPropsChange(prevProps: InputAreaProps, newProps: InputAreaProps): void {
      if(prevProps.isProcessing !== newProps.isProcessing) {
          this.inputComponent?.setProps({ disabled: newProps.isProcessing });
          this.sendButton?.setProps({ disabled: newProps.isProcessing || this.state.inputValue.trim() === '' });
      }
  }

  private handleSend(): void {
    if (this.props.isProcessing || this.state.inputValue.trim() === '') return;
    this.props.onSendMessage(this.state.inputValue);
    this.setState({ inputValue: '' });
    this.inputComponent?.setProps({ value: '' });
  }

  render(): string {
    return `
      <div class="input-area">
        <div class="input-container"></div>
        <div class="button-container"></div>
      </div>
    `;
  }
} 