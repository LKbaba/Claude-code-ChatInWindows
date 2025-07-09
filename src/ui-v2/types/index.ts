/**
 * UI-V2 Type Definitions
 * Central type definitions for the new UI system
 */

// Re-export types from existing services
export type { MessageCallbacks, TokenUpdate, FinalResult } from '../../services/MessageProcessor';

// Define Message type locally to avoid circular dependency
export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    isStreaming?: boolean;
    error?: boolean;
    tokens?: {
        input?: number;
        output?: number;
    };
    cost?: number;
    sessionId?: string;
    thinkingContent?: string;
}

// UI State Types
export interface UIState {
    // Session
    sessionId?: string;
    sessionStartTime?: string;
    isProcessRunning: boolean;
    processing: boolean;
    
    // UI State
    currentModal: ModalType | null;
    isSettingsOpen: boolean;
    isStatsOpen: boolean;
    isFilePickerOpen: boolean;
    loadingMessage: string | null;
    restoreProgress: number | null;
    showWSLAlert: boolean;
    
    // User Preferences
    selectedModel: 'opus' | 'sonnet' | 'default';
    currentModel: string;
    planModeEnabled: boolean;
    thinkingModeEnabled: boolean;
    thinkingIntensity: 'think' | 'think-hard' | 'think-harder' | 'ultrathink';
    
    // Messages
    messages: Message[];
    
    // Token Tracking
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    responseTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    
    // Stats
    totalCost: number;
    conversationCost: number;
    requestCount: number;
    
    // File Management
    attachedImage: string | null;
    filePickerFiles: string[];
    
    // History & Settings
    conversations: any[];
    statistics: any;
    settings: any;
    platform: any;
    mcpServers: any[];
    customCommands: any[];
}

export interface AppState extends UIState {}

export type ModalType = 'settings' | 'stats' | 'filePicker' | 'model' | 'commands' | 'thinkingIntensity' | 'settingsModal' | 'statsModal' | 'modelModal' | 'thinkingIntensityModal' | 'slashCommandsModal' | 'filePickerModal';

export interface UIMessage {
    id: string;
    type: 'user' | 'assistant' | 'system' | 'error' | 'tool' | 'thinking' | 'claude';
    content: string;
    timestamp: number;
    metadata?: {
        toolName?: string;
        toolInput?: any;
        toolResult?: any;
        isError?: boolean;
        hidden?: boolean;
    };
}

// Tool-related Types
export interface ToolUseData {
    toolInfo: string;
    toolName: string;
    toolInput?: string;
    rawInput?: any;
}

export interface ToolResultData {
    content: string;
    toolName: string;
    isError: boolean;
    hidden?: boolean;
}

// Component Props Types
// Component System Types
export interface ComponentProps {
    className?: string;
    id?: string;
    children?: any;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: any;
}

export interface ComponentState {
    [key: string]: any;
}

// Forward declaration for Component type
export type Component = any;

export interface LayoutProps extends ComponentProps {
  header?: Component;
  mainContent?: Component;
  footer?: Component;
  sidebar?: Component;
}

export interface PanelProps extends ComponentProps {
    title?: string;
    isCollapsible?: boolean;
    isCollapsed?: boolean;
}

export interface HeaderProps extends ComponentProps {
    title: string;
    actions?: Component[];
}

export interface ButtonProps extends ComponentProps {
    variant?: 'primary' | 'secondary' | 'outlined' | 'text' | 'icon';
    size?: 'small' | 'medium' | 'large';
    disabled?: boolean;
    onClick?: (event?: MouseEvent) => void;
    label?: string;
    icon?: string;
    children?: any;
}

export interface ModalProps extends ComponentProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    size?: 'small' | 'medium' | 'large' | 'fullscreen';
    content?: Component | string;
    footer?: Component | string;
    closeOnOverlay?: boolean;
    closeOnEsc?: boolean;
    showCloseButton?: boolean;
    animate?: boolean;
    onOpen?: () => void;
}

// Specific Modal Props
export interface FilePickerModalProps extends ModalProps {
  initialPath?: string;
  onFileSelect: (filePath: string) => void;
}

export interface SettingsModalProps extends ModalProps {
  settings: Partial<AppState['settings']>;
  onSettingsChange: (newSettings: Partial<AppState['settings']>) => void;
}

// VSCode-related types
export interface VsCodeFile {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mtime: number;
}

// Event Types
export type StateListener = (state: AppState) => void;
export type Unsubscribe = () => void;

// Service Interfaces
export interface IStateManager {
    getState(): AppState;
    setState(updates: Partial<AppState>): void;
    subscribe(listener: StateListener): Unsubscribe;
}

export interface IMessageRenderer {
    renderMessage(message: UIMessage): string;
    renderToolUse(data: any): string;
    renderToolResult(data: any): string;
}

export interface IModalManager {
    open(type: ModalType): void;
    close(type?: ModalType): void;
    isOpen(type: ModalType): boolean;
    toggle(type: ModalType): void;
}

// VSCode API interface
export interface VscodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

// Event Handler Types
export type EventHandler = (data: any) => void;

export interface EventHandlersInterface {
    handleMessage(event: MessageEvent): void;
    sendMessage(): void;
    stopRequest(): void;
    newSession(): void;
    toggleSettings(): void;
    toggleStats(): void;
    toggleConversationHistory(): void;
    togglePlanMode(): void;
    toggleThinkingMode(): void;
    showModelSelector(): void;
    selectModel(model: string): void;
    showFilePicker(): void;
    selectImage(): void;
    updateSettings(settings?: any): void;
    copyMessage(text: string): void;
    deleteMessage(messageId: string): void;
    restoreToPoint(messageId: string): void;
    registerEventListeners(): void;
}

// Utility Types
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ValueOf<T> = T[keyof T];

export interface InputAreaProps extends ComponentProps {
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
}