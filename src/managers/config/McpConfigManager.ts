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

export interface McpStatus {
    status: 'disabled' | 'configured' | 'testing' | 'connected' | 'error';
    message: string;
    servers?: any[];
}

export class McpConfigManager {
    /**
     * Gets MCP (Model Context Protocol) status
     * @returns MCP status object
     */
    public getMcpStatus(): McpStatus {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const mcpEnabled = config.get('mcp.enabled', false);
        const mcpServers = config.get('mcp.servers', []) as any[];
        
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
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const mcpEnabled = config.get<boolean>('mcp.enabled', false);
        const mcpServers = config.get<any[]>('mcp.servers', []);
        
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
            if (server.name && server.command) {
                let command = expandVariables(server.command);
                let args: string[] = [];
                let originalCommand = command; // 保存原始命令用于日志
                
                // 在Windows上，某些命令需要使用cmd /c包装器
                const windowsCommandsNeedingWrapper = ['npx', 'npm', 'node'];
                const needsWindowsWrapper = process.platform === 'win32' && 
                    windowsCommandsNeedingWrapper.includes(command.toLowerCase());
                
                if (needsWindowsWrapper) {
                    // 将命令转换为cmd /c格式
                    command = 'cmd';
                    args = ['/c', originalCommand];
                    
                    // 添加原始的args
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
                    // 非Windows或非npx命令，使用原始逻辑
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
                const serverConfig: any = {
                    command: command
                };
                
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
                
                mcpConfig.mcpServers[server.name] = serverConfig;
                
                // 记录Windows下的配置转换
                if (process.platform === 'win32' && originalCommand !== serverConfig.command) {
                    console.log(`[McpConfigManager] Windows cmd wrapper applied for server '${server.name}':`, {
                        originalCommand: originalCommand,
                        convertedCommand: serverConfig.command,
                        args: serverConfig.args
                    });
                }
            }
        });

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