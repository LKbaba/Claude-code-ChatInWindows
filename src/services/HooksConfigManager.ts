import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { debugLog, debugWarn, debugError } from './DebugLogger';

/**
 * Hook event types supported by Claude Code CLI
 */
export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionStart' | 'UserPromptSubmit';

/**
 * Hook scope — determines which settings file the hook is stored in
 */
export type HookScope = 'global' | 'project' | 'project-local';

/**
 * Configured hook data structure (flattened from nested CLI format)
 */
export interface ConfiguredHook {
    id: string;           // Transient UUID (not persisted in JSON)
    event: HookEvent;
    matcher: string;      // Glob pattern for tool name, '' for match-all
    type: 'command';
    command: string;      // Shell command to execute
    description: string;  // User-facing label
    scope: HookScope;
    enabled: boolean;
}

/**
 * Hook template for quick setup
 */
export interface HookTemplate {
    name: string;
    description: string;
    event: HookEvent;
    matcher: string;
    command: string;
}

/**
 * Disabled hook identifier stored in _disabledHooks array
 */
interface DisabledHookEntry {
    event: string;
    matcher: string;
    command: string;
}

/**
 * Hook description entry stored in _hookDescriptions array.
 * CLI format has no description field, so we persist it ourselves.
 */
interface HookDescriptionEntry {
    event: string;
    matcher: string;
    command: string;
    description: string;
}

/**
 * Raw hook entry in CLI settings JSON
 */
interface RawHookEntry {
    type: 'command';
    command: string;
}

/**
 * Raw matcher group in CLI settings JSON
 */
interface RawMatcherGroup {
    matcher: string;
    hooks: RawHookEntry[];
}

/**
 * HooksConfigManager - Manages Claude Code hooks configuration
 * Reads/writes hooks from three settings files (global, project, project-local)
 * Uses singleton pattern with in-memory caching
 */
export class HooksConfigManager {
    private static instance: HooksConfigManager;

