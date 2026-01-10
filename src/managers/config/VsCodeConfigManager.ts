/**
 * VS Code Configuration Manager
 * 管理 VS Code 扩展的通用设置
 *
 * 配置保存策略：
 * - MCP 相关配置（mcp.enabled, mcp.servers）：优先保存到工作区级别，实现项目隔离
 * - 其他配置：保存到用户级别（全局）
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
 * MCP 配置的保存目标
 */
export type McpConfigTarget = 'user' | 'workspace';

export class VsCodeConfigManager {
    /**
     * 当前 MCP 配置保存的目标级别
     * 默认为 'workspace'，让每个项目有独立的 MCP 配置
     */
    private _mcpConfigTarget: McpConfigTarget = 'workspace';

    /**
     * 获取 MCP 配置保存目标
     */
    public getMcpConfigTarget(): McpConfigTarget {
        return this._mcpConfigTarget;
    }

    /**
     * 设置 MCP 配置保存目标
     */
    public setMcpConfigTarget(target: McpConfigTarget): void {
        this._mcpConfigTarget = target;
        debugLog('VsCodeConfigManager', `MCP config target changed to: ${target}`);
    }

    /**
     * 获取当前活动编辑器的资源 URI
     * 用于多根工作区场景下获取正确的配置作用域
     */
    private getActiveResourceUri(): vscode.Uri | undefined {
        // 优先使用活动编辑器的文档 URI
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            return activeEditor.document.uri;
        }

