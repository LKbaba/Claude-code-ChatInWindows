/**
 * Stop Hook Fallback Service (completion detection B2).
 *
 * B1 (transcript `stop_reason === "end_turn"`) is the primary turn-completion
 * signal. This service adds an OPTIONAL secondary signal: a one-shot Claude
 * `Stop` hook that writes a sentinel file at the end of every turn. The plugin
 * watches that sentinel and, if B1 has not already fired for the turn, uses it
 * as a fallback to unlock the UI. B1/B2 are de-duplicated upstream so a turn is
 * only completed once.
 *
 * Design notes:
 *   - Disabled by default (decision: do not touch the user's settings unless
 *     opted in). Controlled by `claudeCodeChatUI.completion.useStopHookFallback`.
 *   - Injection into `~/.claude/settings.json` is idempotent and merges with the
 *     user's existing hooks (never overwrites). Our hook is identified by the
 *     sentinel filename embedded in its command string.
 *   - The hook script parses its stdin JSON and exits early when
 *     `stop_hook_active` is true (anti-recursion guard).
 *   - Single sentinel file: in rare multi-window scenarios the file may be
 *     overwritten, dropping a B2 event. That is acceptable because B1 remains
 *     the primary signal; B2 is best-effort.
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { debugLog, debugError } from './DebugLogger';

/** Metadata parsed from a sentinel write (subset of the Stop hook payload). */
export interface StopHookSignal {
    sessionId?: string;
    transcriptPath?: string;
}

// Marker embedded in the hook command so we can find/remove only our own entry.
const SENTINEL_NAME = '.ccchatui-turn-done';

export class StopHookFallbackService {
    private _watching = false;
    private _onSignal: ((signal: StopHookSignal) => void) | undefined;
    private _lastMtimeMs = 0;

    /** True when the user has opted into the Stop hook fallback. */
    public isEnabled(): boolean {
        try {
            return vscode.workspace
                .getConfiguration('claudeCodeChatUI')
                .get<boolean>('completion.useStopHookFallback') === true;
        } catch {
            return false;
        }
    }

    private get _globalSettingsPath(): string {
        return path.join(os.homedir(), '.claude', 'settings.json');
    }

    private get _sentinelPath(): string {
        return path.join(os.homedir(), '.claude', SENTINEL_NAME);
    }

    // -----------------------------------------------------------------------
    // Hook installation (idempotent, merges with existing user hooks)
    // -----------------------------------------------------------------------

    /** Inject the one-shot Stop hook into ~/.claude/settings.json if absent. */
    public async install(): Promise<void> {
        const filePath = this._globalSettingsPath;
        const data = await this._readJson(filePath);

        const hooks = (data.hooks ?? {}) as Record<string, any[]>;
        const stopGroups = Array.isArray(hooks.Stop) ? hooks.Stop : [];

        // Already installed? (identified by the sentinel marker in any command)
        const exists = stopGroups.some(g =>
            Array.isArray(g?.hooks) &&
            g.hooks.some((h: any) => typeof h?.command === 'string' && h.command.includes(SENTINEL_NAME))
        );
        if (exists) {
            debugLog('StopHookFallbackService', 'Stop hook already installed; skipping');
            return;
        }

        // Append to the match-all ("") group, creating it if needed, so we do
        // not disturb the user's existing Stop hooks.
        let group = stopGroups.find(g => g?.matcher === '');
        if (!group) {
            group = { matcher: '', hooks: [] };
            stopGroups.push(group);
        }
        if (!Array.isArray(group.hooks)) {
            group.hooks = [];
        }
        group.hooks.push({ type: 'command', command: this._buildHookCommand() });

        hooks.Stop = stopGroups;
        data.hooks = hooks;

        await this._writeJson(filePath, data);
        debugLog('StopHookFallbackService', 'Installed Stop hook fallback into global settings');
    }

    /** Remove our Stop hook from ~/.claude/settings.json (leaves user hooks intact). */
    public async uninstall(): Promise<void> {
        const filePath = this._globalSettingsPath;
        let data: Record<string, any>;
        try {
            data = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
        } catch {
            return; // nothing to clean up
        }

        const hooks = data.hooks as Record<string, any[]> | undefined;
        if (!hooks || !Array.isArray(hooks.Stop)) {
            return;
        }

        // Skip the write entirely if our hook is not present (avoid touching the
        // user's file needlessly).
        const present = hooks.Stop.some(g =>
            Array.isArray(g?.hooks) &&
            g.hooks.some((h: any) => typeof h?.command === 'string' && h.command.includes(SENTINEL_NAME))
        );
        if (!present) {
            return;
        }

        for (const group of hooks.Stop) {
            if (Array.isArray(group?.hooks)) {
                group.hooks = group.hooks.filter(
                    (h: any) => !(typeof h?.command === 'string' && h.command.includes(SENTINEL_NAME))
                );
            }
        }
        // Drop now-empty groups / event.
        hooks.Stop = hooks.Stop.filter(g => Array.isArray(g?.hooks) && g.hooks.length > 0);
        if (hooks.Stop.length === 0) {
            delete hooks.Stop;
        }
        if (Object.keys(hooks).length === 0) {
            delete data.hooks;
        }

        await this._writeJson(filePath, data);
        debugLog('StopHookFallbackService', 'Uninstalled Stop hook fallback from global settings');
    }

