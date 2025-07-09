/**
 * State Management Service
 * Centralized state management for the UI, integrated with VS Code's state persistence.
 */

import { AppState, StateListener, Unsubscribe, DeepPartial, VscodeApi } from '../types';

/**
 * StateManager - Manages application state and notifies listeners
 */
export class StateManager {
    private state: AppState;
    private listeners: Set<StateListener> = new Set();
    private vscode: VscodeApi;

    constructor(vscode: VscodeApi, initialState?: Partial<AppState>) {
        this.vscode = vscode;
        const persistedState = this.vscode.getState() || {};

        // Initialize with default state, then persisted state, then initial state
        this.state = {
            // Default initial state
            isProcessRunning: false,
            currentModal: null,
            messages: [],
            // ... other defaults
            ...persistedState,
            ...initialState
        };
    }

    /**
     * Get current state
     */
    getState(): AppState {
        return { ...this.state };
    }

    /**
     * Get specific state value
     */
    getValue<K extends keyof AppState>(key: K): AppState[K] {
        return this.state[key];
    }

    /**
     * Update state with partial updates and persist it
     */
    setState(updates: DeepPartial<AppState>): void {
        const oldState = this.state;
        
        this.state = this.deepMerge(this.state, updates) as AppState;
        
        if (this.hasChanged(oldState, this.state)) {
            this.vscode.setState(this.state);
            this.notifyListeners();
        }
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: StateListener): Unsubscribe {
        this.listeners.add(listener);
        listener(this.getState()); // Immediately notify with current state
        
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Reset state to defaults
     */
    reset(preservePreferences = true): void {
        const preferences = preservePreferences ? {
            selectedModel: this.state.selectedModel,
            planModeEnabled: this.state.planModeEnabled,
            thinkingModeEnabled: this.state.thinkingModeEnabled,
        } : {};

        const newState = {
            // Reset to defaults
            ...this.getDefaultState(),
            ...preferences
        } as AppState;

        this.setState(newState);
    }
    
    private getDefaultState(): Partial<AppState> {
        return {
            isProcessRunning: false,
            currentModal: null,
            messages: [],
            totalCost: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            requestCount: 0,
        };
    }

    /**
     * Add a message to the state
     */
    addMessage(message: AppState['messages'][0]): void {
        const newMessages = [...this.state.messages, message];
        this.setState({
            messages: newMessages
        });
    }

    /**
     * Update stats
     */
    updateStats(stats: Partial<Pick<AppState, 'totalCost' | 'totalInputTokens' | 'totalOutputTokens' | 'requestCount'>>): void {
        this.setState(stats);
    }

    /**
     * Toggle modal
     */
    toggleModal(modalType: AppState['currentModal']): void {
        const newModal = this.state.currentModal === modalType ? null : modalType;
        this.setState({
            currentModal: newModal
        });
    }

    /**
     * Private: Notify all listeners
     */
    private notifyListeners(): void {
        const currentState = this.getState();
        this.listeners.forEach(listener => {
            try {
                listener(currentState);
            } catch (error) {
                console.error('Error in state listener:', error);
            }
        });
    }

    /**
     * Private: Deep merge objects
     */
    private deepMerge(target: any, source: any): any {
        const output = { ...target };
        
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        output[key] = source[key];
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    output[key] = source[key];
                }
            });
        }
        
        return output;
    }

    /**
     * Private: Check if value is an object
     */
    private isObject(item: any): boolean {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * Private: Check if state has changed
     */
    private hasChanged(oldState: any, newState: any): boolean {
        return JSON.stringify(oldState) !== JSON.stringify(newState);
    }
}