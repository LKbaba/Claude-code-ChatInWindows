/**
 * SecretService - Secure Storage Service
 * Uses VS Code SecretStorage API to securely store sensitive information (such as API Keys)
 *
 * Main features:
 * - Secure storage and retrieval of Gemini API Key
 * - Support for extending to other sensitive configurations
 */

import * as vscode from 'vscode';
import { debugLog, debugError } from './DebugLogger';

// Storage key constants
const SECRET_KEYS = {
    GEMINI_API_KEY: 'gemini-api-key',
    GEMINI_ENABLED: 'gemini-integration-enabled',
    ANTHROPIC_API_KEY: 'anthropic-api-key'
} as const;

// Provider identifier constants for use with generic getApiKey/setApiKey methods
export const API_KEY_PROVIDERS = {
    ANTHROPIC: 'anthropic-api-key',
    GEMINI: 'gemini-api-key'
} as const;

// VS Code configuration key constants
const CONFIG_KEYS = {
    GEMINI_ENABLED: 'claudeCodeChatUI.geminiIntegrationEnabled'
} as const;

/**
 * Gemini Integration Configuration Interface
 */
export interface GeminiIntegrationConfig {
    enabled: boolean;           // Whether Gemini Integration is enabled
    apiKey: string | undefined; // Gemini API Key
}

/**
 * SecretService Singleton Class
 * Manages secure storage of all sensitive data
 */
export class SecretService {
    private static instance: SecretService | undefined;
    private secrets: vscode.SecretStorage | undefined;
    private context: vscode.ExtensionContext | undefined;

    private constructor() {}

    /**
     * Get SecretService singleton instance
     */
    public static getInstance(): SecretService {
        if (!SecretService.instance) {
            SecretService.instance = new SecretService();
        }
        return SecretService.instance;
    }

