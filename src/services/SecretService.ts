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
    ANTHROPIC_API_KEY: 'anthropic-api-key',
    GROK_API_KEY: 'grok-api-key',
    GROK_ENABLED: 'grok-integration-enabled',
    VERTEX_CREDENTIALS: 'gemini-vertex-credentials'
} as const;

// Provider identifier constants for use with generic getApiKey/setApiKey methods
export const API_KEY_PROVIDERS = {
    ANTHROPIC: 'anthropic-api-key',
    GEMINI: 'gemini-api-key',
    GROK: 'grok-api-key',
    VERTEX: 'gemini-vertex-credentials'
} as const;

// VS Code configuration key constants
const CONFIG_KEYS = {
    GEMINI_ENABLED: 'claudeCodeChatUI.geminiIntegrationEnabled',
    GROK_ENABLED: 'claudeCodeChatUI.grokIntegrationEnabled',
    VERTEX_PROJECT: 'claudeCodeChatUI.gemini.vertexProject'
} as const;

// GlobalState fallback keys — used when VS Code config keys are not yet
// registered (e.g. right after a VSIX upgrade, before window reload).
const FALLBACK_KEYS = {
    GROK_ENABLED: 'configFallback.grokEnabled',
    VERTEX_PROJECT: 'configFallback.vertexProject'
} as const;

/**
 * Gemini Integration Configuration Interface
 */
export interface GeminiIntegrationConfig {
    enabled: boolean;           // Whether Gemini Integration is enabled
    apiKey: string | undefined; // Gemini API Key
    hasVertexCredentials: boolean; // Whether Vertex AI credentials are imported
    vertexProject: string;        // GCP Project ID from Vertex AI credentials
}

/**
 * Grok Integration Configuration Interface
 */
export interface GrokIntegrationConfig {
    enabled: boolean;
    apiKey: string | undefined;
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

