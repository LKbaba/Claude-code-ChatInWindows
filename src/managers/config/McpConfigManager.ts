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
import { debugLog, debugWarn, debugError } from '../../services/DebugLogger';

export interface McpStatus {
    status: 'disabled' | 'configured' | 'testing' | 'connected' | 'error';
    message: string;
    servers?: any[];
}

export class McpConfigManager {
    /**
     * Get current active editor's resource URI
     * Used to get correct configuration scope in multi-root workspace scenarios
     * @returns Resource URI or undefined
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
     * Get merged MCP server configuration
     * Priority: workspace config > user config
     * Merge strategy:
     *   - Same name servers: workspace config overrides user config
     *   - Different name servers: merge and display all
     *   - disabled: true servers: excluded from final result
     * @param resource Optional resource URI for multi-root workspace
     * @returns Merged server list (filtered out disabled servers)
     */
    private getMergedMcpServers(resource?: vscode.Uri): any[] {
        // Use resource URI to get correct scope configuration
        const resourceUri = resource || this.getActiveResourceUri();
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI', resourceUri);

        // Get configuration details including source
        const serversInspect = config.inspect<any[]>('mcp.servers');

        // User level configuration (global)
        const userServers = serversInspect?.globalValue || [];
        // Workspace level configuration (project specific)
        const workspaceServers = serversInspect?.workspaceValue || [];
        // Workspace folder level configuration (multi-root workspace)
        const folderServers = serversInspect?.workspaceFolderValue || [];

        // Create server name to config mapping for smart merging
        const serverMap = new Map<string, any>();

        // First add user level servers (global)
        for (const server of userServers) {
            if (server.name) {
                serverMap.set(server.name, server);
            }
        }

        // Then override/add with workspace level servers
        for (const server of workspaceServers) {
            if (server.name) {
                serverMap.set(server.name, server);
            }
        }

        // Finally override/add with folder level servers
        for (const server of folderServers) {
            if (server.name) {
                serverMap.set(server.name, server);
            }
        }

        // Filter out disabled: true servers
        const mergedServers = Array.from(serverMap.values())
            .filter(server => !server.disabled);

        debugLog('McpConfigManager', 'MCP servers merged', {
            userCount: userServers.length,
            workspaceCount: workspaceServers.length,
            folderCount: folderServers.length,
            mergedCount: mergedServers.length,
            resourceUri: resourceUri?.toString() || 'none'
        });

        return mergedServers;
    }

    /**
     * Get MCP enabled status
     * VS Code's config.get() already handles scope priority automatically
     * @param resource Optional resource URI for multi-root workspace
     * @returns Whether MCP is enabled
     */
    private getMcpEnabled(resource?: vscode.Uri): boolean {
        const resourceUri = resource || this.getActiveResourceUri();
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI', resourceUri);
        // VS Code automatically returns by priority: workspaceFolder > workspace > user > default
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
                debugWarn('McpConfigManager', 'Server missing name, skipping');
                return;
            }

            const serverConfig: any = {};
            const serverType = server.type || 'stdio'; // Default to stdio

