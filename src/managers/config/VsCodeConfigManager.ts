/**
 * VS Code Configuration Manager
 * Manages general settings for the VS Code extension
 *
 * Configuration save strategy:
 * - MCP related config (mcp.enabled, mcp.servers): Saved to workspace level for project isolation
 * - Other config: Saved to user level (global)
 */

import * as vscode from 'vscode';
import { debugLog } from '../../services/DebugLogger';

export interface VsCodeSettings {
    'thinking.intensity': string;
    'language.enabled': boolean;
    'language.selected': string | null;
    [key: string]: any;
}

/**
 * MCP configuration save target
 */
export type McpConfigTarget = 'user' | 'workspace';

export class VsCodeConfigManager {
    /**
     * Current MCP configuration save target level
     * Defaults to 'workspace' for project-specific MCP configuration
     */
    private _mcpConfigTarget: McpConfigTarget = 'workspace';

    /**
     * Get MCP configuration save target
     */
    public getMcpConfigTarget(): McpConfigTarget {
        return this._mcpConfigTarget;
    }

    /**
     * Set MCP configuration save target
     */
    public setMcpConfigTarget(target: McpConfigTarget): void {
        this._mcpConfigTarget = target;
        debugLog('VsCodeConfigManager', `MCP config target changed to: ${target}`);
    }

    /**
     * Get current active editor's resource URI
     * Used for getting correct configuration scope in multi-root workspace
     */
    private getActiveResourceUri(): vscode.Uri | undefined {
        // Prefer active editor's document URI
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            return activeEditor.document.uri;
        }

