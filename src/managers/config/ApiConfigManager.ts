/**
 * API Configuration Manager
 * Manages API-related settings including custom API endpoints and Windows configuration
 */

import * as vscode from 'vscode';
import { SecretService } from '../../services/SecretService';
import { debugLog } from '../../services/DebugLogger';

export interface ApiConfig {
    useCustomAPI: boolean;
    key: string;
    baseUrl: string;
    cliCommand: string;  // CLI command name, default 'claude', mirror service users can set to 'xxxxclaude'
}

export interface WindowsConfig {
    shell?: string;
    pythonPath?: string;
    gitBashPath?: string;
}

export class ApiConfigManager {
    /**
     * Gets Windows-specific configuration
     * @returns Windows configuration object
     */
    public getWindowsConfig(): WindowsConfig {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return {
            shell: config.get<string>('windows.shell'),
            pythonPath: config.get<string>('windows.pythonPath'),
            gitBashPath: config.get<string>('windows.gitBashPath')
        };
    }

    /**
     * Gets API configuration
     * Note: the 'key' field is always empty here — the actual key is stored in SecretStorage.
     * Use SecretService.getAnthropicApiKey() to read the key asynchronously.
     * @returns API configuration object
     */
    public getApiConfig(): ApiConfig {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return {
            useCustomAPI: config.get<boolean>('api.useCustomAPI', false),
            key: '',  // Key is no longer stored in settings.json — use SecretStorage
            baseUrl: config.get<string>('api.baseUrl', 'https://api.anthropic.com'),
            cliCommand: config.get<string>('api.cliCommand', 'claude')
        };
    }

    /**
     * Updates API key — stores in SecretStorage instead of settings.json
     * @param apiKey The API key to store securely
     */
    public async updateApiKey(apiKey: string): Promise<void> {
        await SecretService.getInstance().setAnthropicApiKey(apiKey);
        debugLog('ApiConfigManager', 'API key stored in SecretStorage');
    }

    /**
     * Gets the API key (sync stub — always returns empty string).
     * Use SecretService.getAnthropicApiKey() for the actual async read.
     * @returns Empty string
     */
    public getApiKey(): string {
        return '';
    }

    /**
     * Migrates legacy plaintext API key from settings.json to SecretStorage.
     * Reads api.key from settings → stores in SecretStorage → clears settings value.
     * Safe to call multiple times (no-op when no plaintext key is present).
     */
    public async migrateApiKeyIfNeeded(): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const legacyKey = config.get<string>('api.key', '');
        if (legacyKey) {
            debugLog('ApiConfigManager', 'Migrating legacy API key from settings to SecretStorage');
            await SecretService.getInstance().setAnthropicApiKey(legacyKey);
            // Clear plaintext key from settings.json after migration
            await config.update('api.key', '', vscode.ConfigurationTarget.Global);
            debugLog('ApiConfigManager', 'API key migration complete — plaintext key removed from settings');
        }
    }
}