        // Migrate any globalState fallback values written during a previous
        // session where newly-added config keys were not yet registered.
        this.migrateConfigFallbacks().catch(err =>
            debugError('SecretService', 'Config fallback migration failed', err)
        );
    }

    /**
     * Check if service is initialized
     */
    private ensureInitialized(): void {
        if (!this.secrets || !this.context) {
            throw new Error('[SecretService] Service not initialized. Please call initialize() method first.');
        }
    }

    // ==================== Config Fallback Helpers ====================
    // After a VSIX upgrade that adds new configuration keys, VS Code / Cursor
    // may not register those keys until the window is reloaded. During that
    // window, config.update() throws "configuration not registered".  These
    // helpers transparently fall back to context.globalState so user actions
    // still succeed.  On the *next* activation (after reload) the values are
    // migrated back to VS Code config and the fallback keys are cleaned up.

    /**
     * Write a value to VS Code config; on failure, persist in globalState.
     */
    private async safeConfigUpdate(configKey: string, value: any, fallbackKey: string): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration();
            await config.update(configKey, value, vscode.ConfigurationTarget.Global);
            // Write succeeded — clear any stale fallback
            await this.context!.globalState.update(fallbackKey, undefined);
        } catch {
            debugLog('SecretService', `Config key "${configKey}" not registered yet, storing in globalState fallback`);
            await this.context!.globalState.update(fallbackKey, value);
        }
    }

    /**
     * Read from VS Code config; if it returns the schema default, also check
     * globalState for a fallback value written during a previous failed update.
     */
    private safeConfigGet<T>(configKey: string, defaultValue: T, fallbackKey: string): T {
        const config = vscode.workspace.getConfiguration();
        const value = config.get<T>(configKey);
        if (value !== undefined && value !== defaultValue) {
            return value;
        }
        const fallback = this.context!.globalState.get<T>(fallbackKey);
        return fallback !== undefined ? fallback : defaultValue;
    }

    /**
     * Migrate globalState fallback values back to VS Code config.
     * Called on initialize() — by that point the window has reloaded and
     * newly-added config keys should be registered.
     */
    private async migrateConfigFallbacks(): Promise<void> {
        const migrations: { configKey: string; fallbackKey: string }[] = [
            { configKey: CONFIG_KEYS.GROK_ENABLED, fallbackKey: FALLBACK_KEYS.GROK_ENABLED },
            { configKey: CONFIG_KEYS.VERTEX_PROJECT, fallbackKey: FALLBACK_KEYS.VERTEX_PROJECT },
        ];

        for (const { configKey, fallbackKey } of migrations) {
            const fallbackValue = this.context!.globalState.get(fallbackKey);
            if (fallbackValue !== undefined) {
                try {
                    const config = vscode.workspace.getConfiguration();
                    await config.update(configKey, fallbackValue, vscode.ConfigurationTarget.Global);
                    await this.context!.globalState.update(fallbackKey, undefined);
                    debugLog('SecretService', `Migrated fallback "${fallbackKey}" → config "${configKey}"`);
                } catch {
                    debugLog('SecretService', `Config key "${configKey}" still not registered, keeping fallback`);
                }
            }
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
        const vertexCredentials = await this.getVertexCredentials();
        const hasVertexCredentials = !!vertexCredentials;
        let vertexProject = this.getVertexProject();

        // Last-resort fallback: extract project_id from stored credentials JSON
        if (!vertexProject && vertexCredentials) {
            try { vertexProject = JSON.parse(vertexCredentials).project_id || ''; } catch { /* ignore */ }
        }

        return {
            enabled,
            apiKey,
            hasVertexCredentials,
            vertexProject
        };
    }

    /**
     * Check if Gemini credentials should be injected
     * Condition: Integration is enabled AND (API Key is set OR Vertex credentials exist)
     * @returns Whether to inject
     */
    public async shouldInjectGeminiApiKey(): Promise<boolean> {
        const config = await this.getGeminiIntegrationConfig();
        return config.enabled && (!!config.apiKey || config.hasVertexCredentials);
    }

    // ==================== Grok Integration Methods ====================

    /**
     * Get Grok API Key
     */
    public async getGrokApiKey(): Promise<string | undefined> {
        return this.getApiKey(SECRET_KEYS.GROK_API_KEY);
    }

    /**
     * Store Grok API Key
     */
    public async setGrokApiKey(apiKey: string): Promise<void> {
        return this.setApiKey(SECRET_KEYS.GROK_API_KEY, apiKey);
    }

    /**
     * Delete Grok API Key
     */
    public async deleteGrokApiKey(): Promise<void> {
        return this.deleteApiKey(SECRET_KEYS.GROK_API_KEY);
    }

    /**
     * Get Grok Integration enabled status
     */
    public getGrokIntegrationEnabled(): boolean {
        return this.safeConfigGet<boolean>(CONFIG_KEYS.GROK_ENABLED, false, FALLBACK_KEYS.GROK_ENABLED);
    }

    /**
     * Set Grok Integration enabled status
     */
    public async setGrokIntegrationEnabled(enabled: boolean): Promise<void> {
        await this.safeConfigUpdate(CONFIG_KEYS.GROK_ENABLED, enabled, FALLBACK_KEYS.GROK_ENABLED);
        debugLog('SecretService', `Grok Integration status updated: ${enabled}`);
    }

    /**
     * Get complete Grok integration configuration
     */
    public async getGrokIntegrationConfig(): Promise<GrokIntegrationConfig> {
        const enabled = this.getGrokIntegrationEnabled();
        const apiKey = await this.getGrokApiKey();
        return { enabled, apiKey };
    }

    /**
     * Check if Grok API Key should be injected
     * Condition: Integration is enabled AND API Key is set
     */
    public async shouldInjectGrokApiKey(): Promise<boolean> {
        const config = await this.getGrokIntegrationConfig();
        return config.enabled && !!config.apiKey;
    }

    // ==================== Vertex AI Methods ====================

    /**
     * Get Vertex AI service account credentials JSON
     */
    public async getVertexCredentials(): Promise<string | undefined> {
        return this.getApiKey(SECRET_KEYS.VERTEX_CREDENTIALS);
    }

    /**
     * Store Vertex AI service account credentials JSON
     */
    public async setVertexCredentials(jsonString: string): Promise<void> {
        return this.setApiKey(SECRET_KEYS.VERTEX_CREDENTIALS, jsonString);
    }

    /**
     * Delete Vertex AI credentials
     */
    public async deleteVertexCredentials(): Promise<void> {
        return this.deleteApiKey(SECRET_KEYS.VERTEX_CREDENTIALS);
    }

    /**
     * Get Vertex AI project ID from VS Code config (with globalState fallback)
     */
    public getVertexProject(): string {
        return this.safeConfigGet<string>(CONFIG_KEYS.VERTEX_PROJECT, '', FALLBACK_KEYS.VERTEX_PROJECT);
    }

    /**
     * Set Vertex AI project ID in VS Code config (with globalState fallback)
     */
    public async setVertexProject(project: string): Promise<void> {
        await this.safeConfigUpdate(CONFIG_KEYS.VERTEX_PROJECT, project, FALLBACK_KEYS.VERTEX_PROJECT);
        debugLog('SecretService', `Vertex AI project updated: ${project}`);
    }

    /**
     * Check if Vertex AI credentials exist
     */
    public async hasVertexCredentials(): Promise<boolean> {
        return !!(await this.getVertexCredentials());
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

    /**
     * Validate Grok API Key format (loose check — xai- prefix)
     */
    public static isValidGrokApiKeyFormat(apiKey: string): boolean {
        if (!apiKey || typeof apiKey !== 'string') {
            return false;
        }
        return apiKey.startsWith('xai-');
    }

    /**
     * Validate GCP Service Account JSON structure
     * @param json Raw JSON string
     * @returns Validation result with optional projectId
     */
    public static validateServiceAccountJson(json: string): { valid: boolean; error?: string; projectId?: string } {
        try {
            const parsed = JSON.parse(json);

            if (parsed.type !== 'service_account') {
                return { valid: false, error: 'JSON "type" must be "service_account"' };
            }
            if (!parsed.project_id) {
                return { valid: false, error: 'Missing "project_id" field' };
            }
            if (!parsed.private_key) {
                return { valid: false, error: 'Missing "private_key" field' };
            }
            if (!parsed.client_email) {
                return { valid: false, error: 'Missing "client_email" field' };
            }

            return { valid: true, projectId: parsed.project_id };
        } catch {
            return { valid: false, error: 'Invalid JSON format' };
        }
    }
}

// Export singleton instance getter
export const secretService = SecretService.getInstance();