    // -----------------------------------------------------------------------
    // Sentinel watching
    // -----------------------------------------------------------------------

    /**
     * Start polling the sentinel file. Fires `onSignal` once per fresh write.
     * Uses fs.watchFile (polling) which is reliable across platforms for the
     * low write frequency here. Safe to call repeatedly.
     */
    public startWatching(onSignal: (signal: StopHookSignal) => void): void {
        this._onSignal = onSignal;
        if (this._watching) {
            return;
        }
        this._watching = true;

        // Seed the baseline mtime so a stale sentinel from a previous run does
        // not fire immediately.
        try { this._lastMtimeMs = fs.statSync(this._sentinelPath).mtimeMs; } catch { this._lastMtimeMs = 0; }

        fs.watchFile(this._sentinelPath, { interval: 250 }, (curr) => {
            if (curr.mtimeMs > this._lastMtimeMs) {
                this._lastMtimeMs = curr.mtimeMs;
                this._handleSentinel();
            }
        });
        debugLog('StopHookFallbackService', 'Watching sentinel', { path: this._sentinelPath });
    }

    public stopWatching(): void {
        if (!this._watching) {
            return;
        }
        this._watching = false;
        this._onSignal = undefined;
        try { fs.unwatchFile(this._sentinelPath); } catch { /* ignore */ }
    }

    public dispose(): void {
        this.stopWatching();
    }

    /** Read + parse the sentinel (the raw Stop hook payload) and emit a signal. */
    private _handleSentinel(): void {
        let signal: StopHookSignal = {};
        try {
            const raw = fs.readFileSync(this._sentinelPath, 'utf-8').trim();
            if (raw) {
                const payload = JSON.parse(raw);
                signal = {
                    sessionId: typeof payload?.session_id === 'string' ? payload.session_id : undefined,
                    transcriptPath: typeof payload?.transcript_path === 'string' ? payload.transcript_path : undefined
                };
            }
        } catch (error) {
            // A partial/garbled write is harmless; B1 still covers completion.
            debugError('StopHookFallbackService', 'Failed to parse sentinel', error);
        }
        this._onSignal?.(signal);
    }

    // -----------------------------------------------------------------------
    // Hook command construction
    // -----------------------------------------------------------------------

    /**
     * Build the platform-specific Stop hook command. The hook writes its raw
     * stdin payload (which carries session_id + transcript_path) to the sentinel
     * file, and exits early when stop_hook_active is set (anti-recursion).
     */
    private _buildHookCommand(): string {
        if (process.platform === 'win32') {
            const script = `$ErrorActionPreference = 'SilentlyContinue'
$in = [Console]::In.ReadToEnd()
try { $j = $in | ConvertFrom-Json } catch { $j = $null }
if ($j -and $j.stop_hook_active) { Write-Output '{}'; exit 0 }
$dir = Join-Path $env:USERPROFILE '.claude'
if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$out = Join-Path $dir '${SENTINEL_NAME}'
Set-Content -LiteralPath $out -Value $in -Encoding UTF8
Write-Output '{}'`;
            const encoded = Buffer.from(script, 'utf16le').toString('base64');
            return `powershell -NoProfile -EncodedCommand ${encoded}`;
        }
        // mac/Linux (and Windows Git Bash if claude runs hooks via bash).
        return `bash -c 'input=$(cat); case "$input" in *'"'"'"stop_hook_active":true'"'"'*) exit 0;; esac; printf "%s" "$input" > "$HOME/.claude/${SENTINEL_NAME}"; echo "{}"'`;
    }

    // -----------------------------------------------------------------------
    // JSON file helpers
    // -----------------------------------------------------------------------

    private async _readJson(filePath: string): Promise<Record<string, any>> {
        try {
            return JSON.parse(await fsp.readFile(filePath, 'utf-8'));
        } catch {
            return {};
        }
    }

    private async _writeJson(filePath: string, data: Record<string, any>): Promise<void> {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            await fsp.mkdir(dir, { recursive: true });
        }
        await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
}