            if (serverType === 'http' || serverType === 'sse') {
                // ===== HTTP/SSE mode =====
                if (!server.url) {
                    debugWarn('McpConfigManager', `Server ${server.name} is ${serverType} type but missing url`);
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
                    debugWarn('McpConfigManager', `Server ${server.name} is stdio type but missing command`);
                    return;
                }

                let command = expandVariables(server.command);
                let args: string[] = [];
                let originalCommand = command; // Save original command for logging

                // On Windows, certain commands need cmd /c wrapper
                const windowsCommandsNeedingWrapper = ['npx', 'npm', 'node'];
                const needsWindowsWrapper = process.platform === 'win32' &&
                    windowsCommandsNeedingWrapper.includes(command.toLowerCase());

                // Helper function: normalize args to correct array format
                // Handle incorrectly split array elements (e.g., ["-y @pkg-", "name"] -> ["-y", "@pkg-name"])
                const normalizeArgs = (rawArgs: string | string[]): string[] => {
                    let argsStr: string;
                    if (typeof rawArgs === 'string') {
                        argsStr = rawArgs.trim();
                    } else if (Array.isArray(rawArgs)) {
                        // Join array elements into string, then re-split
                        argsStr = rawArgs.join(' ').trim();
                    } else {
                        return [];
                    }

                    if (!argsStr) return [];

                    // Split by whitespace, preserving each argument's integrity
                    return argsStr.split(/\s+/).filter(arg => arg.length > 0).map(expandVariables);
                };

                if (needsWindowsWrapper) {
                    // Convert command to cmd /c format
                    command = 'cmd';
                    args = ['/c', originalCommand];

                    // Add original args
                    if (server.args) {
                        args.push(...normalizeArgs(server.args));
                    }
                } else {
                    // Non-Windows or non-npx command, use original logic
                    if (server.args) {
                        args = normalizeArgs(server.args);
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
                    debugLog('McpConfigManager', `Windows cmd wrapper applied for server '${server.name}'`, {
                        originalCommand: originalCommand,
                        convertedCommand: serverConfig.command,
                        args: serverConfig.args
                    });
                }
            }

            // Add to config
            mcpConfig.mcpServers[server.name] = serverConfig;
        });

        // ==================== Gemini API Key Runtime Injection ====================
        // Check if Gemini API Key from SecretStorage needs to be injected into gemini-assistant server
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
                debugLog('buildMcpConfig', 'Generated MCP configuration', mcpConfig);

                fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

                // Verify the file was written correctly
                const writtenContent = fs.readFileSync(mcpConfigPath, 'utf8');
                debugLog('buildMcpConfig', `Written MCP config file: ${mcpConfigPath}`);
                debugLog('buildMcpConfig', 'File content', JSON.parse(writtenContent));
            } catch (error) {
                debugError('buildMcpConfig', 'Failed to write MCP config file', error);
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

        // Use getMergedMcpServers to get merged server list (global + workspace)
        const mcpServers = this.getMergedMcpServers();

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

    // ==================== Gemini API Key Injection Related Methods ====================

    /**
     * Check if server config is a Gemini MCP server
     * Identify by name or characteristics in arguments
     * @param serverName Server name
     * @param serverConfig Server configuration
     * @returns Whether it's a Gemini server
     */
    private isGeminiServer(serverName: string, serverConfig: any): boolean {
        // Check if server name contains 'gemini'
        if (serverName.toLowerCase().includes('gemini')) {
            return true;
        }

        // Check if args contain Gemini-mcp related content
        if (serverConfig.args && Array.isArray(serverConfig.args)) {
            const argsString = serverConfig.args.join(' ').toLowerCase();
            if (argsString.includes('gemini-mcp') || argsString.includes('gemini_mcp')) {
                return true;
            }
        }

        return false;
    }

    /**
     * If Gemini Integration is enabled, inject securely stored API Key into Gemini server config
     * @param mcpConfig MCP configuration object
     */
    private async injectGeminiApiKeyIfNeeded(mcpConfig: { mcpServers: { [key: string]: any } }): Promise<void> {
        try {
            // Check if API Key should be injected
            const shouldInject = await secretService.shouldInjectGeminiApiKey();

            if (!shouldInject) {
                debugLog('McpConfigManager', 'Gemini Integration not enabled or API Key not set, skipping injection');
                return;
            }

            // Get securely stored API Key
            const apiKey = await secretService.getGeminiApiKey();
            if (!apiKey) {
                debugLog('McpConfigManager', 'Unable to get Gemini API Key, skipping injection');
                return;
            }

            // Iterate all servers, find Gemini servers and inject API Key
            let injectedCount = 0;
            for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
                if (this.isGeminiServer(serverName, serverConfig)) {
                    // Ensure env object exists
                    if (!serverConfig.env) {
                        serverConfig.env = {};
                    }

                    // Inject API Key (override original placeholder or value)
                    const originalKey = serverConfig.env.GEMINI_API_KEY;
                    serverConfig.env.GEMINI_API_KEY = apiKey;
                    injectedCount++;

                    debugLog('McpConfigManager', `Injected Gemini API Key into server '${serverName}'`, {
                        hadOriginalKey: !!originalKey,
                        originalKeyMasked: originalKey ? `${originalKey.substring(0, 4)}...` : 'none'
                    });
                }
            }

            if (injectedCount > 0) {
                debugLog('McpConfigManager', `Gemini API Key injection complete, injected into ${injectedCount} server(s)`);
            } else {
                debugLog('McpConfigManager', 'No Gemini server found, no API Key injection needed');
            }

        } catch (error) {
            debugError('McpConfigManager', 'Gemini API Key injection failed', error);
            // Injection failure should not block MCP config, just log the error
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
                        debugLog('cleanupOldMcpConfigs', `Removed old MCP config: ${fullPath}`);
                    } catch (error) {
                        debugError('cleanupOldMcpConfigs', `Failed to remove: ${fullPath}`, error);
                    }
                }
            }
        } catch (error) {
            debugLog('cleanupOldMcpConfigs', 'Error cleaning up old MCP configs', error);
        }
    }
}