        // 其次使用第一个工作区文件夹
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri;
        }

        return undefined;
    }

    /**
     * 获取当前扩展设置
     * @returns 当前设置对象
     */
    public getCurrentSettings(): VsCodeSettings {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const settings: VsCodeSettings = {
            'thinking.intensity': config.get<string>('thinking.intensity', 'think'),
            'language.enabled': config.get<boolean>('language.enabled', false),
            'language.selected': config.get<string | null>('language.selected', this.getDefaultLanguage())
        };

        // 获取特定配置值
        settings['mcp.enabled'] = config.get<boolean>('mcp.enabled', false);
        settings['mcp.servers'] = config.get<any[]>('mcp.servers', []);
        settings['api.useCustomAPI'] = config.get<boolean>('api.useCustomAPI', false);
        settings['api.key'] = config.get<string>('api.key', '');
        settings['api.baseUrl'] = config.get<string>('api.baseUrl', 'https://api.anthropic.com');

        // 获取其他可能需要的设置
        const allKeys = Object.keys(config);
        for (const key of allKeys) {
            if (!settings.hasOwnProperty(key)) {
                const value = config.get(key);
                if (value !== undefined) {
                    settings[key] = value;
                }
            }
        }

        // ========== 分别获取全局和工作区的 MCP 服务器配置 ==========
        const serversInspect = config.inspect<any[]>('mcp.servers');

        settings['mcp.globalServers'] = serversInspect?.globalValue || [];
        settings['mcp.workspaceServers'] = serversInspect?.workspaceValue || [];

        return settings;
    }

    /**
     * 获取 MCP 配置的来源信息
     * 用于在 UI 中显示配置是来自用户级别还是工作区级别
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
     * 判断设置项是否为 MCP 相关配置
     */
    private isMcpRelatedKey(key: string): boolean {
        return key.startsWith('mcp.');
    }

    /**
     * 获取配置保存目标
     * @param key 配置项的键
     * @returns VS Code 配置目标
     */
    private getConfigTargetForKey(key: string): vscode.ConfigurationTarget {
        // MCP 相关配置根据设置保存到对应级别
        if (this.isMcpRelatedKey(key)) {
            // 如果没有工作区，则回退到全局配置
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                debugLog('VsCodeConfigManager', `No workspace, MCP config "${key}" saved to user level`);
                return vscode.ConfigurationTarget.Global;
            }

            if (this._mcpConfigTarget === 'workspace') {
                return vscode.ConfigurationTarget.Workspace;
            } else {
                return vscode.ConfigurationTarget.Global;
            }
        }

        // 其他配置保存到用户级别
        return vscode.ConfigurationTarget.Global;
    }

    /**
     * 更新扩展设置
     * MCP 相关配置会根据 mcpConfigTarget 保存到对应级别
     *
     * 重要：对于 mcp.servers，需要同时清理另一个级别的配置，
     * 否则两个级别的配置会合并导致删除不生效
     *
     * @param settings 要更新的设置
     * @returns 设置更新完成后的 Promise
     */
    public async updateSettings(settings: { [key: string]: any }): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');

        for (const [key, value] of Object.entries(settings)) {
            const target = this.getConfigTargetForKey(key);
            const targetName = target === vscode.ConfigurationTarget.Workspace ? 'workspace' : 'user';

            debugLog('VsCodeConfigManager', `Saving config "${key}" to ${targetName} level`);
            await config.update(key, value, target);

            // 对于 mcp.servers，需要清理另一个级别的配置
            // 否则两个级别的配置会合并，导致删除操作看起来不生效
            if (key === 'mcp.servers') {
                await this.cleanupMcpServersFromOtherLevel(config, target, value);
            }
        }
    }

    /**
     * 清理另一个级别的 mcp.servers 配置
     * 确保删除操作能正确生效
     *
     * 策略：
     * - 如果保存到用户级别：清空工作区级别的 mcp.servers
     * - 如果保存到工作区级别：清空用户级别的 mcp.servers
     *
     * @param config VS Code 配置对象
     * @param savedTarget 已保存到的目标级别
     * @param newServers 新的服务器列表
     */
    private async cleanupMcpServersFromOtherLevel(
        config: vscode.WorkspaceConfiguration,
        savedTarget: vscode.ConfigurationTarget,
        newServers: any[]
    ): Promise<void> {
        // 检查是否有工作区
        const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
        if (!hasWorkspace) {
            // 没有工作区，无需清理
            return;
        }

        const serversInspect = config.inspect<any[]>('mcp.servers');

        if (savedTarget === vscode.ConfigurationTarget.Global) {
            // 保存到用户级别，需要清空工作区级别
            if (serversInspect?.workspaceValue !== undefined) {
                debugLog('VsCodeConfigManager', 'Clearing workspace level mcp.servers (prevent config merge)');
                await config.update('mcp.servers', undefined, vscode.ConfigurationTarget.Workspace);
            }
        } else if (savedTarget === vscode.ConfigurationTarget.Workspace) {
            // 保存到工作区级别，需要清空用户级别
            if (serversInspect?.globalValue !== undefined) {
                debugLog('VsCodeConfigManager', 'Clearing user level mcp.servers (prevent config merge)');
                await config.update('mcp.servers', undefined, vscode.ConfigurationTarget.Global);
            }
        }
    }

    /**
     * 专门用于更新 MCP 配置的方法
     * 可以指定保存到用户级别还是工作区级别
     * @param settings MCP 相关设置
     * @param target 保存目标：'user' | 'workspace'
     */
    public async updateMcpSettings(
        settings: { [key: string]: any },
        target: McpConfigTarget = 'workspace'
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const vsTarget = target === 'workspace'
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;

        // 如果没有工作区且目标是工作区，回退到全局
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
     * 将当前用户级别的 MCP 配置迁移到工作区级别
     * 用于将全局配置转换为项目特定配置
     */
    public async migrateMcpToWorkspace(): Promise<void> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('无法迁移 MCP 配置：当前没有打开的工作区');
            return;
        }

        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const enabledInspect = config.inspect<boolean>('mcp.enabled');
        const serversInspect = config.inspect<any[]>('mcp.servers');

        // 获取用户级别的值
        const userEnabled = enabledInspect?.globalValue;
        const userServers = serversInspect?.globalValue;

        // 如果有用户级别的配置，复制到工作区级别
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