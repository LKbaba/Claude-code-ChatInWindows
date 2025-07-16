/**
 * VS Code Configuration Manager
 * Manages general VS Code extension settings
 */

import * as vscode from 'vscode';

export interface VsCodeSettings {
    'thinking.intensity': string;
    'language.enabled': boolean;
    'language.selected': string | null;
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
            'thinking.intensity': config.get<string>('thinking.intensity', 'think'),
            'language.enabled': config.get<boolean>('language.enabled', false),
            'language.selected': config.get<string | null>('language.selected', this.getDefaultLanguage())
        };
        
        // Get specific configuration values
        // We need to explicitly get each configuration value
        settings['mcp.enabled'] = config.get<boolean>('mcp.enabled', false);
        settings['mcp.servers'] = config.get<any[]>('mcp.servers', []);
        settings['api.useCustomAPI'] = config.get<boolean>('api.useCustomAPI', false);
        settings['api.key'] = config.get<string>('api.key', '');
        settings['api.baseUrl'] = config.get<string>('api.baseUrl', 'https://api.anthropic.com');
        
        // Get any other settings that might be needed
        const allKeys = Object.keys(config);
        for (const key of allKeys) {
            if (!settings.hasOwnProperty(key)) {
                const value = config.get(key);
                if (value !== undefined) {
                    settings[key] = value;
                }
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
            await config.update(key, value, vscode.ConfigurationTarget.Global);
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
    
    /**
     * Gets the default language based on VS Code locale
     * @returns The default language code or null
     */
    private getDefaultLanguage(): string | null {
        const locale = vscode.env.language;
        
        // Map VS Code locales to our language codes
        const localeMap: { [key: string]: string } = {
            'zh-cn': 'zh',
            'zh-tw': 'zh',
            'es': 'es',
            'es-es': 'es',
            'es-mx': 'es',
            'ar': 'ar',
            'ar-sa': 'ar',
            'ar-eg': 'ar',
            'fr': 'fr',
            'fr-fr': 'fr',
            'fr-ca': 'fr',
            'de': 'de',
            'de-de': 'de',
            'de-at': 'de',
            'de-ch': 'de',
            'ja': 'ja',
            'ko': 'ko',
            'ko-kr': 'ko'
        };
        
        // Check exact match first
        if (localeMap[locale]) {
            return localeMap[locale];
        }
        
        // Check prefix match (e.g., 'es-ar' -> 'es')
        const prefix = locale.split('-')[0];
        if (localeMap[prefix]) {
            return localeMap[prefix];
        }
        
        return null;
    }
}