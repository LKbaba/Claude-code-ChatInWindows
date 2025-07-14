import { StateManager } from './StateManager';
import { VscodeApi, AppState } from '../types';

export class EventHandlers {
  private stateManager: StateManager;
  private vscode: VscodeApi;

  constructor(
    stateManager: StateManager,
    vscode: VscodeApi
  ) {
    this.stateManager = stateManager;
    this.vscode = vscode;
  }

  public registerEventListeners(): void {
    window.addEventListener('message', this.handleVsCodeMessage.bind(this));
  }

  private handleVsCodeMessage(event: MessageEvent): void {
    const message = event.data;
    switch (message.type) {
      case 'sessionInfo':
      case 'sessionResumed':
        this.stateManager.setState({ messages: message.messages, ...message.state });
        break;
      
      case 'output':
        const lastMessage = this.stateManager.getState().messages.slice(-1)[0];
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
            lastMessage.content += message.content;
            this.stateManager.setState({ messages: [...this.stateManager.getState().messages] });
        } else {
            this.stateManager.addMessage({ role: 'assistant', content: message.content, isStreaming: true, id: `msg-${Date.now()}` });
        }
        break;

      case 'setProcessing':
        this.stateManager.setState({ processing: message.processing });
        if (!message.processing) {
            const lastMessage = this.stateManager.getState().messages.slice(-1)[0];
            if (lastMessage && lastMessage.isStreaming) {
                lastMessage.isStreaming = false;
                this.stateManager.setState({ messages: [...this.stateManager.getState().messages] });
            }
        }
        break;
      
      case 'error':
        this.stateManager.addMessage({ role: 'system', content: message.message, error: true, id: `msg-${Date.now()}` });
        break;
        
      case 'settingsData':
        this.stateManager.setState({ settings: message.settings });
        break;
        
      case 'operationTracked':
        // Handle new operation tracked
        const currentOperations = this.stateManager.getState().operations || [];
        this.stateManager.setState({ 
          operations: [...currentOperations, message.data] 
        });
        break;
        
      case 'operationChanged':
        // Handle operation status change
        const operations = this.stateManager.getState().operations || [];
        const updatedOperations = operations.map(op => 
          op.id === message.data.id ? message.data : op
        );
        this.stateManager.setState({ operations: updatedOperations });
        break;
        
      case 'operationHistory':
        // Response to operation history request
        if (message.data) {
          // Combine active and undone operations into a single array
          const allOperations = [
            ...(message.data.active || []),
            ...(message.data.undone || [])
          ];
          this.stateManager.setState({ operations: allOperations });
        }
        break;
        
      case 'getOperationHistory':
        // Legacy handler for backward compatibility
        if (message.data) {
          this.stateManager.setState({ operations: message.data });
        }
        break;

      // Add other message handlers as needed
      default:
        // console.warn('Unknown message type:', message.type);
        break;
    }
  }

  public sendMessage(text: string): void {
    const message = {
        role: 'user' as const,
        content: text,
        id: `msg-${Date.now()}`
    };
    this.stateManager.addMessage(message);
    
    this.vscode.postMessage({
      type: 'sendMessage',
      text: text,
    });
    this.stateManager.setState({ processing: true });
  }

  public updateSettings(settings: Partial<AppState['settings']>): void {
    this.stateManager.setState({ settings });
    this.vscode.postMessage({
      type: 'updateSettings',
      settings,
    });
  }
  
  public openModal(modalType: AppState['currentModal']): void {
      this.stateManager.setState({ currentModal: modalType });
  }
  
  public closeModal(): void {
      this.stateManager.setState({ currentModal: null });
  }

  // Other public methods to be called by components
  public newSession(): void {
    this.vscode.postMessage({ type: 'newSession' });
    this.stateManager.reset();
  }

  public stopRequest(): void {
      this.vscode.postMessage({ type: 'stopRequest' });
      this.stateManager.setState({ processing: false });
  }
}