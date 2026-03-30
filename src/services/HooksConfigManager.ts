import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { debugLog, debugWarn, debugError } from './DebugLogger';

/**
 * Hook event types supported by Claude Code CLI (all 26 events)
 */
export type HookEvent =
    // Session lifecycle
    | 'SessionStart' | 'SessionEnd' | 'InstructionsLoaded'
    // Prompt & tool
    | 'UserPromptSubmit' | 'PreToolUse' | 'PermissionRequest'
    | 'PostToolUse' | 'PostToolUseFailure'
    // Notifications & stops
    | 'Notification' | 'Stop' | 'StopFailure'
    // Subagents & tasks
    | 'SubagentStart' | 'SubagentStop'
    | 'TaskCreated' | 'TaskCompleted' | 'TeammateIdle'
    // Config & environment
    | 'ConfigChange' | 'CwdChanged' | 'FileChanged'
    // Worktrees
    | 'WorktreeCreate' | 'WorktreeRemove'
    // Compaction
    | 'PreCompact' | 'PostCompact'
    // MCP Elicitation
    | 'Elicitation' | 'ElicitationResult';

/**
 * Hook types supported by Claude Code CLI
 */
export type HookType = 'command' | 'http' | 'prompt' | 'agent';

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
    type: HookType;
    // Type-specific primary field
    command?: string;      // command type
    url?: string;          // http type
    prompt?: string;       // prompt / agent type
    // Common optional fields
    if?: string;
    timeout?: number;
    statusMessage?: string;
    once?: boolean;
    async?: boolean;       // command only
    shell?: string;        // command only
    model?: string;        // prompt / agent only
    headers?: Record<string, string>;  // http only
    // Plugin-managed fields
    description: string;
    scope: HookScope;
    enabled: boolean;
    // Preserve original raw entry for lossless round-trip
    _rawEntry?: Record<string, unknown>;
}

/**
 * Hook template for quick setup
 */
export interface HookTemplate {
    name: string;
    description: string;
    event: HookEvent;
    matcher: string;
    type: HookType;
    command?: string;      // command type
    url?: string;          // http type
    prompt?: string;       // prompt/agent type
}

/**
 * Disabled hook identifier stored in _disabledHooks array
 */
interface DisabledHookEntry {
    event: string;
    matcher: string;
    type?: HookType;      // new, optional for backward compat
    command?: string;      // command type identifier (backward compat)
    url?: string;          // http type identifier
    prompt?: string;       // prompt/agent type identifier
    _rawEntry?: Record<string, unknown>;  // preserve raw data for lossless re-enable
}

/**
 * Hook description entry stored in _hookDescriptions array.
 * CLI format has no description field, so we persist it ourselves.
 */
interface HookDescriptionEntry {
    event: string;
    matcher: string;
    command?: string;      // command type
    url?: string;          // http type
    prompt?: string;       // prompt/agent type
    description: string;
}

/**
 * Raw hook entry in CLI settings JSON.
 * Uses index signature to preserve unknown/future fields.
 */
interface RawHookEntry {
    type: HookType;
    // command type
    command?: string;
    async?: boolean;
    shell?: string;
    // http type
    url?: string;
    headers?: Record<string, string>;
    allowedEnvVars?: string[];
    // prompt / agent type
    prompt?: string;
    model?: string;
    // common optional fields
    if?: string;
    timeout?: number;
    statusMessage?: string;
    once?: boolean;
    // catch-all for future fields
    [key: string]: unknown;
}

/**
 * Raw matcher group in CLI settings JSON
 */
interface RawMatcherGroup {
    matcher: string;
    hooks: RawHookEntry[];
}

/**
 * Get the primary identifier of a hook entry based on its type.
 */
function getHookIdentifier(hook: { type?: HookType | string; command?: string; url?: string; prompt?: string }): string {
    switch (hook.type) {
        case 'http': return hook.url || '';
        case 'prompt':
        case 'agent': return hook.prompt || '';
        case 'command':
        default: return hook.command || '';
    }
}

