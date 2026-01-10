import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { debugLog, debugWarn, debugError } from './DebugLogger';

/**
 * 已安装插件的数据结构
 */
export interface InstalledPlugin {
    name: string;           // 插件名称（格式化后）
    description?: string;   // 插件描述
    version?: string;       // 版本号
    path?: string;          // 安装路径
    rawName?: string;       // 原始名称（插件名@marketplace名）
}

/**
 * installed_plugins.json 文件的数据结构
 */
interface InstalledPluginsJson {
    version: number;
    plugins: {
        [key: string]: {
            version: string;
            installedAt: string;
            lastUpdated: string;
            installPath: string;
            gitCommitSha?: string;
            isLocal?: boolean;
        };
    };
}

/**
 * marketplace.json 文件的数据结构
 */
interface MarketplaceJson {
    name: string;
    metadata: {
        description: string;
        version: string;
    };
    plugins: Array<{
        name: string;
        description: string;
        version: string;
        source: string;
        [key: string]: any;
    }>;
}

/**
 * Marketplace 插件元数据缓存
 */
interface MarketplacePluginMetadata {
    [pluginName: string]: {
        description: string;
        version: string;
    };
}

/**
 * 插件管理器
 * 负责读取和管理已安装的 Claude Code 插件
 * 使用单例模式，提供内存缓存以提高性能
 */
export class PluginManager {
    // 单例实例
    private static instance: PluginManager;

    // 缓存的插件列表
    private cachedPlugins: InstalledPlugin[] | null = null;

    // Marketplace 元数据缓存
    private marketplaceMetadata: MarketplacePluginMetadata = {};

    // 最后加载时间
    private lastLoadTime: number = 0;

    /**
     * 私有构造函数，防止外部实例化
     */
    private constructor() {}

    /**
     * 获取 PluginManager 单例实例
     */
    public static getInstance(): PluginManager {
        if (!PluginManager.instance) {
            PluginManager.instance = new PluginManager();
        }
        return PluginManager.instance;
    }

    /**
     * 加载已安装的插件列表
     * @param forceReload 是否强制重新加载（忽略缓存）
     * @returns 插件列表
     */
    public async loadInstalledPlugins(forceReload: boolean = false): Promise<InstalledPlugin[]> {
        // 如果有缓存且不强制刷新，直接返回缓存
        if (this.cachedPlugins && !forceReload) {
            debugLog('PluginManager', 'Returning cached plugins');
            return this.cachedPlugins;
        }

        debugLog('PluginManager', 'Loading plugins from file');

        try {
            // 获取插件配置文件路径
            const pluginsFilePath = this.getPluginsFilePath();

            // 检查文件是否存在
            if (!fs.existsSync(pluginsFilePath)) {
                debugWarn('PluginManager', `Plugin config file not found: ${pluginsFilePath}`);
                this.cachedPlugins = [];
                return [];
            }

            // 读取文件内容
            const fileContent = fs.readFileSync(pluginsFilePath, 'utf-8');
            const pluginsData: InstalledPluginsJson = JSON.parse(fileContent);

            // 加载 marketplace 元数据
            await this.loadMarketplaceMetadata(pluginsData);

            // 解析插件数据
            const plugins = this.parsePluginsData(pluginsData);

            // 更新缓存
            this.cachedPlugins = plugins;
            this.lastLoadTime = Date.now();

            debugLog('PluginManager', `Successfully loaded ${plugins.length} plugin(s)`);
            return plugins;

        } catch (error) {
            debugError('PluginManager', 'Failed to load plugins', error);

            // 错误情况下返回空数组，不影响扩展运行
            this.cachedPlugins = [];
            return [];
        }
    }

    /**
     * 获取缓存的插件列表
     * @returns 插件列表（如果未加载则返回空数组）
     */
    public getCachedPlugins(): InstalledPlugin[] {
        if (!this.cachedPlugins) {
            debugWarn('PluginManager', 'Cache is empty, returning empty array');
            return [];
        }
        return this.cachedPlugins;
    }