    private cachedHooks: ConfiguredHook[] | null = null;
    private workspacePath: string | undefined;
    private lastLoadTime: number = 0;

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): HooksConfigManager {
        if (!HooksConfigManager.instance) {
            HooksConfigManager.instance = new HooksConfigManager();
        }
        return HooksConfigManager.instance;
    }

    /**
     * Set workspace path for loading project-level hooks
     */
    public setWorkspacePath(wsPath: string | undefined): void {
        this.workspacePath = wsPath;
        debugLog('HooksConfigManager', `Workspace path set to: ${wsPath || 'undefined'}`);
    }

    /**
     * Load all configured hooks from all three settings files
     */
    public async loadConfiguredHooks(forceReload: boolean = false): Promise<ConfiguredHook[]> {
        if (this.cachedHooks && !forceReload) {
            debugLog('HooksConfigManager', 'Returning cached hooks');
            return this.cachedHooks;
        }

        debugLog('HooksConfigManager', 'Loading hooks from all settings files');

        try {
            const globalPath = this.getSettingsPath('global');
            const projectPath = this.getSettingsPath('project');
            const projectLocalPath = this.getSettingsPath('project-local');

            const [globalHooks, projectHooks, projectLocalHooks] = await Promise.all([
                globalPath ? this.loadHooksFromFile(globalPath, 'global') : Promise.resolve([]),
                projectPath ? this.loadHooksFromFile(projectPath, 'project') : Promise.resolve([]),
                projectLocalPath ? this.loadHooksFromFile(projectLocalPath, 'project-local') : Promise.resolve([])
            ]);

            const allHooks = [...globalHooks, ...projectHooks, ...projectLocalHooks];
            this.cachedHooks = allHooks;
            this.lastLoadTime = Date.now();

            debugLog('HooksConfigManager', `Loaded ${allHooks.length} hook(s) total`);
            debugLog('HooksConfigManager', `  - Global: ${globalHooks.length}`);
            debugLog('HooksConfigManager', `  - Project: ${projectHooks.length}`);
            debugLog('HooksConfigManager', `  - Project-local: ${projectLocalHooks.length}`);

            return allHooks;
        } catch (error) {
            debugError('HooksConfigManager', 'Failed to load hooks', error);
            this.cachedHooks = [];
            return [];
        }
    }

    /**
     * Get cached hooks list
     */
    public getCachedHooks(): ConfiguredHook[] {
        if (!this.cachedHooks) {
            debugWarn('HooksConfigManager', 'Cache is empty, returning empty array');
            return [];
        }
        return this.cachedHooks;
    }

    /**
     * Add a new hook to the specified scope's settings file
     */
    public async addHook(hook: Omit<ConfiguredHook, 'id'>): Promise<ConfiguredHook> {
        const filePath = this.getSettingsPath(hook.scope);
        if (!filePath) {
            throw new Error(`Cannot determine settings path for scope: ${hook.scope}`);
        }

        const newHook: ConfiguredHook = {
            ...hook,
            id: crypto.randomUUID()
        };

        debugLog('HooksConfigManager', `Adding hook: ${newHook.event}/${newHook.matcher || '(all)'} to ${hook.scope}`);

        const data = await this.readSettingsFile(filePath);
        const hooksSection = (data.hooks || {}) as Record<string, RawMatcherGroup[]>;

        // Add to hooks section
        if (!hooksSection[newHook.event]) {
            hooksSection[newHook.event] = [];
        }

        // Find existing matcher group or create new one
        const matcherGroups = hooksSection[newHook.event];
        let group = matcherGroups.find(g => g.matcher === newHook.matcher);
        if (!group) {
            group = { matcher: newHook.matcher, hooks: [] };
            matcherGroups.push(group);
        }

        group.hooks.push({ type: 'command', command: newHook.command });
        data.hooks = hooksSection;

        // Persist description if provided (CLI format has no description field)
        if (newHook.description) {
            const descriptions: HookDescriptionEntry[] = (data._hookDescriptions as HookDescriptionEntry[]) || [];
            descriptions.push({
                event: newHook.event,
                matcher: newHook.matcher,
                command: newHook.command,
                description: newHook.description
            });
            data._hookDescriptions = descriptions;
        }

        await this.writeSettingsFile(filePath, data);
        this.clearCache();

        return newHook;
    }

    /**
     * Remove a hook by ID
     */
    public async removeHook(hookId: string): Promise<void> {
        const hook = this.findHookById(hookId);
        if (!hook) {
            throw new Error(`Hook not found: ${hookId}`);
        }

        const filePath = this.getSettingsPath(hook.scope);
        if (!filePath) {
            throw new Error(`Cannot determine settings path for scope: ${hook.scope}`);
        }

        debugLog('HooksConfigManager', `Removing hook: ${hook.event}/${hook.matcher || '(all)'} from ${hook.scope}`);

        const data = await this.readSettingsFile(filePath);
        const hooksSection = (data.hooks || {}) as Record<string, RawMatcherGroup[]>;

        // Remove from hooks section
        this.removeHookFromSection(hooksSection, hook);

        // Also remove from _disabledHooks if present
        if (data._disabledHooks) {
            data._disabledHooks = (data._disabledHooks as DisabledHookEntry[]).filter(
                d => !(d.event === hook.event && d.matcher === hook.matcher && d.command === hook.command)
            );
            if ((data._disabledHooks as DisabledHookEntry[]).length === 0) {
                delete data._disabledHooks;
            }
        }

        // Also remove from _hookDescriptions if present
        if (data._hookDescriptions) {
            data._hookDescriptions = (data._hookDescriptions as HookDescriptionEntry[]).filter(
                d => !(d.event === hook.event && d.matcher === hook.matcher && d.command === hook.command)
            );
            if ((data._hookDescriptions as HookDescriptionEntry[]).length === 0) {
                delete data._hookDescriptions;
            }
        }

        data.hooks = hooksSection;
        this.cleanEmptyEvents(data.hooks as Record<string, RawMatcherGroup[]>);

        await this.writeSettingsFile(filePath, data);
        this.clearCache();
    }

    /**
     * Toggle hook enabled/disabled state, returns new enabled state
     */
    public async toggleHookState(hookId: string): Promise<boolean> {
        const hook = this.findHookById(hookId);
        if (!hook) {
            throw new Error(`Hook not found: ${hookId}`);
        }

        const filePath = this.getSettingsPath(hook.scope);
        if (!filePath) {
            throw new Error(`Cannot determine settings path for scope: ${hook.scope}`);
        }

        const newEnabled = !hook.enabled;
        debugLog('HooksConfigManager', `Toggling hook ${hook.event}/${hook.matcher || '(all)'}: enabled=${newEnabled}`);

        const data = await this.readSettingsFile(filePath);
        const hooksSection = (data.hooks || {}) as Record<string, RawMatcherGroup[]>;
        const disabledHooks: DisabledHookEntry[] = (data._disabledHooks as DisabledHookEntry[]) || [];

        if (newEnabled) {
            // Re-enable: add back to hooks section, remove from _disabledHooks
            if (!hooksSection[hook.event]) {
                hooksSection[hook.event] = [];
            }
            let group = hooksSection[hook.event].find(g => g.matcher === hook.matcher);
            if (!group) {
                group = { matcher: hook.matcher, hooks: [] };
                hooksSection[hook.event].push(group);
            }
            group.hooks.push({ type: 'command', command: hook.command });

            // Remove from disabled list
            data._disabledHooks = disabledHooks.filter(
                d => !(d.event === hook.event && d.matcher === hook.matcher && d.command === hook.command)
            );
        } else {
            // Disable: remove from hooks section, add to _disabledHooks
            this.removeHookFromSection(hooksSection, hook);

            disabledHooks.push({
                event: hook.event,
                matcher: hook.matcher,
                command: hook.command
            });
            data._disabledHooks = disabledHooks;
        }

        data.hooks = hooksSection;
        this.cleanEmptyEvents(data.hooks as Record<string, RawMatcherGroup[]>);

        if (data._disabledHooks && (data._disabledHooks as DisabledHookEntry[]).length === 0) {
            delete data._disabledHooks;
        }

        await this.writeSettingsFile(filePath, data);
        this.clearCache();

        return newEnabled;
    }

    /**
     * Update hook configuration
     */
    public async updateHook(hookId: string, changes: Partial<ConfiguredHook>): Promise<void> {
        const hook = this.findHookById(hookId);
        if (!hook) {
            throw new Error(`Hook not found: ${hookId}`);
        }

        debugLog('HooksConfigManager', `Updating hook: ${hookId}`);

        // If scope changed, remove from old file and add to new file
        const oldScope = hook.scope;
        const newScope = changes.scope || oldScope;

        if (newScope !== oldScope) {
            // Remove from old scope
            await this.removeHook(hookId);
            // Add to new scope with merged changes
            const updatedHook: Omit<ConfiguredHook, 'id'> = {
                event: changes.event || hook.event,
                matcher: changes.matcher !== undefined ? changes.matcher : hook.matcher,
                type: 'command',
                command: changes.command || hook.command,
                description: changes.description !== undefined ? changes.description : hook.description,
                scope: newScope,
                enabled: changes.enabled !== undefined ? changes.enabled : hook.enabled
            };
            await this.addHook(updatedHook);
        } else {
            // Same scope: remove old entry and add updated one
            const filePath = this.getSettingsPath(oldScope);
            if (!filePath) {
                throw new Error(`Cannot determine settings path for scope: ${oldScope}`);
            }

            const data = await this.readSettingsFile(filePath);
            const hooksSection = (data.hooks || {}) as Record<string, RawMatcherGroup[]>;

            // Remove old entry
            this.removeHookFromSection(hooksSection, hook);

            // Add updated entry
            const newEvent = changes.event || hook.event;
            const newMatcher = changes.matcher !== undefined ? changes.matcher : hook.matcher;
            const newCommand = changes.command || hook.command;

            if (!hooksSection[newEvent]) {
                hooksSection[newEvent] = [];
            }
            let group = hooksSection[newEvent].find(g => g.matcher === newMatcher);
            if (!group) {
                group = { matcher: newMatcher, hooks: [] };
                hooksSection[newEvent].push(group);
            }
            group.hooks.push({ type: 'command', command: newCommand });

            // Update description in _disabledHooks if needed
            if (data._disabledHooks) {
                data._disabledHooks = (data._disabledHooks as DisabledHookEntry[]).map(d => {
                    if (d.event === hook.event && d.matcher === hook.matcher && d.command === hook.command) {
                        return { event: newEvent, matcher: newMatcher, command: newCommand };
                    }
                    return d;
                });
            }

            data.hooks = hooksSection;
            this.cleanEmptyEvents(data.hooks as Record<string, RawMatcherGroup[]>);

            await this.writeSettingsFile(filePath, data);
        }

        this.clearCache();
    }

    /**
     * Get list of pre-built hook templates
     */
    public getTemplates(): HookTemplate[] {
        // Detect platform for notification command
        const isWin = process.platform === 'win32';
        const isMac = process.platform === 'darwin';

        let notifyCmd: string;
        if (isWin) {
            notifyCmd = 'powershell -Command "cat | Out-Null; [System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\') | Out-Null; [System.Windows.Forms.MessageBox]::Show(\'Claude Code task completed\', \'Claude Code\', 0, 64) | Out-Null; echo \'{}\'"';
        } else if (isMac) {
            notifyCmd = 'bash -c \'cat > /dev/null; osascript -e "display notification \\"Task completed\\" with title \\"Claude Code\\""; echo "{}"\'';
        } else {
            notifyCmd = 'bash -c \'cat > /dev/null; notify-send "Claude Code" "Task completed"; echo "{}"\'';
        }

        return [
            {
                name: 'Completion Notification',
                description: 'Show a system notification when Claude finishes a task',
                event: 'Stop',
                matcher: '',
                command: notifyCmd
            }
        ];
    }

    /**
     * Clear the hooks cache
     */
    public clearCache(): void {
        this.cachedHooks = null;
        this.lastLoadTime = 0;
        debugLog('HooksConfigManager', 'Cache cleared');
    }

    // ── Private helpers ──────────────────────────────────────────────────

    /**
     * Get settings file path for a given scope
     */
    private getSettingsPath(scope: HookScope): string | null {
        switch (scope) {
            case 'global':
                return path.join(os.homedir(), '.claude', 'settings.json');
            case 'project':
                return this.workspacePath
                    ? path.join(this.workspacePath, '.claude', 'settings.json')
                    : null;
            case 'project-local':
                return this.workspacePath
                    ? path.join(this.workspacePath, '.claude', 'settings.local.json')
                    : null;
            default:
                return null;
        }
    }

    /**
     * Read and parse a settings JSON file, returning {} if not found
     */
    private async readSettingsFile(filePath: string): Promise<Record<string, any>> {
        try {
            const content = await fsp.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return {};
        }
    }

    /**
     * Write data back to a settings JSON file, creating directories as needed
     */
    private async writeSettingsFile(filePath: string, data: Record<string, any>): Promise<void> {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            await fsp.mkdir(dir, { recursive: true });
        }
        await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
        debugLog('HooksConfigManager', `Written settings to: ${filePath}`);
    }

    /**
     * Load hooks from a single settings file and flatten into ConfiguredHook[]
     */
    private async loadHooksFromFile(filePath: string, scope: HookScope): Promise<ConfiguredHook[]> {
        const hooks: ConfiguredHook[] = [];

        try {
            const data = await this.readSettingsFile(filePath);
            const hooksSection = data.hooks as Record<string, RawMatcherGroup[]> | undefined;
            const disabledHooks: DisabledHookEntry[] = (data._disabledHooks as DisabledHookEntry[]) || [];
            const descriptions: HookDescriptionEntry[] = (data._hookDescriptions as HookDescriptionEntry[]) || [];

            // Helper to find persisted description
            const findDescription = (event: string, matcher: string, command: string): string => {
                const entry = descriptions.find(d => d.event === event && d.matcher === matcher && d.command === command);
                return entry ? entry.description : '';
            };

            if (!hooksSection) {
                // Also check for disabled-only hooks
                if (disabledHooks.length > 0) {
                    for (const disabled of disabledHooks) {
                        hooks.push({
                            id: crypto.randomUUID(),
                            event: disabled.event as HookEvent,
                            matcher: disabled.matcher,
                            type: 'command',
                            command: disabled.command,
                            description: findDescription(disabled.event, disabled.matcher, disabled.command),
                            scope,
                            enabled: false
                        });
                    }
                }
                return hooks;
            }

            // Flatten the nested structure
            const eventTypes: HookEvent[] = ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'UserPromptSubmit'];
            for (const event of eventTypes) {
                const matcherGroups = hooksSection[event];
                if (!matcherGroups || !Array.isArray(matcherGroups)) {
                    continue;
                }

                for (const group of matcherGroups) {
                    if (!group.hooks || !Array.isArray(group.hooks)) {
                        continue;
                    }

                    for (const hookEntry of group.hooks) {
                        const isDisabled = disabledHooks.some(
                            d => d.event === event && d.matcher === group.matcher && d.command === hookEntry.command
                        );

                        hooks.push({
                            id: crypto.randomUUID(),
                            event,
                            matcher: group.matcher,
                            type: 'command',
                            command: hookEntry.command,
                            description: findDescription(event, group.matcher, hookEntry.command),
                            scope,
                            enabled: !isDisabled
                        });
                    }
                }
            }

            // Add disabled-only hooks (those in _disabledHooks but not in hooks section)
            for (const disabled of disabledHooks) {
                const alreadyIncluded = hooks.some(
                    h => h.event === disabled.event && h.matcher === disabled.matcher && h.command === disabled.command
                );
                if (!alreadyIncluded) {
                    hooks.push({
                        id: crypto.randomUUID(),
                        event: disabled.event as HookEvent,
                        matcher: disabled.matcher,
                        type: 'command',
                        command: disabled.command,
                        description: findDescription(disabled.event, disabled.matcher, disabled.command),
                        scope,
                        enabled: false
                    });
                }
            }

        } catch (error) {
            debugError('HooksConfigManager', `Failed to load hooks from ${filePath}`, error);
        }

        return hooks;
    }

    /**
     * Find a hook by ID from the cached list
     */
    private findHookById(hookId: string): ConfiguredHook | undefined {
        return this.cachedHooks?.find(h => h.id === hookId);
    }

    /**
     * Remove a specific hook entry from the nested hooks section
     */
    private removeHookFromSection(hooksSection: Record<string, RawMatcherGroup[]>, hook: ConfiguredHook): void {
        const matcherGroups = hooksSection[hook.event];
        if (!matcherGroups) { return; }

        for (const group of matcherGroups) {
            if (group.matcher !== hook.matcher) { continue; }
            const idx = group.hooks.findIndex(h => h.command === hook.command);
            if (idx !== -1) {
                group.hooks.splice(idx, 1);
                break;
            }
        }
    }

    /**
     * Clean up empty matcher groups and event arrays
     */
    private cleanEmptyEvents(hooksSection: Record<string, RawMatcherGroup[]>): void {
        for (const event of Object.keys(hooksSection)) {
            // Remove empty matcher groups
            hooksSection[event] = hooksSection[event].filter(g => g.hooks.length > 0);
            // Remove empty events
            if (hooksSection[event].length === 0) {
                delete hooksSection[event];
            }
        }
    }
}
