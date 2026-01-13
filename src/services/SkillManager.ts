import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { debugLog, debugWarn, debugError } from './DebugLogger';

/**
 * Skill scope type
 * - workspace: Project-level skills from ./.claude/skills/
 * - user: User-level skills from ~/.claude/skills/
 * - plugin: Plugin-bundled skills from ~/.claude/plugins/cache/
 */
export type SkillScope = 'workspace' | 'user' | 'plugin';

/**
 * Installed skill data structure
 */
export interface InstalledSkill {
    name: string;           // Formatted skill name (Title Case)
    rawName: string;        // Original directory/file name
    description?: string;   // Skill description from frontmatter
    scope: SkillScope;      // Skill scope
    pluginName?: string;    // Parent plugin name (only when scope === 'plugin')
    path: string;           // Full path to SKILL.md or .md file
    enabled: boolean;       // Whether skill is enabled
    isOverridden?: boolean; // Whether overridden by higher priority skill
    overriddenBy?: SkillScope; // Which scope overrides this skill
}

/**
 * Skill category data structure for grouping display
 */
export interface SkillCategory {
    scope: SkillScope;           // Scope type
    pluginName?: string;         // Plugin name (only when scope === 'plugin')
    displayName: string;         // Display name for UI
    skills: InstalledSkill[];    // Skills in this category
    isReadOnly: boolean;         // Whether read-only (plugin skills are read-only)
    basePath: string;            // Base path for this category
}

/**
 * SkillManager - Manages Claude Code skills from multiple sources
 * Uses singleton pattern with in-memory caching for performance
 */
export class SkillManager {
    // Singleton instance
    private static instance: SkillManager;

    // Cached skill list
    private cachedSkills: InstalledSkill[] | null = null;

    // Workspace path for loading project-level skills
    private workspacePath: string | undefined;

    // Last load time for cache management
    private lastLoadTime: number = 0;

    /**
     * Private constructor to prevent external instantiation
     */
    private constructor() {}

    /**
     * Get SkillManager singleton instance
     * @returns SkillManager instance
     */
    public static getInstance(): SkillManager {
        if (!SkillManager.instance) {
            SkillManager.instance = new SkillManager();
        }
        return SkillManager.instance;
    }

    /**
     * Set workspace path for loading project-level skills
     * @param path Workspace root path
     */
    public setWorkspacePath(path: string | undefined): void {
        this.workspacePath = path;
        debugLog('SkillManager', `Workspace path set to: ${path || 'undefined'}`);
    }

    /**
     * Load all installed skills from all sources
     * @param forceReload Whether to force reload (ignore cache)
     * @returns Combined list of all skills
     */
    public async loadInstalledSkills(forceReload: boolean = false): Promise<InstalledSkill[]> {
        // Return cache if available and not forcing reload
        if (this.cachedSkills && !forceReload) {
            debugLog('SkillManager', 'Returning cached skills');
            return this.cachedSkills;
        }

        debugLog('SkillManager', 'Loading skills from all sources');

        try {
            // Load skills from all three sources in parallel
            // Note: enabled state is determined by filename (SKILL.md vs SKILL.md.disabled)
            const [workspaceSkills, userSkills, pluginSkills] = await Promise.all([
                this.loadWorkspaceSkills(),
                this.loadUserSkills(),
                this.loadPluginSkills()
            ]);

            // Combine all skills
            let allSkills = [...workspaceSkills, ...userSkills, ...pluginSkills];

            // Detect and mark overridden skills
            allSkills = this.detectOverrides(allSkills);

            // Sort skills alphabetically by name (case-insensitive)
            allSkills.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

            // Update cache
            this.cachedSkills = allSkills;
            this.lastLoadTime = Date.now();

            debugLog('SkillManager', `Successfully loaded ${allSkills.length} skill(s) total`);
            debugLog('SkillManager', `  - Workspace: ${workspaceSkills.length}`);
            debugLog('SkillManager', `  - User: ${userSkills.length}`);
            debugLog('SkillManager', `  - Plugin: ${pluginSkills.length}`);

            return allSkills;

        } catch (error) {
            debugError('SkillManager', 'Failed to load skills', error);
            this.cachedSkills = [];
            return [];
        }
    }

    /**
     * Get cached skills list
     * @returns Cached skills (empty array if not loaded)
     */
    public getCachedSkills(): InstalledSkill[] {
        if (!this.cachedSkills) {
            debugWarn('SkillManager', 'Cache is empty, returning empty array');
            return [];
        }
        return this.cachedSkills;
    }