        // Fall back to first workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri;
        }

        return undefined;
    }

    /**
     * Get current extension settings
     * @returns Current settings object
     */
    public getCurrentSettings(): VsCodeSettings {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const settings: VsCodeSettings = {
            'thinking.enabled': config.get<boolean>('thinking.enabled', false),
            'thinking.intensity': config.get<string>('thinking.intensity', 'think'),
            'language.enabled': config.get<boolean>('language.enabled', false),
            'language.selected': config.get<string | null>('language.selected', this.getDefaultLanguage())
        };

        // Get specific configuration values
        settings['mcp.enabled'] = config.get<boolean>('mcp.enabled', false);
        settings['mcp.servers'] = config.get<any[]>('mcp.servers', []);
        settings['api.useCustomAPI'] = config.get<boolean>('api.useCustomAPI', false);
        settings['api.key'] = config.get<string>('api.key', '');
        settings['api.baseUrl'] = config.get<string>('api.baseUrl', 'https://api.anthropic.com');

        // Get other potentially needed settings
        const allKeys = Object.keys(config);
        for (const key of allKeys) {
            if (!settings.hasOwnProperty(key)) {
                const value = config.get(key);
                if (value !== undefined) {
                    settings[key] = value;
                }
            }
        }

        // ========== Get global and workspace MCP server configurations separately ==========
        const serversInspect = config.inspect<any[]>('mcp.servers');

        settings['mcp.globalServers'] = serversInspect?.globalValue || [];
        settings['mcp.workspaceServers'] = serversInspect?.workspaceValue || [];

        return settings;
    }

    /**
     * Get MCP configuration source info
     * Used in UI to show whether config is from user or workspace level
     */
    public getMcpConfigSource(): { enabled: string; servers: string } {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const enabledInspect = config.inspect<boolean>('mcp.enabled');
        const serversInspect = config.inspect<any[]>('mcp.servers');

        return {
            enabled: enabledInspect?.workspaceValue !== undefined
                ? 'workspace'
                : (enabledInspect?.globalValue !== undefined ? 'user' : 'default'),
            servers: serversInspect?.workspaceValue !== undefined
                ? 'workspace'
                : (serversInspect?.globalValue !== undefined ? 'user' : 'default')
        };
    }

    /**
     * Check if setting key is MCP related
     */
    private isMcpRelatedKey(key: string): boolean {
        return key.startsWith('mcp.');
    }

    /**
     * Check if setting key is project-level configuration
     * These settings are saved to workspace level for project isolation
     * Includes: MCP config, language mode, thinking mode
     */
    private isProjectLevelKey(key: string): boolean {
        // MCP config
        if (key.startsWith('mcp.')) {
            return true;
        }
        // Language mode config (each project may need different language settings)
        if (key.startsWith('language.')) {
            return true;
        }
        // Thinking mode config (each project may need different thinking intensity)
        if (key.startsWith('thinking.')) {
            return true;
        }
        return false;
    }

    /**
     * Get configuration save target
     * @param key Configuration key
     * @returns VS Code configuration target
     */
    private getConfigTargetForKey(key: string): vscode.ConfigurationTarget {
        // Project-level config (MCP, language mode, thinking mode) saved to workspace level
        if (this.isProjectLevelKey(key)) {
            // If no workspace, fall back to global config
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                debugLog('VsCodeConfigManager', `No workspace, project config "${key}" saved to user level`);
                return vscode.ConfigurationTarget.Global;
            }

            // MCP config is controlled by mcpConfigTarget
            if (this.isMcpRelatedKey(key)) {
                if (this._mcpConfigTarget === 'workspace') {
                    return vscode.ConfigurationTarget.Workspace;
                } else {
                    return vscode.ConfigurationTarget.Global;
                }
            }

            // Language mode and thinking mode default to workspace level
            debugLog('VsCodeConfigManager', `Saving project config "${key}" to workspace level`);
            return vscode.ConfigurationTarget.Workspace;
        }

        // Other config saved to user level
        return vscode.ConfigurationTarget.Global;
    }

    /**
     * Update extension settings
     * MCP related config will be saved to level based on mcpConfigTarget
     *
     * Important: For mcp.servers, need to clean up config from the other level,
     * otherwise configs from both levels will merge and delete won't work
     *
     * @param settings Settings to update
     * @returns Promise when settings update completes
     */
    public async updateSettings(settings: { [key: string]: any }): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');

        for (const [key, value] of Object.entries(settings)) {
            const target = this.getConfigTargetForKey(key);
            const targetName = target === vscode.ConfigurationTarget.Workspace ? 'workspace' : 'user';

            debugLog('VsCodeConfigManager', `Saving config "${key}" to ${targetName} level`);
            await config.update(key, value, target);

            // For mcp.servers, need to clean up config from other level
            // Otherwise configs will merge and delete won't seem to work
            if (key === 'mcp.servers') {
                await this.cleanupMcpServersFromOtherLevel(config, target, value);
            }
        }
    }

    /**
     * Clean up mcp.servers config from the other level
     * Ensures delete operations work correctly
     *
     * Strategy:
     * - If saved to user level: clear workspace level mcp.servers
     * - If saved to workspace level: clear user level mcp.servers
     *
     * @param config VS Code configuration object
     * @param savedTarget Target level already saved to
     * @param newServers New server list
     */
    private async cleanupMcpServersFromOtherLevel(
        config: vscode.WorkspaceConfiguration,
        savedTarget: vscode.ConfigurationTarget,
        newServers: any[]
    ): Promise<void> {
        // Check if workspace exists
        const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
        if (!hasWorkspace) {
            // No workspace, no need to clean
            return;
        }

        const serversInspect = config.inspect<any[]>('mcp.servers');

        if (savedTarget === vscode.ConfigurationTarget.Global) {
            // Saved to user level, need to clear workspace level
            if (serversInspect?.workspaceValue !== undefined) {
                debugLog('VsCodeConfigManager', 'Clearing workspace level mcp.servers (prevent config merge)');
                await config.update('mcp.servers', undefined, vscode.ConfigurationTarget.Workspace);
            }
        } else if (savedTarget === vscode.ConfigurationTarget.Workspace) {
            // Saved to workspace level, need to clear user level
            if (serversInspect?.globalValue !== undefined) {
                debugLog('VsCodeConfigManager', 'Clearing user level mcp.servers (prevent config merge)');
                await config.update('mcp.servers', undefined, vscode.ConfigurationTarget.Global);
            }
        }
    }

    /**
     * Method specifically for updating MCP configuration
     * Can specify to save to user or workspace level
     * @param settings MCP related settings
     * @param target Save target: 'user' | 'workspace'
     */
    public async updateMcpSettings(
        settings: { [key: string]: any },
        target: McpConfigTarget = 'workspace'
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const vsTarget = target === 'workspace'
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;

        // If no workspace and target is workspace, fall back to global
        if (target === 'workspace' && (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0)) {
            debugLog('VsCodeConfigManager', 'No workspace, MCP config saved to user level');
            for (const [key, value] of Object.entries(settings)) {
                await config.update(key, value, vscode.ConfigurationTarget.Global);
            }
            return;
        }

        const targetName = target === 'workspace' ? 'workspace' : 'user';
        for (const [key, value] of Object.entries(settings)) {
            debugLog('VsCodeConfigManager', `Saving MCP config "${key}" to ${targetName} level`);
            await config.update(key, value, vsTarget);
        }
    }

    /**
     * Migrate current user-level MCP config to workspace level
     * Used to convert global config to project-specific config
     */
    public async migrateMcpToWorkspace(): Promise<void> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Cannot migrate MCP config: no workspace is open');
            return;
        }

        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const enabledInspect = config.inspect<boolean>('mcp.enabled');
        const serversInspect = config.inspect<any[]>('mcp.servers');

        // Get user level values
        const userEnabled = enabledInspect?.globalValue;
        const userServers = serversInspect?.globalValue;

        // If user level config exists, copy to workspace level
        if (userEnabled !== undefined || (userServers && userServers.length > 0)) {
            if (userEnabled !== undefined) {
                await config.update('mcp.enabled', userEnabled, vscode.ConfigurationTarget.Workspace);
            }
            if (userServers && userServers.length > 0) {
                await config.update('mcp.servers', userServers, vscode.ConfigurationTarget.Workspace);
            }
            debugLog('VsCodeConfigManager', 'MCP config migrated to workspace level');
            vscode.window.showInformationMessage('MCP config copied to current workspace');
        } else {
            vscode.window.showInformationMessage('No user level MCP config found to migrate');
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