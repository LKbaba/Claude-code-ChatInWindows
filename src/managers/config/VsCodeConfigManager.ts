/**
 * VS Code Configuration Manager
 * Manages general settings for the VS Code extension
 *
 * Configuration save strategy:
 * - mcp.enabled: a master switch (not per-project state) — saved to user level (global)
 * - mcp.servers: NOT handled here; managed exclusively via the scope-isolated
 *   path A (_updateMcpServersForScope), which writes global/workspace explicitly
 * - language.* / thinking.*: saved to workspace level for project isolation
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

export class VsCodeConfigManager {
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
            'thinking.intensity': VsCodeConfigManager.normalizeThinkingIntensity(config.get<string>('thinking.intensity', 'think')),
            'language.enabled': config.get<boolean>('language.enabled', false),
            'language.selected': config.get<string | null>('language.selected', this.getDefaultLanguage()),
            'language.onlyCommunicate': config.get<boolean>('language.onlyCommunicate', false)
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

            // mcp.enabled is a master switch, not per-project state — always user level.
            // (mcp.servers never reaches here: it is stripped from the generic settings
            // path and handled exclusively by the scope-isolated path A.)
            if (this.isMcpRelatedKey(key)) {
                return vscode.ConfigurationTarget.Global;
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
     * Each key is routed to its configuration level via getConfigTargetForKey().
     * mcp.servers is never processed here (handled by the scope-isolated path A).
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
        }
    }

    /**
     * Gets the thinking intensity setting
     * @returns The thinking intensity value
     */
    public getThinkingIntensity(): string {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return VsCodeConfigManager.normalizeThinkingIntensity(config.get<string>('thinking.intensity', 'think'));
    }

    /**
     * The "xhigh" thinking level was removed in v4.1.8 (real effort levels now live in
     * the model config and share that name). Saved values map to the nearest level.
     */
    private static normalizeThinkingIntensity(value: string): string {
        return value === 'xhigh' ? 'ultrathink' : value;
    }

    /**
     * Rewrite a saved "xhigh" thinking intensity to "ultrathink" in every scope it
     * was set (user, workspace, each workspace folder). No-op when not present.
     */
    public async migrateLegacyThinkingIntensity(): Promise<void> {
        const key = 'thinking.intensity';
        const rootConfig = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const rootInspect = rootConfig.inspect<string>(key);
        if (rootInspect?.globalValue === 'xhigh') {
            await rootConfig.update(key, 'ultrathink', vscode.ConfigurationTarget.Global);
        }
        if (rootInspect?.workspaceValue === 'xhigh') {
            await rootConfig.update(key, 'ultrathink', vscode.ConfigurationTarget.Workspace);
        }
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const folderConfig = vscode.workspace.getConfiguration('claudeCodeChatUI', folder.uri);
            const folderInspect = folderConfig.inspect<string>(key);
            // In a single-folder workspace the folder value is the workspace value (already handled)
            if (folderInspect?.workspaceFolderValue === 'xhigh' && vscode.workspace.workspaceFile) {
                await folderConfig.update(key, 'ultrathink', vscode.ConfigurationTarget.WorkspaceFolder);
            }
        }
    }

    /**
     * Gets the configured context window size (tokens).
     * Clamped to [100000, 1000000] to guard against out-of-range values
     * hand-edited in settings.json (100K lower bound is a hard CLI constraint:
     * below system prompt + first message the CLI errors with "Prompt is too long").
     */
    public getContextWindowTokens(): number {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const value = config.get<number>('contextWindowTokens', 400000);
        return Math.max(100000, Math.min(1000000, value));
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