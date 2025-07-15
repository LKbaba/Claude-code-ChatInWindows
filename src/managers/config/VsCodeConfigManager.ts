/**
 * VS Code Configuration Manager
 * Manages general VS Code extension settings
 */

import * as vscode from 'vscode';

export interface VsCodeSettings {
    'thinking.intensity': string;
    [key: string]: any;
}

export class VsCodeConfigManager {
    /**
     * Gets current extension settings
     * @returns Current settings object
     */
    public getCurrentSettings(): VsCodeSettings {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const settings: VsCodeSettings = {
            'thinking.intensity': config.get<string>('thinking.intensity', 'think')
        };
        
        // Get all configuration properties
        const allConfig = config;
        for (const key in allConfig) {
            if (allConfig.hasOwnProperty(key) && typeof allConfig[key] !== 'function') {
                settings[key] = allConfig[key];
            }
        }
        
        return settings;
    }

    /**
     * Updates extension settings
     * @param settings Settings to update
     * @returns Promise resolving when settings are updated
     */
    public async updateSettings(settings: { [key: string]: any }): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        
        for (const [key, value] of Object.entries(settings)) {
            try {
                await config.update(key, value, vscode.ConfigurationTarget.Global);
            } catch (error: any) {
                const errorMessage = error?.message || 'Unknown error';
                vscode.window.showErrorMessage(`Failed to update setting ${key}: ${errorMessage}`);
                throw error;
            }
        }
    }

    /**
     * Gets the thinking intensity setting
     * @returns The thinking intensity value
     */
    public getThinkingIntensity(): string {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return config.get<string>('thinking.intensity', 'think');
    }
}