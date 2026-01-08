/**
 * MCP (Model Context Protocol) Configuration Manager
 * Manages all MCP-related configuration operations
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expandVariables } from '../../utils/configUtils';
import { secretService } from '../../services/SecretService';

export interface McpStatus {
    status: 'disabled' | 'configured' | 'testing' | 'connected' | 'error';
    message: string;
    servers?: any[];
}

export class McpConfigManager {
    /**
     * 获取当前活动编辑器的资源 URI
     * 用于多根工作区场景下获取正确的配置作用域
     * @returns 资源 URI 或 undefined
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
     * 获取合并后的 MCP 服务器配置
     * 优先级：工作区配置 > 用户配置
     * 合并策略：
     *   - 同名服务器：工作区配置覆盖用户配置
     *   - 不同名服务器：合并显示
     *   - disabled: true 的服务器：从最终结果中排除
     * @param resource 可选的资源 URI，用于多根工作区
     * @returns 合并后的服务器列表（已过滤禁用的服务器）
     */
    private getMergedMcpServers(resource?: vscode.Uri): any[] {
        // 使用资源 URI 获取正确作用域的配置
        const resourceUri = resource || this.getActiveResourceUri();
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI', resourceUri);

        // 获取配置的详细信息，包括来源
        const serversInspect = config.inspect<any[]>('mcp.servers');

        // 用户级别配置（全局）
        const userServers = serversInspect?.globalValue || [];
        // 工作区级别配置（项目特定）
        const workspaceServers = serversInspect?.workspaceValue || [];
        // 工作区文件夹级别配置（多根工作区）
        const folderServers = serversInspect?.workspaceFolderValue || [];

        // 如果工作区或文件夹有配置，进行智能合并
        if (workspaceServers.length > 0 || folderServers.length > 0) {
            // 创建服务器名称到配置的映射
            const serverMap = new Map<string, any>();

            // 首先添加用户级别的服务器
            for (const server of userServers) {
                if (server.name) {
                    serverMap.set(server.name, server);
                }
            }

            // 然后用工作区级别的服务器覆盖/添加
            for (const server of workspaceServers) {
                if (server.name) {
                    serverMap.set(server.name, server);
                }
            }

            // 最后用文件夹级别的服务器覆盖/添加
            for (const server of folderServers) {
                if (server.name) {
                    serverMap.set(server.name, server);
                }
            }

            // 过滤掉 disabled: true 的服务器
            const mergedServers = Array.from(serverMap.values())
                .filter(server => !server.disabled);

            console.log('[McpConfigManager] MCP servers merged:', {
                userCount: userServers.length,
                workspaceCount: workspaceServers.length,
                folderCount: folderServers.length,
                mergedCount: mergedServers.length,
                resourceUri: resourceUri?.toString() || 'none'
            });

            return mergedServers;
        }

        // 没有工作区配置，直接返回默认获取的值（VS Code 会自动选择最具体的配置）
        // 同样需要过滤 disabled 的服务器
        const servers = config.get<any[]>('mcp.servers', []);
        return servers.filter(server => !server.disabled);
    }

    /**
     * 获取 MCP 启用状态
     * VS Code 的 config.get() 已自动处理作用域优先级
     * @param resource 可选的资源 URI，用于多根工作区
     * @returns MCP 是否启用
     */
    private getMcpEnabled(resource?: vscode.Uri): boolean {
        const resourceUri = resource || this.getActiveResourceUri();
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI', resourceUri);
        // VS Code 自动按优先级返回：workspaceFolder > workspace > user > default
        return config.get<boolean>('mcp.enabled', false);
    }

    /**
     * Gets MCP (Model Context Protocol) status
     * @returns MCP status object
     */
    public getMcpStatus(): McpStatus {
        const mcpEnabled = this.getMcpEnabled();
        const mcpServers = this.getMergedMcpServers();

        // Only report as configured if MCP is enabled AND there are servers
        const isActuallyConfigured = mcpEnabled && mcpServers.length > 0;

        return {
            status: isActuallyConfigured ? 'configured' : 'disabled',
            message: isActuallyConfigured
                ? `${mcpServers.length} server(s) configured`
                : (mcpEnabled ? 'MCP enabled but no servers configured' : 'MCP disabled'),
            servers: isActuallyConfigured ? mcpServers : []
        };
    }

    /**
     * Builds MCP configuration for Claude CLI
     * @returns MCP configuration object and temp file path
     */
    public async buildMcpConfig(): Promise<{ config: any, configPath: string | null }> {
        const mcpEnabled = this.getMcpEnabled();
        const mcpServers = this.getMergedMcpServers();
        
        if (!mcpEnabled || mcpServers.length === 0) {
            // Clean up old MCP configs when MCP is disabled or no servers
            await this.cleanupOldMcpConfigs();
            return { config: null, configPath: null };
        }

        // Create MCP configuration object
        const mcpConfig: {
            mcpServers: { [key: string]: any }
        } = {
            mcpServers: {}
        };
        
        mcpServers.forEach((server) => {
            // Validate server name
            if (!server.name) {
                console.warn('[MCP] Server missing name, skipping');
                return;
            }

            const serverConfig: any = {};
            const serverType = server.type || 'stdio'; // Default to stdio

            console.log(`[MCP] Processing server: ${server.name}, type: ${serverType}`);

            if (serverType === 'http' || serverType === 'sse') {
                // ===== HTTP/SSE mode =====
                if (!server.url) {
                    console.warn(`[MCP] Server ${server.name} is ${serverType} type but missing url`);
                    return;
                }

                serverConfig.type = serverType;
                serverConfig.url = server.url;

                // Add headers if any
                if (server.headers && typeof server.headers === 'object') {
                    serverConfig.headers = server.headers;
                }

            } else {
                // ===== stdio mode (original logic) =====
                if (!server.command) {
                    console.warn(`[MCP] Server ${server.name} is stdio type but missing command`);
                    return;
                }

                let command = expandVariables(server.command);
                let args: string[] = [];
                let originalCommand = command; // Save original command for logging

                // On Windows, certain commands need cmd /c wrapper
                const windowsCommandsNeedingWrapper = ['npx', 'npm', 'node'];
                const needsWindowsWrapper = process.platform === 'win32' &&
                    windowsCommandsNeedingWrapper.includes(command.toLowerCase());

                if (needsWindowsWrapper) {
                    // Convert command to cmd /c format
                    command = 'cmd';
                    args = ['/c', originalCommand];

                    // Add original args
                    if (server.args) {
                        if (typeof server.args === 'string') {
                            args.push(...server.args.trim().split(/\s+/).map((arg: string) => expandVariables(arg)));
                        } else if (Array.isArray(server.args)) {
                            args.push(...server.args.map((arg: any) =>
                                typeof arg === 'string' ? expandVariables(arg) : arg
                            ));
                        }
                    }
                } else {
                    // Non-Windows or non-npx command, use original logic
                    if (server.args) {
                        if (typeof server.args === 'string') {
                            args = server.args.trim().split(/\s+/).map((arg: string) => expandVariables(arg));
                        } else if (Array.isArray(server.args)) {
                            args = server.args.map((arg: any) =>
                                typeof arg === 'string' ? expandVariables(arg) : arg
                            );
                        }
                    }
                }

                // Build server configuration
                serverConfig.command = command;

                // Add args if any
                if (args.length > 0) {
                    serverConfig.args = args;
                }

                // Add env if provided
                if (server.env) {
                    if (typeof server.env === 'string') {
                        try {
                            // Try to parse as JSON
                            serverConfig.env = JSON.parse(server.env);
                        } catch (e) {
                            // If not JSON, treat as key=value pairs
                            const envObj: any = {};
                            server.env.split(/\s+/).forEach((pair: string) => {
                                const [key, value] = pair.split('=');
                                if (key && value) {
                                    envObj[key] = expandVariables(value);
                                }
                            });
                            serverConfig.env = envObj;
                        }
                    } else if (typeof server.env === 'object') {
                        // Expand variables in object values
                        const expandedEnv: any = {};
                        for (const [key, value] of Object.entries(server.env)) {
                            let expandedValue = typeof value === 'string' ? expandVariables(value) : value;

                            // Normalize Windows paths
                            if (typeof expandedValue === 'string' && process.platform === 'win32') {
                                // Ensure proper path separators for Windows
                                expandedValue = path.normalize(expandedValue);
                            }

                            expandedEnv[key] = expandedValue;
                        }
                        serverConfig.env = expandedEnv;
                    }
                }

                // Log Windows config conversion
                if (process.platform === 'win32' && originalCommand !== serverConfig.command) {
                    console.log(`[McpConfigManager] Windows cmd wrapper applied for server '${server.name}':`, {
                        originalCommand: originalCommand,
                        convertedCommand: serverConfig.command,
                        args: serverConfig.args
                    });
                }
            }

            // Add to config
            mcpConfig.mcpServers[server.name] = serverConfig;
        });

        // ==================== Gemini API Key 运行时注入 ====================
        // 检查是否需要将 SecretStorage 中的 Gemini API Key 注入到 gemini-assistant 服务器
        await this.injectGeminiApiKeyIfNeeded(mcpConfig);

        // Write MCP config to a temporary file in ~/.claude directory
        let mcpConfigPath: string | null = null;
        if (Object.keys(mcpConfig.mcpServers).length > 0) {
            try {
                // Use ~/.claude directory for temporary files (Claude Code v1.0.48+)
                const homeDir = os.homedir();
                const claudeDir = path.join(homeDir, '.claude');
                
                // Ensure ~/.claude directory exists
                if (!fs.existsSync(claudeDir)) {
                    fs.mkdirSync(claudeDir, { recursive: true });
                }
                
                // Create temp directory within ~/.claude
                const tempDir = fs.mkdtempSync(path.join(claudeDir, 'mcp-'));
                mcpConfigPath = path.join(tempDir, 'mcp-config.json');
                
                // Log configuration before writing
                console.log('[buildMcpConfig] Generated MCP configuration:', JSON.stringify(mcpConfig, null, 2));
                
                fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
                
                // Verify the file was written correctly
                const writtenContent = fs.readFileSync(mcpConfigPath, 'utf8');
                console.log('[buildMcpConfig] Written MCP config file:', mcpConfigPath);
                console.log('[buildMcpConfig] File content:', writtenContent);
            } catch (error) {
                console.error('Failed to write MCP config file:', error);
                throw new Error(`Failed to write MCP configuration: ${error}`);
            }
        }

        return { config: mcpConfig, configPath: mcpConfigPath };
    }

    /**
     * Tests MCP connection by spawning a test process
     * @param getExecutionEnvironment Function to get execution environment
     * @returns Promise resolving to test results
     */
    public async testMcpConnection(
        getExecutionEnvironment: () => Promise<{ spawnOptions: cp.SpawnOptions, claudeExecutablePath: string | undefined }>
    ): Promise<McpStatus> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const mcpEnabled = config.get<boolean>('mcp.enabled', false);
        const mcpServers = config.get<any[]>('mcp.servers', []);
        
        if (!mcpEnabled || mcpServers.length === 0) {
            return {
                status: 'disabled',
                message: 'MCP is not enabled or no servers configured'
            };
        }

        // Build test configuration
        const { config: mcpConfig, configPath } = await this.buildMcpConfig();
        if (!configPath) {
            return {
                status: 'error',
                message: 'Failed to create MCP configuration'
            };
        }

        try {
            const { spawnOptions, claudeExecutablePath } = await getExecutionEnvironment();
            if (!claudeExecutablePath) {
                throw new Error("Claude executable path could not be determined.");
            }
            
            // Merge MCP server environment variables
            mcpServers.forEach(server => {
                if (server.env && typeof server.env === 'object') {
                    spawnOptions.env = { ...spawnOptions.env, ...server.env };
                }
            });
            
            // Test the MCP connection by running a simple command
            const args = ['--version', '--mcp-config', configPath];
            const testProcess = cp.spawn(claudeExecutablePath, args, spawnOptions);
            
            return new Promise((resolve) => {
                let output = '';
                let error = '';
                
                testProcess.stdout?.on('data', (data) => {
                    output += data.toString();
                });
                
                testProcess.stderr?.on('data', (data) => {
                    error += data.toString();
                });
                
                testProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve({
                            status: 'connected',
                            message: `Successfully connected to ${mcpServers.length} MCP server(s)`,
                            servers: mcpServers.map(s => ({ name: s.name, status: 'active' }))
                        });
                    } else {
                        const errorMessage = error || output || 'Unknown error';
                        resolve({
                            status: 'error',
                            message: `MCP test failed: ${errorMessage.substring(0, 100)}...`,
                            servers: mcpServers.map(s => ({ name: s.name, status: 'error' }))
                        });
                    }
                });
                
                testProcess.on('error', (err) => {
                    resolve({
                        status: 'error',
                        message: `Failed to test MCP: ${err.message}`,
                        servers: mcpServers.map(s => ({ name: s.name, status: 'error' }))
                    });
                });
            });
        } catch (error: any) {
            return {
                status: 'error',
                message: `Failed to test MCP: ${error.message}`,
                servers: mcpServers.map(s => ({ name: s.name, status: 'error' }))
            };
        }
    }

    // ==================== Gemini API Key 注入相关方法 ====================

    /**
     * 检查服务器配置是否为 Gemini MCP 服务器
     * 通过名称或参数中的特征识别
     * @param serverName 服务器名称
     * @param serverConfig 服务器配置
     * @returns 是否为 Gemini 服务器
     */
    private isGeminiServer(serverName: string, serverConfig: any): boolean {
        // 检查服务器名称是否包含 'gemini'
        if (serverName.toLowerCase().includes('gemini')) {
            return true;
        }

        // 检查参数是否包含 Gemini-mcp 相关内容
        if (serverConfig.args && Array.isArray(serverConfig.args)) {
            const argsString = serverConfig.args.join(' ').toLowerCase();
            if (argsString.includes('gemini-mcp') || argsString.includes('gemini_mcp')) {
                return true;
            }
        }

        return false;
    }

    /**
     * 如果启用了 Gemini Integration，将安全存储的 API Key 注入到 Gemini 服务器配置中
     * @param mcpConfig MCP 配置对象
     */
    private async injectGeminiApiKeyIfNeeded(mcpConfig: { mcpServers: { [key: string]: any } }): Promise<void> {
        try {
            // 检查是否应该注入 API Key
            const shouldInject = await secretService.shouldInjectGeminiApiKey();

            if (!shouldInject) {
                console.log('[McpConfigManager] Gemini Integration not enabled or API Key not set, skipping injection');
                return;
            }

            // 获取安全存储的 API Key
            const apiKey = await secretService.getGeminiApiKey();
            if (!apiKey) {
                console.log('[McpConfigManager] Unable to get Gemini API Key, skipping injection');
                return;
            }

            // 遍历所有服务器，找到 Gemini 服务器并注入 API Key
            let injectedCount = 0;
            for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
                if (this.isGeminiServer(serverName, serverConfig)) {
                    // 确保 env 对象存在
                    if (!serverConfig.env) {
                        serverConfig.env = {};
                    }

                    // 注入 API Key（覆盖原有的占位符或值）
                    const originalKey = serverConfig.env.GEMINI_API_KEY;
                    serverConfig.env.GEMINI_API_KEY = apiKey;
                    injectedCount++;

                    console.log(`[McpConfigManager] Injected Gemini API Key into server '${serverName}'`, {
                        hadOriginalKey: !!originalKey,
                        originalKeyMasked: originalKey ? `${originalKey.substring(0, 4)}...` : 'none'
                    });
                }
            }

            if (injectedCount > 0) {
                console.log(`[McpConfigManager] Gemini API Key injection complete, injected into ${injectedCount} server(s)`);
            } else {
                console.log('[McpConfigManager] No Gemini server found, no API Key injection needed');
            }

        } catch (error) {
            console.error('[McpConfigManager] Gemini API Key injection failed:', error);
            // 注入失败不应阻止 MCP 配置继续，只记录错误
        }
    }

    /**
     * Cleans up old MCP configuration files
     */
    public async cleanupOldMcpConfigs(): Promise<void> {
        try {
            const homeDir = os.homedir();
            const claudeDir = path.join(homeDir, '.claude');
            
            if (!fs.existsSync(claudeDir)) {
                return;
            }
            
            // Delete all old mcp-* temporary directories
            const entries = fs.readdirSync(claudeDir);
            for (const entry of entries) {
                if (entry.startsWith('mcp-')) {
                    const fullPath = path.join(claudeDir, entry);
                    try {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        console.log('[cleanupOldMcpConfigs] Removed old MCP config:', fullPath);
                    } catch (error) {
                        console.error('[cleanupOldMcpConfigs] Failed to remove:', fullPath, error);
                    }
                }
            }
        } catch (error) {
            console.log('[cleanupOldMcpConfigs] Error cleaning up old MCP configs:', error);
        }
    }
}