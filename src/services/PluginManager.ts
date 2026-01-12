import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { debugLog, debugWarn, debugError } from './DebugLogger';

/**
 * Data structure for installed plugins
 */
export interface InstalledPlugin {
    name: string;           // Plugin name (formatted)
    description?: string;   // Plugin description
    version?: string;       // Version number
    path?: string;          // Installation path
    rawName?: string;       // Original name (plugin-name@marketplace-name)
}

/**
 * Data structure for installed_plugins.json file
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
 * Data structure for marketplace.json file
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
 * Marketplace plugin metadata cache
 */
interface MarketplacePluginMetadata {
    [pluginName: string]: {
        description: string;
        version: string;
    };
}

/**
 * Plugin Manager
 * Responsible for reading and managing installed Claude Code plugins
 * Uses singleton pattern with in-memory caching for performance
 */
export class PluginManager {
    // Singleton instance
    private static instance: PluginManager;

    // Cached plugin list
    private cachedPlugins: InstalledPlugin[] | null = null;

    // Marketplace metadata cache
    private marketplaceMetadata: MarketplacePluginMetadata = {};

    // Last load time
    private lastLoadTime: number = 0;

    /**
     * Private constructor to prevent external instantiation
     */
    private constructor() {}

    /**
     * Get PluginManager singleton instance
     */
    public static getInstance(): PluginManager {
        if (!PluginManager.instance) {
            PluginManager.instance = new PluginManager();
        }
        return PluginManager.instance;
    }

    /**
     * Load installed plugins list
     * @param forceReload Whether to force reload (ignore cache)
     * @returns Plugin list
     */
    public async loadInstalledPlugins(forceReload: boolean = false): Promise<InstalledPlugin[]> {
        // If cached and not forcing refresh, return cache directly
        if (this.cachedPlugins && !forceReload) {
            debugLog('PluginManager', 'Returning cached plugins');
            return this.cachedPlugins;
        }

        debugLog('PluginManager', 'Loading plugins from file');

        try {
            // Get plugin config file path
            const pluginsFilePath = this.getPluginsFilePath();

            // Check if file exists
            if (!fs.existsSync(pluginsFilePath)) {
                debugWarn('PluginManager', `Plugin config file not found: ${pluginsFilePath}`);
                this.cachedPlugins = [];
                return [];
            }

            // Read file content
            const fileContent = fs.readFileSync(pluginsFilePath, 'utf-8');
            const pluginsData: InstalledPluginsJson = JSON.parse(fileContent);

            // Load marketplace metadata
            await this.loadMarketplaceMetadata(pluginsData);

            // Parse plugin data
            const plugins = this.parsePluginsData(pluginsData);

            // Update cache
            this.cachedPlugins = plugins;
            this.lastLoadTime = Date.now();

            debugLog('PluginManager', `Successfully loaded ${plugins.length} plugin(s)`);
            return plugins;

        } catch (error) {
            debugError('PluginManager', 'Failed to load plugins', error);

            // Return empty array on error, don't affect extension operation
            this.cachedPlugins = [];
            return [];
        }
    }

    /**
     * Get cached plugins list
     * @returns Plugin list (returns empty array if not loaded)
     */
    public getCachedPlugins(): InstalledPlugin[] {
        if (!this.cachedPlugins) {
            debugWarn('PluginManager', 'Cache is empty, returning empty array');
            return [];
        }
        return this.cachedPlugins;
    }

    /**
     * Get plugin config file path
     * @returns Full path to config file
     */
    private getPluginsFilePath(): string {
        const homeDir = os.homedir();
        return path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
    }

