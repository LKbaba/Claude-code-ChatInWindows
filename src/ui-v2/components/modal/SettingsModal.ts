/**
 * SettingsModal Component
 * A modal for displaying and editing extension settings.
 */

import { Modal } from './Modal';
import { AppState, SettingsModalProps } from '../../types';

interface SettingsModalState {
  isOpen: boolean;
  isAnimating: boolean;
  currentSettings: Partial<AppState['settings']>;
}

export class SettingsModal extends Modal {
  protected declare state: SettingsModalState;

  constructor(props: SettingsModalProps) {
    super({
      ...props,
      title: 'Settings',
      size: 'large',
    });
    this.state = this.getInitialState();
  }

  protected onMount() {
    super.onMount();
    this.addEventListeners();
  }

  private addEventListeners() {
    this.element?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement;
      if (target.name) {
        const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
        this.handleSettingChange(target.name, value);
      }
    });

    this.element?.querySelector('#settings-save-btn')?.addEventListener('click', () => {
      this.props.onSettingsChange(this.state.currentSettings);
      this.props.onClose();
    });
  }

  protected getInitialState(): SettingsModalState {
    return {
      ...super.getInitialState(),
      currentSettings: { ...this.props.settings }
    };
  }

  private handleSettingChange(name: string, value: any) {
    this.setState({
      currentSettings: {
        ...this.state.currentSettings,
        [name]: value
      }
    } as Partial<SettingsModalState>);
  }

  protected renderContent(): string {
    const { currentSettings } = this.state;
    // NOTE: This is a simplified example. In a real app, these would
    // likely be more robust components (Select, Toggle, etc.)
    return `
      <div class="settings-modal-content">
        <div class="settings-group">
          <h4 class="settings-group-title">Model</h4>
          <div class="settings-row">
            <label for="model-select">Claude Model</label>
            <select id="model-select" name="selectedModel">
              <option value="opus" ${currentSettings.selectedModel === 'opus' ? 'selected' : ''}>Opus</option>
              <option value="sonnet" ${currentSettings.selectedModel === 'sonnet' ? 'selected' : ''}>Sonnet</option>
              <option value="haiku" ${currentSettings.selectedModel === 'haiku' ? 'selected' : ''}>Haiku</option>
            </select>
          </div>
        </div>

        <div class="settings-group">
          <h4 class="settings-group-title">Features</h4>
          <div class="settings-row">
            <label for="plan-mode-toggle">Enable Plan Mode</label>
            <input type="checkbox" id="plan-mode-toggle" name="planModeEnabled" ${currentSettings.planModeEnabled ? 'checked' : ''}>
          </div>
          <div class="settings-row">
            <label for="thinking-mode-toggle">Enable Thinking Animation</label>
            <input type="checkbox" id="thinking-mode-toggle" name="thinkingModeEnabled" ${currentSettings.thinkingModeEnabled ? 'checked' : ''}>
          </div>
        </div>
        
        <div class="settings-footer">
            <button id="settings-save-btn" class="btn btn-primary">Save and Close</button>
        </div>
      </div>
    `;
  }
  
  public render(): string {
    this.props.content = this.renderContent();
    return super.render();
  }
} 