    /**
     * Group skills by category for UI display
     * @param skills Skills to group
     * @returns Grouped skill categories
     */
    public groupSkillsByCategory(skills: InstalledSkill[]): SkillCategory[] {
        const categories: SkillCategory[] = [];
        const homeDir = os.homedir();

        // Group workspace skills
        const workspaceSkills = skills.filter(s => s.scope === 'workspace');
        if (workspaceSkills.length > 0 || this.workspacePath) {
            categories.push({
                scope: 'workspace',
                displayName: 'Workspace',
                skills: workspaceSkills,
                isReadOnly: false,
                basePath: this.workspacePath
                    ? path.join(this.workspacePath, '.claude', 'skills')
                    : './.claude/skills/'
            });
        }

        // Group user skills
        const userSkills = skills.filter(s => s.scope === 'user');
        categories.push({
            scope: 'user',
            displayName: 'User Global',
            skills: userSkills,
            isReadOnly: false,
            basePath: path.join(homeDir, '.claude', 'skills')
        });

        // Group all plugin skills into one category
        const pluginSkills = skills.filter(s => s.scope === 'plugin');
        categories.push({
            scope: 'plugin',
            displayName: 'Plugin Skills',
            skills: pluginSkills,
            isReadOnly: true,
            basePath: path.join(homeDir, '.claude', 'plugins', 'cache')
        });

        return categories;
    }

    /**
     * Clear the skills cache
     */
    public clearCache(): void {
        this.cachedSkills = null;
        this.lastLoadTime = 0;
        debugLog('SkillManager', 'Cache cleared');
    }

    /**
     * Load workspace-level skills from .claude/skills/
     * Skills are directories containing SKILL.md or SKILL.md.disabled files
     * @returns List of workspace skills
     */
    private async loadWorkspaceSkills(): Promise<InstalledSkill[]> {
        const skills: InstalledSkill[] = [];

        if (!this.workspacePath) {
            debugLog('SkillManager', 'No workspace path set, skipping workspace skills');
            return skills;
        }

        const skillsDir = path.join(this.workspacePath, '.claude', 'skills');

        if (!fs.existsSync(skillsDir)) {
            debugLog('SkillManager', `Workspace skills directory not found: ${skillsDir}`);
            return skills;
        }

        try {
            const entries = fs.readdirSync(skillsDir);

            for (const entry of entries) {
                const entryPath = path.join(skillsDir, entry);
                const stat = fs.statSync(entryPath);

                // Skills are directories containing SKILL.md or SKILL.md.disabled
                if (!stat.isDirectory()) {
                    continue;
                }

                // Check for both enabled and disabled skill files
                const enabledPath = path.join(entryPath, 'SKILL.md');
                const disabledPath = path.join(entryPath, 'SKILL.md.disabled');

                let skillMdPath: string | null = null;
                let isEnabled = true;

                if (fs.existsSync(enabledPath)) {
                    skillMdPath = enabledPath;
                    isEnabled = true;
                } else if (fs.existsSync(disabledPath)) {
                    skillMdPath = disabledPath;
                    isEnabled = false;
                }

                if (!skillMdPath) {
                    continue;
                }

                try {
                    const content = fs.readFileSync(skillMdPath, 'utf-8');
                    const frontmatter = this.parseSkillFrontmatter(content);

                    skills.push({
                        name: frontmatter.name || this.formatSkillName(entry),
                        rawName: entry,
                        description: frontmatter.description,
                        scope: 'workspace',
                        path: skillMdPath,
                        enabled: isEnabled
                    });

                    debugLog('SkillManager', `Loaded workspace skill: ${entry} (enabled: ${isEnabled})`);
                } catch (error) {
                    debugError('SkillManager', `Failed to parse workspace skill: ${entry}`, error);
                }
            }
        } catch (error) {
            debugError('SkillManager', `Failed to read workspace skills directory: ${skillsDir}`, error);
        }

        return skills;
    }

