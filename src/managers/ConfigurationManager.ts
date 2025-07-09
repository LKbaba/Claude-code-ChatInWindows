/**
 * Configuration Manager for Claude Code Chat VS Code Extension
 * Manages all configuration-related operations including settings and MCP
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface Settings {
    'thinking.intensity': string;
    'mcp.enabled': boolean;
    'mcp.servers': any[];
    [key: string]: any;
}

export interface McpStatus {
    status: 'disabled' | 'configured' | 'testing' | 'connected' | 'error';
    message: string;
    servers?: any[];
}

export class ConfigurationManager {
    /**
     * Gets current extension settings
     * @returns Current settings object
     */
    public getCurrentSettings(): Settings {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return {
            'thinking.intensity': config.get<string>('thinking.intensity', 'think'),
            'mcp.enabled': config.get<boolean>('mcp.enabled', false),
            'mcp.servers': config.get<any[]>('mcp.servers', [])
        };
    }

    /**
     * Updates extension settings
     * @param settings Settings to update
     * @returns Promise resolving when settings are updated
     */
    public async updateSettings(settings: { [key: string]: any }): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        
        try {
            for (const [key, value] of Object.entries(settings)) {
                await config.update(key, value, vscode.ConfigurationTarget.Global);
            }
            
            vscode.window.showInformationMessage('Settings updated successfully');
        } catch (error) {
            console.error('Failed to update settings:', error);
            vscode.window.showErrorMessage('Failed to update settings');
            throw error;
        }
    }

    /**
     * Gets MCP (Model Context Protocol) status
     * @returns MCP status object
     */
    public getMcpStatus(): McpStatus {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const mcpEnabled = config.get('mcp.enabled', false);
        const mcpServers = config.get('mcp.servers', []) as any[];
        
        return {
            status: mcpEnabled ? 'configured' : 'disabled',
            message: mcpEnabled ? `${mcpServers.length} server(s) configured` : 'MCP disabled',
            servers: mcpServers
        };
    }

    /**
     * Builds MCP configuration for Claude CLI
     * @returns MCP configuration object and temp file path
     */
    public async buildMcpConfig(): Promise<{ config: any, configPath: string | null }> {
        const settings = this.getCurrentSettings();
        
        if (!settings['mcp.enabled'] || settings['mcp.servers'].length === 0) {
            return { config: null, configPath: null };
        }

        // Create MCP configuration object
        const mcpConfig: {
            mcpServers: { [key: string]: any }
        } = {
            mcpServers: {}
        };
        
        settings['mcp.servers'].forEach((server) => {
            if (server.name && server.command) {
                // Build server configuration
                const serverConfig: any = {
                    command: server.command
                };
                
                // Add args if provided
                if (server.args) {
                    if (typeof server.args === 'string') {
                        // If args is a string, split it into array
                        serverConfig.args = server.args.trim().split(/\s+/);
                    } else if (Array.isArray(server.args)) {
                        serverConfig.args = server.args;
                    }
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
                                    envObj[key] = value;
                                }
                            });
                            serverConfig.env = envObj;
                        }
                    } else if (typeof server.env === 'object') {
                        serverConfig.env = server.env;
                    }
                }
                
                mcpConfig.mcpServers[server.name] = serverConfig;
            }
        });

        // Write MCP config to a temporary file
        let mcpConfigPath: string | null = null;
        if (Object.keys(mcpConfig.mcpServers).length > 0) {
            try {
                const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-mcp-'));
                mcpConfigPath = path.join(tempDir, 'mcp-config.json');
                fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
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
        const settings = this.getCurrentSettings();
        const mcpEnabled = settings['mcp.enabled'];
        const mcpServers = settings['mcp.servers'];
        
        if (!mcpEnabled || mcpServers.length === 0) {
            return {
                status: 'disabled',
                message: 'MCP is not enabled or no servers configured'
            };
        }

        // Build test configuration
        const { config, configPath } = await this.buildMcpConfig();
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
     * Gets Windows-specific configuration
     * @returns Windows configuration object
     */
    public getWindowsConfig(): {
        gitBashPath: string;
    } {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return {
            gitBashPath: config.get<string>('windows.gitBashPath', 'C:\\Program Files\\Git\\bin\\bash.exe')
        };
    }

    /**
     * Gets thinking mode configuration
     * @returns Thinking intensity setting
     */
    public getThinkingIntensity(): string {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        return config.get<string>('thinking.intensity', 'think');
    }

}