/**
 * Match a disabled hook entry against a raw hook entry.
 * Supports both old format (command-only) and new format (type-aware).
 */
function matchDisabledHook(disabled: DisabledHookEntry, hookEntry: RawHookEntry): boolean {
    // New format: match by type + corresponding identifier
    if (disabled.type) {
        switch (disabled.type) {
            case 'http': return disabled.url === hookEntry.url;
            case 'prompt':
            case 'agent': return disabled.prompt === hookEntry.prompt;
            case 'command': return disabled.command === hookEntry.command;
        }
    }
    // Old format: match by command field only (backward compat)
    return disabled.command === hookEntry.command;
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

        group.hooks.push(this.buildRawEntry(newHook) as RawHookEntry);
        data.hooks = hooksSection;

        // Persist description if provided (CLI format has no description field)
        if (newHook.description) {
            const descriptions: HookDescriptionEntry[] = (data._hookDescriptions as HookDescriptionEntry[]) || [];
            const identifier = getHookIdentifier(newHook);
            const descEntry: HookDescriptionEntry = {
                event: newHook.event,
                matcher: newHook.matcher,
                description: newHook.description
            };
            // Set identifier field based on type
            switch (newHook.type) {
                case 'http': descEntry.url = newHook.url; break;
                case 'prompt': case 'agent': descEntry.prompt = newHook.prompt; break;
                default: descEntry.command = newHook.command; break;
            }
            descriptions.push(descEntry);
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
                d => !(d.event === hook.event && d.matcher === hook.matcher && matchDisabledHook(d, { type: hook.type, command: hook.command, url: hook.url, prompt: hook.prompt } as RawHookEntry))
            );
            if ((data._disabledHooks as DisabledHookEntry[]).length === 0) {
                delete data._disabledHooks;
            }
        }

        // Also remove from _hookDescriptions if present
        if (data._hookDescriptions) {
            const identifier = getHookIdentifier(hook);
            data._hookDescriptions = (data._hookDescriptions as HookDescriptionEntry[]).filter(
                d => !(d.event === hook.event && d.matcher === hook.matcher &&
                    (d.command === identifier || d.url === identifier || d.prompt === identifier))
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
            group.hooks.push(this.buildRawEntry(hook) as RawHookEntry);

            // Remove from disabled list
            data._disabledHooks = disabledHooks.filter(
                d => !(d.event === hook.event && d.matcher === hook.matcher && matchDisabledHook(d, { type: hook.type, command: hook.command, url: hook.url, prompt: hook.prompt } as RawHookEntry))
            );
        } else {
            // Disable: remove from hooks section, add to _disabledHooks
            this.removeHookFromSection(hooksSection, hook);

            const disabledEntry: DisabledHookEntry = {
                event: hook.event,
                matcher: hook.matcher,
                type: hook.type,
                _rawEntry: hook._rawEntry  // preserve raw data for lossless re-enable
            };
            switch (hook.type) {
                case 'http': disabledEntry.url = hook.url; break;
                case 'prompt': case 'agent': disabledEntry.prompt = hook.prompt; break;
                default: disabledEntry.command = hook.command; break;
            }
            disabledHooks.push(disabledEntry);
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
                type: changes.type || hook.type || 'command',
                command: changes.command !== undefined ? changes.command : hook.command,
                url: changes.url !== undefined ? changes.url : hook.url,
                prompt: changes.prompt !== undefined ? changes.prompt : hook.prompt,
                if: changes.if !== undefined ? changes.if : hook.if,
                timeout: changes.timeout !== undefined ? changes.timeout : hook.timeout,
                statusMessage: changes.statusMessage !== undefined ? changes.statusMessage : hook.statusMessage,
                once: changes.once !== undefined ? changes.once : hook.once,
                async: changes.async !== undefined ? changes.async : hook.async,
                shell: changes.shell !== undefined ? changes.shell : hook.shell,
                model: changes.model !== undefined ? changes.model : hook.model,
                headers: changes.headers !== undefined ? changes.headers : hook.headers,
                description: changes.description !== undefined ? changes.description : hook.description,
                scope: newScope,
                enabled: changes.enabled !== undefined ? changes.enabled : hook.enabled,
                _rawEntry: hook._rawEntry
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

            // Build updated hook preserving all fields
            const updatedHook: Partial<ConfiguredHook> = {
                ...hook,
                ...changes,
                _rawEntry: hook._rawEntry
            };

            const newEvent = updatedHook.event || hook.event;
            const newMatcher = updatedHook.matcher !== undefined ? updatedHook.matcher : hook.matcher;

            if (!hooksSection[newEvent]) {
                hooksSection[newEvent] = [];
            }
            let group = hooksSection[newEvent].find(g => g.matcher === newMatcher);
            if (!group) {
                group = { matcher: newMatcher, hooks: [] };
                hooksSection[newEvent].push(group);
            }
            group.hooks.push(this.buildRawEntry(updatedHook as ConfiguredHook) as RawHookEntry);

            // Update _disabledHooks if needed
            if (data._disabledHooks) {
                data._disabledHooks = (data._disabledHooks as DisabledHookEntry[]).map(d => {
                    if (d.event === hook.event && d.matcher === hook.matcher && matchDisabledHook(d, { type: hook.type, command: hook.command, url: hook.url, prompt: hook.prompt } as RawHookEntry)) {
                        const newDisabled: DisabledHookEntry = {
                            event: newEvent,
                            matcher: newMatcher,
                            type: updatedHook.type || hook.type
                        };
                        switch (newDisabled.type) {
                            case 'http': newDisabled.url = updatedHook.url; break;
                            case 'prompt': case 'agent': newDisabled.prompt = updatedHook.prompt; break;
                            default: newDisabled.command = updatedHook.command; break;
                        }
                        return newDisabled;
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
        // Detect platform for platform-specific commands
        const isWin = process.platform === 'win32';
        const isMac = process.platform === 'darwin';

        // 1. Completion Notification (updated with stop_hook_active anti-loop check)
        let notifyCmd: string;
        if (isWin) {
            notifyCmd = 'powershell -Command "$input = [Console]::In.ReadToEnd(); $json = $input | ConvertFrom-Json; if ($json.stop_hook_active) { exit 0 }; [System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\') | Out-Null; [System.Windows.Forms.MessageBox]::Show(\'Claude Code task completed\', \'Claude Code\', 0, 64) | Out-Null; echo \'{}\'"';
        } else if (isMac) {
            notifyCmd = 'bash -c \'input=$(cat); stop_active=$(echo "$input" | grep -o "\\"stop_hook_active\\":true"); if [ -n "$stop_active" ]; then exit 0; fi; osascript -e "display notification \\"Task completed\\" with title \\"Claude Code\\""; echo "{}"\'';
        } else {
            notifyCmd = 'bash -c \'input=$(cat); stop_active=$(echo "$input" | grep -o "\\"stop_hook_active\\":true"); if [ -n "$stop_active" ]; then exit 0; fi; notify-send "Claude Code" "Task completed"; echo "{}"\'';
        }

        // 2. Auto-Commit Guard
        let commitGuardCmd: string;
        if (isWin) {
            commitGuardCmd = 'powershell -Command "$input = [Console]::In.ReadToEnd(); $json = $input | ConvertFrom-Json; if ($json.stop_hook_active) { exit 0 }; $status = git status --porcelain 2>$null; if ($status) { Write-Error \'Uncommitted changes detected. Please commit before stopping.\'; exit 2 } else { echo \'{}\' }"';
        } else {
            commitGuardCmd = 'bash -c \'input=$(cat); stop_active=$(echo "$input" | grep -o "\\"stop_hook_active\\":true"); if [ -n "$stop_active" ]; then exit 0; fi; status=$(git status --porcelain 2>/dev/null); if [ -n "$status" ]; then echo "Uncommitted changes detected. Please commit before stopping." >&2; exit 2; else echo "{}"; fi\'';
        }

        // 3-5: Cross-platform commands (bash works on all platforms via Git Bash)
        const blockSensitiveCmd = 'bash -c \'input=$(cat); file=$(echo "$input" | grep -o "\\"file_path\\":\\"[^\\"]*\\"" | head -1 | sed "s/\\"file_path\\":\\"//;s/\\"//"); case "$file" in *.env|*.env.*|*credentials*|*secret*|*.pem|*.key) echo "Blocked: $file is a sensitive file" >&2; exit 2;; esac; echo "{}"\'';
        const formatOnSaveCmd = 'bash -c \'input=$(cat); file=$(echo "$input" | grep -o "\\"file_path\\":\\"[^\\"]*\\"" | head -1 | sed "s/\\"file_path\\":\\"//;s/\\"//"); if [ -n "$file" ] && command -v npx >/dev/null 2>&1; then npx prettier --write "$file" 2>/dev/null; fi; echo "{}"\'';
        const logToolCallsCmd = 'bash -c \'input=$(cat); echo "[$(date -Iseconds)] $input" >> "$HOME/.claude/hooks/tool-calls.log"; echo "{}"\'';

        return [
            {
                name: 'Completion Notification',
                description: 'Show a system notification when Claude finishes a task',
                event: 'Stop',
                matcher: '',
                type: 'command',
                command: notifyCmd
            },
            {
                name: 'Auto-Commit Guard',
                description: 'Block Claude from stopping if there are uncommitted changes',
                event: 'Stop',
                matcher: '',
                type: 'command',
                command: commitGuardCmd
            },
            {
                name: 'Block Sensitive Files',
                description: 'Prevent editing .env, credentials, and key files',
                event: 'PreToolUse',
                matcher: 'Edit',
                type: 'command',
                command: blockSensitiveCmd
            },
            {
                name: 'Format on Save',
                description: 'Auto-format files after editing (requires prettier or similar)',
                event: 'PostToolUse',
                matcher: 'Edit',
                type: 'command',
                command: formatOnSaveCmd
            },
            {
                name: 'Log All Tool Calls',
                description: 'Log all tool calls to a file for debugging',
                event: 'PostToolUse',
                matcher: '',
                type: 'command',
                command: logToolCallsCmd
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

    /**
     * Build a raw hook entry for JSON serialization.
     * If _rawEntry exists, use it as base to preserve unknown fields.
     * Otherwise, construct from known fields.
     */
    private buildRawEntry(hook: ConfiguredHook | Omit<ConfiguredHook, 'id'>): Record<string, unknown> {
        // Start from original raw entry if available, to preserve unknown fields
        const entry: Record<string, unknown> = (hook as ConfiguredHook)._rawEntry
            ? { ...(hook as ConfiguredHook)._rawEntry }
            : { type: hook.type || 'command' };

        // Always set type
        entry.type = hook.type || 'command';

        // Set type-specific primary field
        switch (hook.type) {
            case 'http':
                if (hook.url !== undefined) { entry.url = hook.url; }
                if (hook.headers !== undefined) { entry.headers = hook.headers; }
                // Remove command-specific fields if type changed
                delete entry.command;
                break;
            case 'prompt':
            case 'agent':
                if (hook.prompt !== undefined) { entry.prompt = hook.prompt; }
                if (hook.model !== undefined) { entry.model = hook.model; }
                delete entry.command;
                break;
            case 'command':
            default:
                if (hook.command !== undefined) { entry.command = hook.command; }
                if (hook.async !== undefined) { entry.async = hook.async; }
                if (hook.shell !== undefined) { entry.shell = hook.shell; }
                break;
        }

        // Set common optional fields only if explicitly provided
        if (hook.if !== undefined) { entry.if = hook.if; }
        if (hook.timeout !== undefined) { entry.timeout = hook.timeout; }
        if (hook.statusMessage !== undefined) { entry.statusMessage = hook.statusMessage; }
        if (hook.once !== undefined) { entry.once = hook.once; }

        return entry;
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

            // Helper to find persisted description (supports command/url/prompt matching)
            const findDescription = (event: string, matcher: string, identifier: string): string => {
                const entry = descriptions.find(d =>
                    d.event === event &&
                    d.matcher === matcher &&
                    (d.command === identifier || d.url === identifier || d.prompt === identifier)
                );
                return entry ? entry.description : '';
            };

            if (!hooksSection) {
                // Also check for disabled-only hooks
                if (disabledHooks.length > 0) {
                    for (const disabled of disabledHooks) {
                        const hookType = (disabled.type || 'command') as HookType;
                        const identifier = getHookIdentifier({ type: hookType, command: disabled.command, url: disabled.url, prompt: disabled.prompt });
                        hooks.push({
                            id: crypto.randomUUID(),
                            event: disabled.event as HookEvent,
                            matcher: disabled.matcher,
                            type: hookType,
                            command: disabled.command,
                            url: disabled.url,
                            prompt: disabled.prompt,
                            description: findDescription(disabled.event, disabled.matcher, identifier),
                            scope,
                            enabled: false,
                            _rawEntry: disabled._rawEntry  // restore raw data if available
                        });
                    }
                }
                return hooks;
            }

            // Flatten the nested structure — dynamically iterate all event keys
            for (const event of Object.keys(hooksSection)) {
                const matcherGroups = hooksSection[event];
                if (!matcherGroups || !Array.isArray(matcherGroups)) {
                    continue;
                }

                for (const group of matcherGroups) {
                    if (!group.hooks || !Array.isArray(group.hooks)) {
                        continue;
                    }

                    for (const hookEntry of group.hooks) {
                        const hookType = (hookEntry.type || 'command') as HookType;
                        const identifier = getHookIdentifier(hookEntry);

                        const isDisabled = disabledHooks.some(
                            d => d.event === event && d.matcher === group.matcher && matchDisabledHook(d, hookEntry)
                        );

                        hooks.push({
                            id: crypto.randomUUID(),
                            event: event as HookEvent,
                            matcher: group.matcher,
                            type: hookType,
                            command: hookEntry.command as string | undefined,
                            url: hookEntry.url as string | undefined,
                            prompt: hookEntry.prompt as string | undefined,
                            if: hookEntry.if as string | undefined,
                            timeout: hookEntry.timeout as number | undefined,
                            statusMessage: hookEntry.statusMessage as string | undefined,
                            once: hookEntry.once as boolean | undefined,
                            async: hookEntry.async as boolean | undefined,
                            shell: hookEntry.shell as string | undefined,
                            model: hookEntry.model as string | undefined,
                            headers: hookEntry.headers as Record<string, string> | undefined,
                            description: findDescription(event, group.matcher, identifier),
                            scope,
                            enabled: !isDisabled,
                            _rawEntry: { ...hookEntry }
                        });
                    }
                }
            }

            // Add disabled-only hooks (those in _disabledHooks but not in hooks section)
            for (const disabled of disabledHooks) {
                const disabledType = (disabled.type || 'command') as HookType;
                const disabledAsRaw = { type: disabledType, command: disabled.command, url: disabled.url, prompt: disabled.prompt } as RawHookEntry;
                const alreadyIncluded = hooks.some(
                    h => h.event === disabled.event && h.matcher === disabled.matcher && matchDisabledHook(disabled, { type: h.type, command: h.command, url: h.url, prompt: h.prompt } as RawHookEntry)
                );
                if (!alreadyIncluded) {
                    const identifier = getHookIdentifier(disabledAsRaw);
                    hooks.push({
                        id: crypto.randomUUID(),
                        event: disabled.event as HookEvent,
                        matcher: disabled.matcher,
                        type: disabledType,
                        command: disabled.command,
                        url: disabled.url,
                        prompt: disabled.prompt,
                        description: findDescription(disabled.event, disabled.matcher, identifier),
                        scope,
                        enabled: false,
                        _rawEntry: disabled._rawEntry  // restore raw data if available
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
            const idx = group.hooks.findIndex(h => {
                switch (hook.type) {
                    case 'http': return h.url === hook.url;
                    case 'prompt': case 'agent': return h.prompt === hook.prompt;
                    default: return h.command === hook.command;
                }
            });
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