    /**
     * Load user-level skills from ~/.claude/skills/
     * Skills are directories containing SKILL.md or SKILL.md.disabled files
     * @returns List of user skills
     */
    private async loadUserSkills(): Promise<InstalledSkill[]> {
        const skills: InstalledSkill[] = [];
        const homeDir = os.homedir();
        const skillsDir = path.join(homeDir, '.claude', 'skills');

        if (!fs.existsSync(skillsDir)) {
            debugLog('SkillManager', `User skills directory not found: ${skillsDir}`);
            return skills;
        }

        try {
            const entries = fs.readdirSync(skillsDir);

            for (const entry of entries) {
                const entryPath = path.join(skillsDir, entry);
                const stat = fs.statSync(entryPath);

                // Skills are directories containing SKILL.md or SKILL.md.disabled
                if (!stat.isDirectory()) {
                    continue;
                }

                // Check for both enabled and disabled skill files
                const enabledPath = path.join(entryPath, 'SKILL.md');
                const disabledPath = path.join(entryPath, 'SKILL.md.disabled');

                let skillMdPath: string | null = null;
                let isEnabled = true;

                if (fs.existsSync(enabledPath)) {
                    skillMdPath = enabledPath;
                    isEnabled = true;
                } else if (fs.existsSync(disabledPath)) {
                    skillMdPath = disabledPath;
                    isEnabled = false;
                }

                if (!skillMdPath) {
                    continue;
                }

                try {
                    const content = fs.readFileSync(skillMdPath, 'utf-8');
                    const frontmatter = this.parseSkillFrontmatter(content);

                    skills.push({
                        name: frontmatter.name || this.formatSkillName(entry),
                        rawName: entry,
                        description: frontmatter.description,
                        scope: 'user',
                        path: skillMdPath,
                        enabled: isEnabled
                    });

                    debugLog('SkillManager', `Loaded user skill: ${entry} (enabled: ${isEnabled})`);
                } catch (error) {
                    debugError('SkillManager', `Failed to parse user skill: ${entry}`, error);
                }
            }
        } catch (error) {
            debugError('SkillManager', `Failed to read user skills directory: ${skillsDir}`, error);
        }

        return skills;
    }

    /**
     * Load plugin-bundled skills from ~/.claude/plugins/cache/
     * @returns List of plugin skills
     */
    private async loadPluginSkills(): Promise<InstalledSkill[]> {
        const skills: InstalledSkill[] = [];
        const homeDir = os.homedir();
        const cacheDir = path.join(homeDir, '.claude', 'plugins', 'cache');

        if (!fs.existsSync(cacheDir)) {
            debugLog('SkillManager', `Plugin cache directory not found: ${cacheDir}`);
            return skills;
        }

        try {
            // Iterate through marketplace directories
            const marketplaces = fs.readdirSync(cacheDir);

            for (const marketplace of marketplaces) {
                const marketplacePath = path.join(cacheDir, marketplace);
                const stat = fs.statSync(marketplacePath);

                if (!stat.isDirectory()) {
                    continue;
                }

                // Iterate through plugin directories
                const plugins = fs.readdirSync(marketplacePath);

                for (const plugin of plugins) {
                    const pluginPath = path.join(marketplacePath, plugin);
                    const pluginStat = fs.statSync(pluginPath);

                    if (!pluginStat.isDirectory()) {
                        continue;
                    }

                    // Iterate through version directories
                    const versions = fs.readdirSync(pluginPath);

                    for (const version of versions) {
                        const versionPath = path.join(pluginPath, version);
                        const versionStat = fs.statSync(versionPath);

                        if (!versionStat.isDirectory()) {
                            continue;
                        }

                        // Check for skills directory
                        const skillsDir = path.join(versionPath, 'skills');

                        if (!fs.existsSync(skillsDir)) {
                            continue;
                        }

                        // Load skills from this plugin
                        const pluginSkills = await this.loadPluginSkillsFromDir(
                            skillsDir,
                            this.formatSkillName(plugin)
                        );

                        skills.push(...pluginSkills);
                    }
                }
            }
        } catch (error) {
            debugError('SkillManager', `Failed to read plugin cache directory: ${cacheDir}`, error);
        }

        return skills;
    }

    /**
     * Load skills from a plugin's skills directory
     * @param skillsDir Path to plugin's skills directory
     * @param pluginName Formatted plugin name
     * @returns List of skills from this plugin
     */
    private async loadPluginSkillsFromDir(skillsDir: string, pluginName: string): Promise<InstalledSkill[]> {
        const skills: InstalledSkill[] = [];

        try {
            const skillDirs = fs.readdirSync(skillsDir);

            for (const skillDir of skillDirs) {
                const skillPath = path.join(skillsDir, skillDir);
                const stat = fs.statSync(skillPath);

                if (!stat.isDirectory()) {
                    continue;
                }

                // Look for SKILL.md file
                const skillMdPath = path.join(skillPath, 'SKILL.md');

                if (!fs.existsSync(skillMdPath)) {
                    continue;
                }

                try {
                    const content = fs.readFileSync(skillMdPath, 'utf-8');
                    const frontmatter = this.parseSkillFrontmatter(content);

                    skills.push({
                        name: frontmatter.name || this.formatSkillName(skillDir),
                        rawName: skillDir,
                        description: frontmatter.description,
                        scope: 'plugin',
                        pluginName: pluginName,
                        path: skillMdPath,
                        enabled: true
                    });

                    debugLog('SkillManager', `Loaded plugin skill: ${skillDir} from ${pluginName}`);
                } catch (error) {
                    debugError('SkillManager', `Failed to parse plugin skill: ${skillDir}`, error);
                }
            }
        } catch (error) {
            debugError('SkillManager', `Failed to read skills directory: ${skillsDir}`, error);
        }

        return skills;
    }

