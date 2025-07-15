/**
 * API Configuration Manager
 * Manages API-related settings including custom API endpoints and Windows configuration
 */

import * as vscode from 'vscode';

export interface ApiConfig {
    useCustomAPI: boolean;
    key: string;
    baseUrl: string;
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
            pythonPath: config.get<string>('windows.pythonPath')
        };
    }

    /**
     * Gets API configuration
     * @returns API configuration object
     */
    public getApiConfig(): ApiConfig {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return {
            useCustomAPI: config.get<boolean>('api.useCustomAPI', false),
            key: config.get<string>('api.key', ''),
            baseUrl: config.get<string>('api.baseUrl', 'https://api.anthropic.com')
        };
    }

    /**
     * Updates API key in settings
     * @param apiKey The API key to set
     */
    public async updateApiKey(apiKey: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        await config.update('api.key', apiKey, vscode.ConfigurationTarget.Global);
    }

    /**
     * Gets the API key from settings
     * @returns The API key or empty string if not set
     */
    public getApiKey(): string {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return config.get<string>('api.key', '');
    }
}