    /**
     * Parse plugin data
     * @param pluginsData Data read from JSON file
     * @returns Plugin list
     */
    private parsePluginsData(pluginsData: InstalledPluginsJson): InstalledPlugin[] {
        const plugins: InstalledPlugin[] = [];

        if (!pluginsData.plugins || typeof pluginsData.plugins !== 'object') {
            debugWarn('PluginManager', 'Plugin data format is invalid');
            return plugins;
        }

        // Iterate through plugin objects
        for (const [key, value] of Object.entries(pluginsData.plugins)) {
            try {
                // Extract plugin name from key
                // Format: backend-development@claude-code-workflows
                const pluginName = this.extractPluginName(key);
                const formattedName = this.formatPluginName(pluginName);

                // Get description and version from marketplace metadata
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

        // Sort by name
        plugins.sort((a, b) => a.name.localeCompare(b.name));

        return plugins;
    }

    /**
     * Extract plugin name from plugin key
     * @param key Plugin key (format: plugin-name@marketplace-name)
     * @returns Plugin name part
     */
    private extractPluginName(key: string): string {
        // Split by @ symbol
        const parts = key.split('@');
        return parts[0] || key;
    }

    /**
     * Format plugin name
     * Convert "backend-development" to "Backend Development"
     * @param name Original plugin name
     * @returns Formatted name
     */
    private formatPluginName(name: string): string {
        // Replace hyphens with spaces, then capitalize first letter
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Clear cache (for testing or debugging)
     */
    public clearCache(): void {
        this.cachedPlugins = null;
        this.marketplaceMetadata = {};
        this.lastLoadTime = 0;
        debugLog('PluginManager', 'Cache cleared');
    }

    /**
     * Load marketplace metadata
     * @param pluginsData Installed plugins data
     */
    private async loadMarketplaceMetadata(pluginsData: InstalledPluginsJson): Promise<void> {
        try {
            // Infer marketplace directory from first installation path
            const firstPlugin = Object.values(pluginsData.plugins)[0];
            if (!firstPlugin || !firstPlugin.installPath) {
                debugWarn('PluginManager', 'Cannot find plugin installation path');
                return;
            }

            // installPath format: C:\Users\..\.claude\plugins\marketplaces\claude-code-workflows\plugins\backend-development
            // marketplace directory: C:\Users\..\.claude\plugins\marketplaces\claude-code-workflows
            const installPath = firstPlugin.installPath;

            // Go up two directory levels: remove plugin name and plugins directory
            const marketplacePath = path.dirname(path.dirname(installPath));
            const marketplaceJsonPath = path.join(marketplacePath, '.claude-plugin', 'marketplace.json');

            debugLog('PluginManager', `Inferred marketplace path: ${marketplacePath}`);
            debugLog('PluginManager', `marketplace.json path: ${marketplaceJsonPath}`);

            // Check if file exists
            if (!fs.existsSync(marketplaceJsonPath)) {
                debugWarn('PluginManager', `marketplace.json not found: ${marketplaceJsonPath}`);
                return;
            }

            // Read and parse marketplace.json
            const content = fs.readFileSync(marketplaceJsonPath, 'utf-8');
            const marketplaceData: MarketplaceJson = JSON.parse(content);

            // Build metadata index
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
     * Read plugin description information
     * Extract description from plugin directory's agents, commands, skills
     * @param installPath Plugin installation path
     * @returns Plugin description (aggregated from all sub-items)
     */
    private readPluginDescription(installPath: string): string | undefined {
        try {
            if (!fs.existsSync(installPath)) {
                return undefined;
            }

            const descriptions: string[] = [];

            // Check agents directory
            const agentsDir = path.join(installPath, 'agents');
            if (fs.existsSync(agentsDir)) {
                const agentDescs = this.readMarkdownDescriptions(agentsDir);
                descriptions.push(...agentDescs);
            }

            // Check commands directory
            const commandsDir = path.join(installPath, 'commands');
            if (fs.existsSync(commandsDir)) {
                const commandDescs = this.readMarkdownDescriptions(commandsDir);
                descriptions.push(...commandDescs);
            }

            // Check skills directory
            const skillsDir = path.join(installPath, 'skills');
            if (fs.existsSync(skillsDir)) {
                const skillDescs = this.readMarkdownDescriptions(skillsDir);
                descriptions.push(...skillDescs);
            }

            // If there are descriptions, return the first one (representative description)
            // Or return a summary of all descriptions
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
     * Read description information from all .md files in a directory
     * @param dirPath Directory path
     * @returns Array of description information
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

                // Try to extract description from frontmatter
                const frontmatterDesc = this.extractFrontmatterDescription(content);
                if (frontmatterDesc) {
                    descriptions.push(frontmatterDesc);
                    continue;
                }

                // If no frontmatter, try to extract the first heading
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
     * Extract description from Markdown file's frontmatter
     * @param content File content
     * @returns Description information
     */
    private extractFrontmatterDescription(content: string): string | undefined {
        // Match frontmatter format: ---\n...description: ...\n---
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
            return undefined;
        }

        const frontmatter = frontmatterMatch[1];

        // Extract description field
        const descMatch = frontmatter.match(/description:\s*(.+)/);
        if (descMatch) {
            return descMatch[1].trim();
        }

        return undefined;
    }

    /**
     * Extract description from Markdown file's first heading
     * @param content File content
     * @returns Description information
     */
    private extractTitleDescription(content: string): string | undefined {
        // Match first line # heading
        const titleMatch = content.match(/^#\s+(.+)/m);
        if (titleMatch) {
            return titleMatch[1].trim();
        }

        return undefined;
    }
}