    /**
     * Parse YAML frontmatter from skill file content
     * @param content File content
     * @returns Parsed frontmatter data
     */
    private parseSkillFrontmatter(content: string): { name?: string; description?: string } {
        // Match frontmatter between --- markers
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);

        if (!frontmatterMatch) {
            return {};
        }

        const frontmatter = frontmatterMatch[1];
        const result: { name?: string; description?: string } = {};

        // Extract name field
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
        if (nameMatch) {
            result.name = nameMatch[1].trim();
        }

        // Extract description field
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
        if (descMatch) {
            result.description = descMatch[1].trim();
        }

        return result;
    }

    /**
     * Format skill name from kebab-case to Title Case
     * @param name Original skill name
     * @returns Formatted name
     */
    private formatSkillName(name: string): string {
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Detect and mark skills that are overridden by higher priority skills
     * Priority: workspace > user > plugin
     * @param skills All loaded skills
     * @returns Skills with override information
     */
    private detectOverrides(skills: InstalledSkill[]): InstalledSkill[] {
        const skillsByName = new Map<string, InstalledSkill[]>();

        // Group skills by raw name
        for (const skill of skills) {
            const existing = skillsByName.get(skill.rawName) || [];
            existing.push(skill);
            skillsByName.set(skill.rawName, existing);
        }

        // Mark overrides based on priority
        const scopePriority: Record<SkillScope, number> = {
            'workspace': 3,
            'user': 2,
            'plugin': 1
        };

        for (const [, sameNameSkills] of skillsByName) {
            if (sameNameSkills.length <= 1) {
                continue;
            }

            // Sort by priority (highest first)
            sameNameSkills.sort((a, b) => scopePriority[b.scope] - scopePriority[a.scope]);

            const highestPrioritySkill = sameNameSkills[0];

            // Mark lower priority skills as overridden
            for (let i = 1; i < sameNameSkills.length; i++) {
                sameNameSkills[i].isOverridden = true;
                sameNameSkills[i].overriddenBy = highestPrioritySkill.scope;
            }
        }

        return skills;
    }

    // ==================== Enable/Disable State Management ====================

    /**
     * Toggle skill enabled/disabled state
     * Only works for workspace and user skills (not plugins)
     * Renames SKILL.md <-> SKILL.md.disabled to hide from Claude CLI
     * @param skill Skill to toggle
     * @returns New enabled state (true = enabled, false = disabled)
     */
    public async toggleSkillState(skill: InstalledSkill): Promise<boolean> {
        // Plugin skills cannot be toggled
        if (skill.scope === 'plugin') {
            debugWarn('SkillManager', `Cannot toggle plugin skill: ${skill.name}`);
            return skill.enabled;
        }

        // Determine current state from skill.enabled (which was set during load based on filename)
        const currentlyDisabled = !skill.enabled;

        // Determine file paths
        const skillDir = path.dirname(skill.path);
        const enabledPath = path.join(skillDir, 'SKILL.md');
        const disabledPath = path.join(skillDir, 'SKILL.md.disabled');

        try {
            if (currentlyDisabled) {
                // Enable: rename SKILL.md.disabled -> SKILL.md
                if (fs.existsSync(disabledPath)) {
                    await fsp.rename(disabledPath, enabledPath);
                    debugLog('SkillManager', `Renamed ${disabledPath} -> ${enabledPath}`);
                }
                skill.enabled = true;
                skill.path = enabledPath;
                debugLog('SkillManager', `Enabled skill: ${skill.name}`);
            } else {
                // Disable: rename SKILL.md -> SKILL.md.disabled
                if (fs.existsSync(enabledPath)) {
                    await fsp.rename(enabledPath, disabledPath);
                    debugLog('SkillManager', `Renamed ${enabledPath} -> ${disabledPath}`);
                }
                skill.enabled = false;
                skill.path = disabledPath;
                debugLog('SkillManager', `Disabled skill: ${skill.name}`);
            }
        } catch (error) {
            debugError('SkillManager', `Failed to rename skill file: ${skill.name}`, error);
            // Return current state on error (no change)
            return skill.enabled;
        }

        // Update cached skill if exists
        if (this.cachedSkills) {
            const cachedSkill = this.cachedSkills.find(
                s => s.rawName === skill.rawName && s.scope === skill.scope
            );
            if (cachedSkill) {
                cachedSkill.enabled = skill.enabled;
                cachedSkill.path = skill.path;
            }
        }

        return skill.enabled;
    }
}