    /**
     * Initialize SecretService
     * Must be called before using other methods
     * @param context VS Code extension context
     */
    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        this.secrets = context.secrets;
        debugLog('SecretService', 'Initialized successfully');
    }

    /**
     * Check if service is initialized
     */
    private ensureInitialized(): void {
        if (!this.secrets || !this.context) {
            throw new Error('[SecretService] Service not initialized. Please call initialize() method first.');
        }
    }

    // ==================== Generic API Key Methods ====================

    /**
     * Get API key for the specified provider
     * @param provider Provider identifier (use API_KEY_PROVIDERS constants)
     * @returns API Key or undefined if not set
     */
    public async getApiKey(provider: string): Promise<string | undefined> {
        this.ensureInitialized();
        try {
            const apiKey = await this.secrets!.get(provider);
            debugLog('SecretService', `Get API key for provider "${provider}": ${apiKey ? 'configured' : 'not set'}`);
            return apiKey;
        } catch (error) {
            debugError('SecretService', `Failed to get API key for provider "${provider}"`, error);
            return undefined;
        }
    }

    /**
     * Store API key for the specified provider
     * @param provider Provider identifier (use API_KEY_PROVIDERS constants)
     * @param key API Key to store
     */
    public async setApiKey(provider: string, key: string): Promise<void> {
        this.ensureInitialized();
        try {
            await this.secrets!.store(provider, key);
            debugLog('SecretService', `API key for provider "${provider}" stored securely`);
        } catch (error) {
            debugError('SecretService', `Failed to store API key for provider "${provider}"`, error);
            throw error;
        }
    }

    /**
     * Delete API key for the specified provider
     * @param provider Provider identifier (use API_KEY_PROVIDERS constants)
     */
    public async deleteApiKey(provider: string): Promise<void> {
        this.ensureInitialized();
        try {
            await this.secrets!.delete(provider);
            debugLog('SecretService', `API key for provider "${provider}" deleted`);
        } catch (error) {
            debugError('SecretService', `Failed to delete API key for provider "${provider}"`, error);
            throw error;
        }
    }

    // ==================== Anthropic API Key Methods ====================

    /**
     * Get Anthropic API Key
     * @returns API Key or undefined if not set
     */
    public async getAnthropicApiKey(): Promise<string | undefined> {
        return this.getApiKey(SECRET_KEYS.ANTHROPIC_API_KEY);
    }

    /**
     * Store Anthropic API Key
     * @param apiKey API Key to store
     */
    public async setAnthropicApiKey(apiKey: string): Promise<void> {
        return this.setApiKey(SECRET_KEYS.ANTHROPIC_API_KEY, apiKey);
    }

    /**
     * Delete Anthropic API Key
     */
    public async deleteAnthropicApiKey(): Promise<void> {
        return this.deleteApiKey(SECRET_KEYS.ANTHROPIC_API_KEY);
    }

    /**
     * Validate Anthropic API Key format
     * Anthropic keys start with "sk-ant-"
     * @param apiKey API Key to validate
     * @returns Whether the format is valid
     */
    public static isValidAnthropicApiKeyFormat(apiKey: string): boolean {
        if (!apiKey || typeof apiKey !== 'string') {
            return false;
        }
        return apiKey.startsWith('sk-ant-') && apiKey.length >= 20;
    }

    // ==================== Gemini API Key Related Methods ====================

    /**
     * Get Gemini API Key (delegates to generic getApiKey for backward compatibility)
     * @returns API Key or undefined if not set
     */
    public async getGeminiApiKey(): Promise<string | undefined> {
        return this.getApiKey(SECRET_KEYS.GEMINI_API_KEY);
    }

    /**
     * Set Gemini API Key (delegates to generic setApiKey for backward compatibility)
     * @param apiKey API Key to store
     */
    public async setGeminiApiKey(apiKey: string): Promise<void> {
        return this.setApiKey(SECRET_KEYS.GEMINI_API_KEY, apiKey);
    }

    /**
     * Delete Gemini API Key (delegates to generic deleteApiKey for backward compatibility)
     */
    public async deleteGeminiApiKey(): Promise<void> {
        return this.deleteApiKey(SECRET_KEYS.GEMINI_API_KEY);
    }

    // ==================== Gemini Integration Configuration Methods ====================

    /**
     * Get Gemini Integration enabled status
     * @returns Enabled status
     */
    public getGeminiIntegrationEnabled(): boolean {
        const config = vscode.workspace.getConfiguration();
        return config.get<boolean>(CONFIG_KEYS.GEMINI_ENABLED, false);
    }

    /**
     * Set Gemini Integration enabled status
     * @param enabled Whether to enable
     */
    public async setGeminiIntegrationEnabled(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration();
        await config.update(CONFIG_KEYS.GEMINI_ENABLED, enabled, vscode.ConfigurationTarget.Global);
        debugLog('SecretService', `Gemini Integration status updated: ${enabled}`);
    }

    /**
     * Get complete Gemini integration configuration
     * @returns Gemini integration configuration object
     */
    public async getGeminiIntegrationConfig(): Promise<GeminiIntegrationConfig> {
        const enabled = this.getGeminiIntegrationEnabled();
        const apiKey = await this.getGeminiApiKey();

        return {
            enabled,
            apiKey
        };
    }

    /**
     * Check if Gemini API Key should be injected
     * Condition: Integration is enabled AND API Key is set
     * @returns Whether to inject
     */
    public async shouldInjectGeminiApiKey(): Promise<boolean> {
        const config = await this.getGeminiIntegrationConfig();
        return config.enabled && !!config.apiKey;
    }

    // ==================== Utility Methods ====================

    /**
     * Check if API Key format is valid (basic validation)
     * Gemini API Key usually starts with "AIza"
     * @param apiKey API Key to validate
     * @returns Whether valid
     */
    public static isValidGeminiApiKeyFormat(apiKey: string): boolean {
        if (!apiKey || typeof apiKey !== 'string') {
            return false;
        }
        // Gemini API Key usually starts with "AIza", length is about 39 characters
        return apiKey.startsWith('AIza') && apiKey.length >= 35;
    }

    /**
     * Get masked display of API Key (for UI display)
     * @param apiKey Original API Key
     * @returns Masked string, e.g., "AIza••••••••••••••••••••"
     */
    public static maskApiKey(apiKey: string | undefined): string {
        if (!apiKey) {
            return '';
        }
        if (apiKey.length <= 8) {
            return '••••••••';
        }
        // Show first 4 characters, replace the rest with •
        return apiKey.substring(0, 4) + '•'.repeat(Math.min(apiKey.length - 4, 20));
    }
}

// Export singleton instance getter
export const secretService = SecretService.getInstance();