    /**
     * 获取插件配置文件路径
     * @returns 配置文件的完整路径
     */
    private getPluginsFilePath(): string {
        const homeDir = os.homedir();
        return path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
    }

    /**
     * 解析插件数据
     * @param pluginsData 从 JSON 文件读取的数据
     * @returns 插件列表
     */
    private parsePluginsData(pluginsData: InstalledPluginsJson): InstalledPlugin[] {
        const plugins: InstalledPlugin[] = [];

        if (!pluginsData.plugins || typeof pluginsData.plugins !== 'object') {
            debugWarn('PluginManager', 'Plugin data format is invalid');
            return plugins;
        }

        // 遍历插件对象
        for (const [key, value] of Object.entries(pluginsData.plugins)) {
            try {
                // 从 key 中提取插件名称
                // 格式：backend-development@claude-code-workflows
                const pluginName = this.extractPluginName(key);
                const formattedName = this.formatPluginName(pluginName);

                // 从 marketplace 元数据中获取描述和版本
                const metadata = this.marketplaceMetadata[pluginName];
                const description = metadata?.description;
                const version = metadata?.version || value.version;

                const plugin: InstalledPlugin = {
                    name: formattedName,
                    rawName: key,
                    version: version,
                    path: value.installPath,
                    description: description
                };

                plugins.push(plugin);
            } catch (error) {
                debugError('PluginManager', `Failed to parse plugin: ${key}`, error);
            }
        }

        // 按名称排序
        plugins.sort((a, b) => a.name.localeCompare(b.name));

        return plugins;
    }

    /**
     * 从插件 key 中提取插件名称
     * @param key 插件 key（格式：插件名@marketplace名）
     * @returns 插件名称部分
     */
    private extractPluginName(key: string): string {
        // 分割 @ 符号
        const parts = key.split('@');
        return parts[0] || key;
    }

