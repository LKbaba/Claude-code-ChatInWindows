import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EffortLevel, PICKER_MODELS, isEffortLevelSupported } from '../utils/constants';
import { debugLog } from '../services/DebugLogger';

/**
 * Where a CLAUDE_CODE_EFFORT_LEVEL value comes from. The CLI lets this variable
 * override --effort, so the webview warns about it and the process service clears it.
 */
export interface EffortEnvOverride {
    value: string;
    source: string;
}

/**
 * Snapshot sent to the webview (message type 'modelConfig')
 */
export interface ModelConfigSnapshot {
    models: typeof PICKER_MODELS;
    effortByModel: Record<string, EffortLevel>;
    hiddenModels: string[];
    effortEnvOverride?: EffortEnvOverride;
}

/**
 * Per-model preferences from the model picker's Config panel:
 * - effort level per model ("Auto" = no entry, so the CLI decides)
 * - which models are hidden from the picker
 *
 * Stored in globalState so the choices are shared by every workspace and window,
 * matching how the CLI itself saves effort per model.
 */
export class ModelPreferencesManager {
    private static readonly EFFORT_KEY = 'claude.effortByModel';
    private static readonly HIDDEN_KEY = 'claude.hiddenModels';
    // Default-hidden models (defaultHidden in PICKER_MODELS) the user turned on
    private static readonly SHOWN_KEY = 'claude.shownModels';

    // Default is the permanent fallback, so it can never be hidden
    private static readonly ALWAYS_VISIBLE = 'default';

    constructor(private readonly _globalState: vscode.Memento) {}

    /**
     * Saved effort levels, dropping entries that are no longer valid for their model
     */
    public getEffortMap(): Record<string, EffortLevel> {
        const raw = this._globalState.get<Record<string, string>>(ModelPreferencesManager.EFFORT_KEY) || {};
        const result: Record<string, EffortLevel> = {};
        for (const [modelId, level] of Object.entries(raw)) {
            if (isEffortLevelSupported(modelId, level)) {
                result[modelId] = level;
            }
        }
        return result;
    }

    /**
     * Models hidden by the user, plus default-hidden models the user has not turned on
     */
    public getHiddenModels(): string[] {
        const hidden = new Set(this._globalState.get<string[]>(ModelPreferencesManager.HIDDEN_KEY) || []);
        const shown = new Set(this._globalState.get<string[]>(ModelPreferencesManager.SHOWN_KEY) || []);
        return PICKER_MODELS
            .filter(m => m.id !== ModelPreferencesManager.ALWAYS_VISIBLE)
            .filter(m => hidden.has(m.id) || (m.defaultHidden && !shown.has(m.id)))
            .map(m => m.id);
    }

    /**
     * Level to pass as `--effort`, or undefined to let the CLI decide (Auto)
     */
    public getEffectiveEffort(modelId: string): EffortLevel | undefined {
        return this.getEffortMap()[modelId];
    }

    /**
     * @param level 'auto' clears the saved level
     * @returns false when the model/level combination is not allowed
     */
    public async setEffort(modelId: string, level: string): Promise<boolean> {
        const map = this.getEffortMap();
        if (level === 'auto') {
            delete map[modelId];
        } else if (isEffortLevelSupported(modelId, level)) {
            map[modelId] = level;
        } else {
            return false;
        }
        await this._globalState.update(ModelPreferencesManager.EFFORT_KEY, map);
        debugLog('ModelPreferencesManager', 'Effort level saved', { modelId, level });
        return true;
    }

    /**
     * @param selectedModel the model currently in use, which cannot be hidden
     * @returns false when the model cannot be hidden
     */
    public async setHidden(modelId: string, hidden: boolean, selectedModel: string): Promise<boolean> {
        if (!PICKER_MODELS.some(m => m.id === modelId)) {
            return false;
        }
        if (hidden && (modelId === ModelPreferencesManager.ALWAYS_VISIBLE || modelId === selectedModel)) {
            return false;
        }
        const hiddenSet = new Set(this._globalState.get<string[]>(ModelPreferencesManager.HIDDEN_KEY) || []);
        const shownSet = new Set(this._globalState.get<string[]>(ModelPreferencesManager.SHOWN_KEY) || []);
        const defaultHidden = PICKER_MODELS.some(m => m.id === modelId && m.defaultHidden);
        if (hidden) {
            hiddenSet.add(modelId);
            shownSet.delete(modelId);
        } else {
            hiddenSet.delete(modelId);
            if (defaultHidden) {
                shownSet.add(modelId);
            }
        }
        await this._globalState.update(ModelPreferencesManager.HIDDEN_KEY, Array.from(hiddenSet));
        await this._globalState.update(ModelPreferencesManager.SHOWN_KEY, Array.from(shownSet));
        debugLog('ModelPreferencesManager', 'Model visibility saved', { modelId, hidden });
        return true;
    }

    public async reset(): Promise<void> {
        await this._globalState.update(ModelPreferencesManager.EFFORT_KEY, undefined);
        await this._globalState.update(ModelPreferencesManager.HIDDEN_KEY, undefined);
        await this._globalState.update(ModelPreferencesManager.SHOWN_KEY, undefined);
        debugLog('ModelPreferencesManager', 'Model preferences reset');
    }

    /**
     * @param workspaceRoot used to find project-level settings files
     */
    public getSnapshot(workspaceRoot?: string): ModelConfigSnapshot {
        return {
            models: PICKER_MODELS,
            effortByModel: this.getEffortMap(),
            hiddenModels: this.getHiddenModels(),
            effortEnvOverride: ModelPreferencesManager.detectEffortEnvOverride(workspaceRoot)
        };
    }

    /**
     * Find a non-empty CLAUDE_CODE_EFFORT_LEVEL the CLI would apply, checking sources
     * from highest to lowest precedence: settings `env` blocks override the process
     * environment, and local > project > user settings. Managed settings are not checked.
     */
    public static detectEffortEnvOverride(workspaceRoot?: string): EffortEnvOverride | undefined {
        const candidates: Array<{ file: string; source: string }> = [];
        if (workspaceRoot) {
            candidates.push(
                { file: path.join(workspaceRoot, '.claude', 'settings.local.json'), source: '.claude/settings.local.json' },
                { file: path.join(workspaceRoot, '.claude', 'settings.json'), source: '.claude/settings.json' }
            );
        }
        candidates.push({ file: path.join(os.homedir(), '.claude', 'settings.json'), source: '~/.claude/settings.json' });

        for (const { file, source } of candidates) {
            try {
                const json = JSON.parse(fs.readFileSync(file, 'utf8'));
                const value = json?.env?.CLAUDE_CODE_EFFORT_LEVEL;
                if (typeof value === 'string' && value.trim()) {
                    return { value: value.trim(), source };
                }
            } catch {
                // Missing or unreadable file: the CLI would skip it too
            }
        }

        const envValue = process.env.CLAUDE_CODE_EFFORT_LEVEL;
        if (envValue && envValue.trim()) {
            return { value: envValue.trim(), source: 'environment variable' };
        }
        return undefined;
    }
}
