/**
 * SecretService - 安全存储服务
 * 使用 VS Code SecretStorage API 安全存储敏感信息（如 API Keys）
 *
 * 主要功能：
 * - 安全存储和获取 Gemini API Key
 * - 支持其他敏感配置的扩展
 */

import * as vscode from 'vscode';
import { debugLog, debugError } from './DebugLogger';

// 存储键常量
const SECRET_KEYS = {
    GEMINI_API_KEY: 'gemini-api-key',
    GEMINI_ENABLED: 'gemini-integration-enabled'
} as const;

// VS Code 配置键常量
const CONFIG_KEYS = {
    GEMINI_ENABLED: 'claudeCodeChatUI.geminiIntegrationEnabled'
} as const;

/**
 * Gemini 集成配置接口
 */
export interface GeminiIntegrationConfig {
    enabled: boolean;           // 是否启用 Gemini Integration
    apiKey: string | undefined; // Gemini API Key
}

/**
 * SecretService 单例类
 * 管理所有敏感数据的安全存储
 */
export class SecretService {
    private static instance: SecretService | undefined;
    private secrets: vscode.SecretStorage | undefined;
    private context: vscode.ExtensionContext | undefined;

    private constructor() {}

    /**
     * 获取 SecretService 单例实例
     */
    public static getInstance(): SecretService {
        if (!SecretService.instance) {
            SecretService.instance = new SecretService();
        }
        return SecretService.instance;
    }

    /**
     * 初始化 SecretService
     * 必须在使用其他方法之前调用
     * @param context VS Code 扩展上下文
     */
    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        this.secrets = context.secrets;
        debugLog('SecretService', 'Initialized successfully');
    }

    /**
     * 检查服务是否已初始化
     */
    private ensureInitialized(): void {
        if (!this.secrets || !this.context) {
            throw new Error('[SecretService] 服务未初始化。请先调用 initialize() 方法。');
        }
    }

    // ==================== Gemini API Key 相关方法 ====================

    /**
     * 获取 Gemini API Key
     * @returns API Key 或 undefined（如果未设置）
     */
    public async getGeminiApiKey(): Promise<string | undefined> {
        this.ensureInitialized();
        try {
            const apiKey = await this.secrets!.get(SECRET_KEYS.GEMINI_API_KEY);
            debugLog('SecretService', `Get Gemini API Key: ${apiKey ? 'configured' : 'not set'}`);
            return apiKey;
        } catch (error) {
            debugError('SecretService', 'Failed to get Gemini API Key', error);
            return undefined;
        }
    }

    /**
     * 设置 Gemini API Key
     * @param apiKey 要存储的 API Key
     */
    public async setGeminiApiKey(apiKey: string): Promise<void> {
        this.ensureInitialized();
        try {
            await this.secrets!.store(SECRET_KEYS.GEMINI_API_KEY, apiKey);
            debugLog('SecretService', 'Gemini API Key stored securely');
        } catch (error) {
            debugError('SecretService', 'Failed to store Gemini API Key', error);
            throw error;
        }
    }

    /**
     * 删除 Gemini API Key
     */
    public async deleteGeminiApiKey(): Promise<void> {
        this.ensureInitialized();
        try {
            await this.secrets!.delete(SECRET_KEYS.GEMINI_API_KEY);
            debugLog('SecretService', 'Gemini API Key deleted');
        } catch (error) {
            debugError('SecretService', 'Failed to delete Gemini API Key', error);
            throw error;
        }
    }

    // ==================== Gemini Integration 配置方法 ====================

    /**
     * 获取 Gemini Integration 是否启用
     * @returns 启用状态
     */
    public getGeminiIntegrationEnabled(): boolean {
        const config = vscode.workspace.getConfiguration();
        return config.get<boolean>(CONFIG_KEYS.GEMINI_ENABLED, false);
    }

    /**
     * 设置 Gemini Integration 启用状态
     * @param enabled 是否启用
     */
    public async setGeminiIntegrationEnabled(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration();
        await config.update(CONFIG_KEYS.GEMINI_ENABLED, enabled, vscode.ConfigurationTarget.Global);
        debugLog('SecretService', `Gemini Integration status updated: ${enabled}`);
    }

    /**
     * 获取完整的 Gemini 集成配置
     * @returns Gemini 集成配置对象
     */
    public async getGeminiIntegrationConfig(): Promise<GeminiIntegrationConfig> {
        const enabled = this.getGeminiIntegrationEnabled();
        const apiKey = await this.getGeminiApiKey();

        return {
            enabled,
            apiKey
        };
    }

    /**
     * 检查是否应该注入 Gemini API Key
     * 条件：Integration 已启用 且 API Key 已设置
     * @returns 是否应该注入
     */
    public async shouldInjectGeminiApiKey(): Promise<boolean> {
        const config = await this.getGeminiIntegrationConfig();
        return config.enabled && !!config.apiKey;
    }

    // ==================== 工具方法 ====================

    /**
     * 检查 API Key 格式是否有效（基本验证）
     * Gemini API Key 通常以 "AIza" 开头
     * @param apiKey 要验证的 API Key
     * @returns 是否有效
     */
    public static isValidGeminiApiKeyFormat(apiKey: string): boolean {
        if (!apiKey || typeof apiKey !== 'string') {
            return false;
        }
        // Gemini API Key 通常以 "AIza" 开头，长度约为 39 个字符
        return apiKey.startsWith('AIza') && apiKey.length >= 35;
    }

    /**
     * 获取 API Key 的掩码显示（用于 UI 显示）
     * @param apiKey 原始 API Key
     * @returns 掩码后的字符串，如 "AIza••••••••••••••••••••"
     */
    public static maskApiKey(apiKey: string | undefined): string {
        if (!apiKey) {
            return '';
        }
        if (apiKey.length <= 8) {
            return '••••••••';
        }
        // 显示前 4 个字符，其余用 • 代替
        return apiKey.substring(0, 4) + '•'.repeat(Math.min(apiKey.length - 4, 20));
    }
}

// 导出单例实例的获取方法
export const secretService = SecretService.getInstance();
