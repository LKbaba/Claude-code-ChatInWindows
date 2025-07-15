/**
 * Configuration Manager Facade
 * Provides backward compatibility by combining all configuration managers
 */

import * as cp from 'child_process';
import { VsCodeConfigManager, VsCodeSettings } from './VsCodeConfigManager';
import { McpConfigManager, McpStatus } from './McpConfigManager';
import { ApiConfigManager, ApiConfig, WindowsConfig } from './ApiConfigManager';

export interface Settings extends VsCodeSettings {
    'mcp.enabled': boolean;
    'mcp.servers': any[];
    'api.useCustomAPI': boolean;
    'api.key': string;
    'api.baseUrl': string;
}

export class ConfigurationManagerFacade {
    private vsCodeManager: VsCodeConfigManager;
    private mcpManager: McpConfigManager;
    private apiManager: ApiConfigManager;

    constructor() {
        this.vsCodeManager = new VsCodeConfigManager();
        this.mcpManager = new McpConfigManager();
        this.apiManager = new ApiConfigManager();
    }

    /**
     * Gets current extension settings (combines all managers)
     */
    public getCurrentSettings(): Settings {
        const vsCodeSettings = this.vsCodeManager.getCurrentSettings();
        const apiConfig = this.apiManager.getApiConfig();
        
        return {
            ...vsCodeSettings,
            'mcp.enabled': vsCodeSettings['mcp.enabled'] || false,
            'mcp.servers': vsCodeSettings['mcp.servers'] || [],
            'api.useCustomAPI': apiConfig.useCustomAPI,
            'api.key': apiConfig.key,
            'api.baseUrl': apiConfig.baseUrl
        };
    }

    /**
     * Updates extension settings
     */
    public async updateSettings(settings: { [key: string]: any }): Promise<void> {
        return this.vsCodeManager.updateSettings(settings);
    }

    /**
     * Gets MCP status
     */
    public getMcpStatus(): McpStatus {
        return this.mcpManager.getMcpStatus();
    }

    /**
     * Builds MCP configuration
     */
    public async buildMcpConfig(): Promise<{ config: any, configPath: string | null }> {
        return this.mcpManager.buildMcpConfig();
    }

    /**
     * Tests MCP connection
     */
    public async testMcpConnection(
        getExecutionEnvironment: () => Promise<{ spawnOptions: cp.SpawnOptions, claudeExecutablePath: string | undefined }>
    ): Promise<McpStatus> {
        return this.mcpManager.testMcpConnection(getExecutionEnvironment);
    }

    /**
     * Gets Windows configuration
     */
    public getWindowsConfig(): WindowsConfig {
        return this.apiManager.getWindowsConfig();
    }

    /**
     * Gets thinking intensity
     */
    public getThinkingIntensity(): string {
        return this.vsCodeManager.getThinkingIntensity();
    }

    /**
     * Gets API configuration
     */
    public getApiConfig(): ApiConfig {
        return this.apiManager.getApiConfig();
    }

    /**
     * Updates API key
     */
    public async updateApiKey(apiKey: string): Promise<void> {
        return this.apiManager.updateApiKey(apiKey);
    }

    /**
     * Gets API key
     */
    public getApiKey(): string {
        return this.apiManager.getApiKey();
    }

    /**
     * Cleans up old MCP configs
     */
    public async cleanupOldMcpConfigs(): Promise<void> {
        return this.mcpManager.cleanupOldMcpConfigs();
    }
}