    /**
     * 格式化插件名称
     * 将 "backend-development" 转换为 "Backend Development"
     * @param name 原始插件名称
     * @returns 格式化后的名称
     */
    private formatPluginName(name: string): string {
        // 将连字符替换为空格，然后首字母大写
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * 清除缓存（用于测试或调试）
     */
    public clearCache(): void {
        this.cachedPlugins = null;
        this.marketplaceMetadata = {};
        this.lastLoadTime = 0;
        debugLog('PluginManager', 'Cache cleared');
    }

    /**
     * 加载 marketplace 元数据
     * @param pluginsData 已安装插件数据
     */
    private async loadMarketplaceMetadata(pluginsData: InstalledPluginsJson): Promise<void> {
        try {
            // 从第一个安装路径推断 marketplace 目录
            const firstPlugin = Object.values(pluginsData.plugins)[0];
            if (!firstPlugin || !firstPlugin.installPath) {
                debugWarn('PluginManager', 'Cannot find plugin installation path');
                return;
            }

            // installPath 格式: C:\Users\..\.claude\plugins\marketplaces\claude-code-workflows\plugins\backend-development
            // marketplace 目录: C:\Users\..\.claude\plugins\marketplaces\claude-code-workflows
            const installPath = firstPlugin.installPath;

            // 向上两级目录：去掉插件名和 plugins 目录
            const marketplacePath = path.dirname(path.dirname(installPath));
            const marketplaceJsonPath = path.join(marketplacePath, '.claude-plugin', 'marketplace.json');

            debugLog('PluginManager', `Inferred marketplace path: ${marketplacePath}`);
            debugLog('PluginManager', `marketplace.json path: ${marketplaceJsonPath}`);

            // 检查文件是否存在
            if (!fs.existsSync(marketplaceJsonPath)) {
                debugWarn('PluginManager', `marketplace.json not found: ${marketplaceJsonPath}`);
                return;
            }

            // 读取并解析 marketplace.json
            const content = fs.readFileSync(marketplaceJsonPath, 'utf-8');
            const marketplaceData: MarketplaceJson = JSON.parse(content);

            // 构建元数据索引
            for (const plugin of marketplaceData.plugins) {
                this.marketplaceMetadata[plugin.name] = {
                    description: plugin.description,
                    version: plugin.version
                };
            }

            debugLog('PluginManager', `Successfully loaded marketplace metadata with ${Object.keys(this.marketplaceMetadata).length} plugin(s)`);
        } catch (error) {
            debugError('PluginManager', 'Failed to load marketplace metadata', error);
        }
    }

    /**
     * 读取插件的描述信息
     * 从插件目录的 agents、commands、skills 中提取描述
     * @param installPath 插件安装路径
     * @returns 插件描述（汇总所有子项的描述）
     */
    private readPluginDescription(installPath: string): string | undefined {
        try {
            if (!fs.existsSync(installPath)) {
                return undefined;
            }

            const descriptions: string[] = [];

            // 检查 agents 目录
            const agentsDir = path.join(installPath, 'agents');
            if (fs.existsSync(agentsDir)) {
                const agentDescs = this.readMarkdownDescriptions(agentsDir);
                descriptions.push(...agentDescs);
            }

            // 检查 commands 目录
            const commandsDir = path.join(installPath, 'commands');
            if (fs.existsSync(commandsDir)) {
                const commandDescs = this.readMarkdownDescriptions(commandsDir);
                descriptions.push(...commandDescs);
            }

            // 检查 skills 目录
            const skillsDir = path.join(installPath, 'skills');
            if (fs.existsSync(skillsDir)) {
                const skillDescs = this.readMarkdownDescriptions(skillsDir);
                descriptions.push(...skillDescs);
            }

            // 如果有描述，返回第一个（代表性描述）
            // 或者可以返回所有描述的汇总
            if (descriptions.length > 0) {
                return descriptions.length === 1
                    ? descriptions[0]
                    : `${descriptions.length} agents/commands/skills available`;
            }

            return undefined;
        } catch (error) {
            debugError('PluginManager', `Failed to read plugin description: ${installPath}`, error);
            return undefined;
        }
    }

    /**
     * 从目录中读取所有 .md 文件的描述信息
     * @param dirPath 目录路径
     * @returns 描述信息数组
     */
    private readMarkdownDescriptions(dirPath: string): string[] {
        const descriptions: string[] = [];

        try {
            const files = fs.readdirSync(dirPath);

            for (const file of files) {
                if (!file.endsWith('.md')) {
                    continue;
                }

                const filePath = path.join(dirPath, file);
                const content = fs.readFileSync(filePath, 'utf-8');

                // 尝试从 frontmatter 中提取描述
                const frontmatterDesc = this.extractFrontmatterDescription(content);
                if (frontmatterDesc) {
                    descriptions.push(frontmatterDesc);
                    continue;
                }

                // 如果没有 frontmatter，尝试提取第一行标题
                const titleDesc = this.extractTitleDescription(content);
                if (titleDesc) {
                    descriptions.push(titleDesc);
                }
            }
        } catch (error) {
            debugError('PluginManager', `Failed to read directory: ${dirPath}`, error);
        }

        return descriptions;
    }

    /**
     * 从 Markdown 文件的 frontmatter 中提取描述
     * @param content 文件内容
     * @returns 描述信息
     */
    private extractFrontmatterDescription(content: string): string | undefined {
        // 匹配 frontmatter 格式: ---\n...description: ...\n---
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
            return undefined;
        }

        const frontmatter = frontmatterMatch[1];

        // 提取 description 字段
        const descMatch = frontmatter.match(/description:\s*(.+)/);
        if (descMatch) {
            return descMatch[1].trim();
        }

        return undefined;
    }

    /**
     * 从 Markdown 文件的第一行标题中提取描述
     * @param content 文件内容
     * @returns 描述信息
     */
    private extractTitleDescription(content: string): string | undefined {
        // 匹配第一行的 # 标题
        const titleMatch = content.match(/^#\s+(.+)/m);
        if (titleMatch) {
            return titleMatch[1].trim();
        }

        return undefined;
    }
}
