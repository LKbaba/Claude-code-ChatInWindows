/**
 * MCP (Model Context Protocol) Configuration Manager
 * Manages all MCP-related configuration operations
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expandVariables } from '../../utils/configUtils';
import { secretService } from '../../services/SecretService';
import { debugLog, debugWarn, debugError } from '../../services/DebugLogger';

export interface McpStatus {
    status: 'disabled' | 'configured' | 'testing' | 'connected' | 'error';
    message: string;
    servers?: any[];
}

export interface McpConfigBuildResult {
    config: any;
    configPath: string | null;
    /**
     * Real secret values referenced by `${CHATUI_SECRET_*}` placeholders in the
     * written config file. Must be merged into the spawn env of the CLI process
     * only (never into process.env); the CLI expands the placeholders itself
     * when it starts the MCP servers.
     */
    secretEnv: Record<string, string>;
}

/** Name produced by fs.mkdtempSync(path.join(claudeDir, 'mcp-')): exactly 6 random [A-Za-z0-9] chars */
const MCP_TEMP_DIR_PATTERN = /^mcp-[A-Za-z0-9]{6}$/;
const MCP_CONFIG_FILE_NAME = 'mcp-config.json';
/** Temp dirs older than this are considered orphaned (the CLI reads the file only at startup) */
const MCP_STALE_DIR_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Prefix for env vars carrying secrets, so we never clobber a user's own XAI_API_KEY etc. */
const SECRET_ENV_PREFIX = 'CHATUI_SECRET_';
/** Env/header names whose values must never be written to the debug log */
const SECRET_NAME_PATTERN = /key|token|secret|credential|password|auth/i;

export class McpConfigManager {
    private _sweepInProgress = false;

    /**
     * Returns the ~/.claude directory where MCP temp config dirs are created
     */
    private static getClaudeDir(): string {
        return path.join(os.homedir(), '.claude');
    }

    /**
     * Strict check that a path is one of our own MCP temp config dirs and is old enough to delete.
     * ALL conditions must hold: direct child of ~/.claude, name matches the mkdtemp pattern,
     * a real directory (not a symlink), containing exactly one regular file `mcp-config.json`,
     * and last modified at least `maxAgeMs` ago.
     */
    private static isDeletableMcpTempDir(dirPath: string, maxAgeMs: number): boolean {
        try {
            const resolved = path.resolve(dirPath);
            const parent = path.dirname(resolved);
            const claudeDir = path.resolve(McpConfigManager.getClaudeDir());
            const sameParent = process.platform === 'win32'
                ? parent.toLowerCase() === claudeDir.toLowerCase()
                : parent === claudeDir;
            if (!sameParent || !MCP_TEMP_DIR_PATTERN.test(path.basename(resolved))) {
                return false;
            }

            const dirStat = fs.lstatSync(resolved);
            if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
                return false;
            }

            const entries = fs.readdirSync(resolved);
            if (entries.length !== 1 || entries[0] !== MCP_CONFIG_FILE_NAME) {
                return false;
            }
            const fileStat = fs.lstatSync(path.join(resolved, MCP_CONFIG_FILE_NAME));
            if (!fileStat.isFile()) {
                return false;
            }

            const lastModified = Math.max(dirStat.mtimeMs, fileStat.mtimeMs);
            return Date.now() - lastModified >= maxAgeMs;
        } catch {
            // Vanished or unreadable: leave it alone
            return false;
        }
    }

    /**
     * Delete the temp dir that holds a config file written by buildMcpConfig().
     * Called when the CLI process that used it has exited. The exact path is
     * known, so this never touches another window's config.
     */
    public removeMcpConfigDir(configPath: string | null | undefined): void {
        if (!configPath) {
            return;
        }
        const dir = path.dirname(configPath);
        if (!McpConfigManager.isDeletableMcpTempDir(dir, 0)) {
            debugWarn('McpConfigManager', `Skipped removing MCP config dir (failed safety check): ${dir}`);
            return;
        }
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            debugLog('McpConfigManager', `Removed MCP config dir after CLI exit: ${dir}`);
        } catch (error) {
            debugWarn('McpConfigManager', `Failed to remove MCP config dir: ${dir}`, error);
        }
    }

    /**
     * Delete orphaned MCP temp config dirs (e.g. left behind when VS Code was
     * closed mid-turn). Only entries passing isDeletableMcpTempDir() are removed.
     * @returns Number of removed dirs
     */
    public async sweepStaleMcpConfigDirs(maxAgeMs: number = MCP_STALE_DIR_MAX_AGE_MS): Promise<number> {
        if (this._sweepInProgress) {
            return 0;
        }
        this._sweepInProgress = true;
        let removed = 0;
        try {
            const claudeDir = McpConfigManager.getClaudeDir();
            let entries: string[];
            try {
                entries = await fs.promises.readdir(claudeDir);
            } catch {
                return 0;
            }

            for (const entry of entries) {
                if (!MCP_TEMP_DIR_PATTERN.test(entry)) {
                    continue;
                }
                const fullPath = path.join(claudeDir, entry);
                // Re-check right before deleting
                if (!McpConfigManager.isDeletableMcpTempDir(fullPath, maxAgeMs)) {
                    continue;
                }
                try {
                    await fs.promises.rm(fullPath, { recursive: true, force: true });
                    removed++;
                    debugLog('McpConfigManager', `Removed stale MCP config dir: ${fullPath}`);
                } catch (error) {
                    debugWarn('McpConfigManager', `Failed to remove stale MCP config dir: ${fullPath}`, error);
                }
            }
            debugLog('McpConfigManager', `Stale MCP config sweep finished, removed ${removed} dir(s)`);
        } finally {
            this._sweepInProgress = false;
        }
        return removed;
    }

    /**
     * Replace a secret value with a `${CHATUI_SECRET_<name>}` placeholder and
     * record the real value in secretEnv for the CLI process env.
     */
    private static toSecretPlaceholder(secretEnv: Record<string, string>, name: string, value: string): string {
        const envName = SECRET_ENV_PREFIX + name;
        secretEnv[envName] = value;
        return '${' + envName + '}';
    }

    /**
     * Deep copy of an MCP config with secret-looking env/header values redacted.
     * `${...}` placeholders are kept as-is since they carry no secret.
     */
    public static redactMcpConfigForLog(config: any): any {
        const redactMap = (map: any) => {
            if (!map || typeof map !== 'object') {
                return map;
            }
            const out: Record<string, any> = {};
            for (const [k, v] of Object.entries<any>(map)) {
                const sv = String(v ?? '');
                out[k] = SECRET_NAME_PATTERN.test(k) && !sv.startsWith('${')
                    ? `<redacted len=${sv.length}>`
                    : v;
            }
            return out;
        };

        const servers: Record<string, any> = {};
        for (const [name, cfg] of Object.entries<any>(config?.mcpServers || {})) {
            servers[name] = { ...cfg };
            if (cfg && cfg.env) {
                servers[name].env = redactMap(cfg.env);
            }
            if (cfg && cfg.headers) {
                servers[name].headers = redactMap(cfg.headers);
            }
        }
        return { ...config, mcpServers: servers };
    }
    /**
     * Get current active editor's resource URI
     * Used to get correct configuration scope in multi-root workspace scenarios
     * @returns Resource URI or undefined
     */
    private getActiveResourceUri(): vscode.Uri | undefined {
        // Prefer active editor's document URI
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            return activeEditor.document.uri;
        }

        // Fall back to first workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri;
        }

        return undefined;
    }

    /**
     * Get merged MCP server configuration
     * Priority: workspace config > user config
     * Merge strategy:
     *   - Same name servers: workspace config overrides user config
     *   - Different name servers: merge and display all
     *   - disabled: true servers: excluded from final result
     * @param resource Optional resource URI for multi-root workspace
     * @returns Merged server list (filtered out disabled servers)
     */
    private getMergedMcpServers(resource?: vscode.Uri): any[] {
        // Use resource URI to get correct scope configuration
        const resourceUri = resource || this.getActiveResourceUri();
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI', resourceUri);

        // Get configuration details including source
        const serversInspect = config.inspect<any[]>('mcp.servers');

        // User level configuration (global)
        const userServers = serversInspect?.globalValue || [];
        // Workspace level configuration (project specific)
        const workspaceServers = serversInspect?.workspaceValue || [];
        // Workspace folder level configuration (multi-root workspace)
        const folderServers = serversInspect?.workspaceFolderValue || [];

        // Create server name to config mapping for smart merging
        const serverMap = new Map<string, any>();

        // First add user level servers (global)
        for (const server of userServers) {
            if (server.name) {
                serverMap.set(server.name, server);
            }
        }

        // Then override/add with workspace level servers
        for (const server of workspaceServers) {
            if (server.name) {
                serverMap.set(server.name, server);
            }
        }

        // Finally override/add with folder level servers
        for (const server of folderServers) {
            if (server.name) {
                serverMap.set(server.name, server);
            }
        }

        // Filter out disabled: true servers
        const mergedServers = Array.from(serverMap.values())
            .filter(server => !server.disabled);

        debugLog('McpConfigManager', 'MCP servers merged', {
            userCount: userServers.length,
            workspaceCount: workspaceServers.length,
            folderCount: folderServers.length,
            mergedCount: mergedServers.length,
            resourceUri: resourceUri?.toString() || 'none'
        });

        return mergedServers;
    }

    /**
     * Get MCP enabled status
     * VS Code's config.get() already handles scope priority automatically
     * @param resource Optional resource URI for multi-root workspace
     * @returns Whether MCP is enabled
     */
    private getMcpEnabled(resource?: vscode.Uri): boolean {
        const resourceUri = resource || this.getActiveResourceUri();
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI', resourceUri);
        // VS Code automatically returns by priority: workspaceFolder > workspace > user > default
        return config.get<boolean>('mcp.enabled', false);
    }

    /**
     * Gets MCP (Model Context Protocol) status
     * @returns MCP status object
     */
    public getMcpStatus(): McpStatus {
        const mcpEnabled = this.getMcpEnabled();
        const mcpServers = this.getMergedMcpServers();

        // Only report as configured if MCP is enabled AND there are servers
        const isActuallyConfigured = mcpEnabled && mcpServers.length > 0;

        return {
            status: isActuallyConfigured ? 'configured' : 'disabled',
            message: isActuallyConfigured
                ? `${mcpServers.length} server(s) configured`
                : (mcpEnabled ? 'MCP enabled but no servers configured' : 'MCP disabled'),
            servers: isActuallyConfigured ? mcpServers : []
        };
    }

    /**
     * Builds MCP configuration for Claude CLI
     * @returns MCP configuration object, temp file path, and the secret env for the CLI process
     */
    public async buildMcpConfig(): Promise<McpConfigBuildResult> {
        // Opportunistic cleanup of orphaned temp dirs from earlier sessions.
        // Not awaited: it only touches dirs older than 24h, so it cannot race
        // with the config written below or with another window's live config.
        void this.sweepStaleMcpConfigDirs().catch(error => {
            debugWarn('McpConfigManager', 'Stale MCP config sweep failed', error);
        });

        const mcpEnabled = this.getMcpEnabled();
        const mcpServers = this.getMergedMcpServers();
        const secretEnv: Record<string, string> = {};

        if (!mcpEnabled || mcpServers.length === 0) {
            return { config: null, configPath: null, secretEnv };
        }

        // Create MCP configuration object
        const mcpConfig: {
            mcpServers: { [key: string]: any }
        } = {
            mcpServers: {}
        };
        
        mcpServers.forEach((server) => {
            // Validate server name
            if (!server.name) {
                debugWarn('McpConfigManager', 'Server missing name, skipping');
                return;
            }

            const serverConfig: any = {};
            const serverType = server.type || 'stdio'; // Default to stdio

            if (serverType === 'http' || serverType === 'sse') {
                // ===== HTTP/SSE mode =====
                if (!server.url) {
                    debugWarn('McpConfigManager', `Server ${server.name} is ${serverType} type but missing url`);
                    return;
                }

                serverConfig.type = serverType;
                serverConfig.url = server.url;

                // Add headers if any
                if (server.headers && typeof server.headers === 'object') {
                    serverConfig.headers = server.headers;
                }

            } else {
                // ===== stdio mode (original logic) =====
                if (!server.command) {
                    debugWarn('McpConfigManager', `Server ${server.name} is stdio type but missing command`);
                    return;
                }

                let command = expandVariables(server.command);
                let args: string[] = [];
                let originalCommand = command; // Save original command for logging

                // On Windows, shim-based launchers (.cmd/.bat) cannot be
                // spawned directly by Node's child_process — they need a
                // `cmd /c` wrapper. Do NOT include real .exe binaries like
                // `node` here: wrapping `node` in `cmd /c` adds an extra
                // shell layer that breaks the MCP stdio JSON-RPC pipes that
                // Claude CLI relies on (observed: tools/list succeeds via
                // plugin probe but Claude CLI's tools/call returns
                // "Connection closed" because the wrapped subprocess never
                // completes a proper stdio handshake).
                const windowsCommandsNeedingWrapper = ['npx', 'npm'];
                const needsWindowsWrapper = process.platform === 'win32' &&
                    windowsCommandsNeedingWrapper.includes(command.toLowerCase());

                // Helper function: normalize args to correct array format
                // Handle incorrectly split array elements (e.g., ["-y @pkg-", "name"] -> ["-y", "@pkg-name"])
                const normalizeArgs = (rawArgs: string | string[]): string[] => {
                    let argsStr: string;
                    if (typeof rawArgs === 'string') {
                        argsStr = rawArgs.trim();
                    } else if (Array.isArray(rawArgs)) {
                        // Join array elements into string, then re-split
                        argsStr = rawArgs.join(' ').trim();
                    } else {
                        return [];
                    }

                    if (!argsStr) return [];

                    // Split by whitespace, preserving each argument's integrity
                    return argsStr.split(/\s+/).filter(arg => arg.length > 0).map(expandVariables);
                };

                if (needsWindowsWrapper) {
                    // Convert command to cmd /c format
                    command = 'cmd';
                    args = ['/c', originalCommand];

                    // Add original args
                    if (server.args) {
                        args.push(...normalizeArgs(server.args));
                    }
                } else {
                    // Non-Windows or non-npx command, use original logic
                    if (server.args) {
                        args = normalizeArgs(server.args);
                    }
                }

                // Build server configuration
                serverConfig.command = command;

                // Add args if any
                if (args.length > 0) {
                    serverConfig.args = args;
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
                                    envObj[key] = expandVariables(value);
                                }
                            });
                            serverConfig.env = envObj;
                        }
                    } else if (typeof server.env === 'object') {
                        // Expand variables in object values
                        const expandedEnv: any = {};
                        for (const [key, value] of Object.entries(server.env)) {
                            let expandedValue = typeof value === 'string' ? expandVariables(value) : value;

                            // Normalize Windows paths
                            if (typeof expandedValue === 'string' && process.platform === 'win32') {
                                // Ensure proper path separators for Windows
                                expandedValue = path.normalize(expandedValue);
                            }

                            expandedEnv[key] = expandedValue;
                        }
                        serverConfig.env = expandedEnv;
                    }
                }

                // Log Windows config conversion
                if (process.platform === 'win32' && originalCommand !== serverConfig.command) {
                    debugLog('McpConfigManager', `Windows cmd wrapper applied for server '${server.name}'`, {
                        originalCommand: originalCommand,
                        convertedCommand: serverConfig.command,
                        args: serverConfig.args
                    });
                }
            }

            // Add to config
            mcpConfig.mcpServers[server.name] = serverConfig;
        });

        // ==================== AI API Key Runtime Injection ====================
        // Inject securely stored API keys / credentials into matching MCP servers.
        // The config file only gets ${CHATUI_SECRET_*} placeholders; real values go to secretEnv.
        await this.injectApiKeysIfNeeded(mcpConfig, secretEnv);

        // ==================== Host Environment Backfill ====================
        // Claude CLI passes the `env` map in mcp-config.json directly to
        // child_process.spawn() WITHOUT merging ...process.env. Any MCP server
        // with an explicit `env` block therefore loses access to PATH, APPDATA,
        // HOME, SystemRoot, proxies, etc. This breaks:
        //   - Node resolving runtime paths / loading modules from %APPDATA%
        //   - Google auth library locating ADC creds under %APPDATA%/gcloud
        //   - Any server behind a corporate HTTPS_PROXY
        // See: github.com/anthropics/claude-code issues #1254, #24586, #28332.
        // Fix: for every server that already has an `env` block, backfill the
        // critical host vars (user/injected values win — we never override).
        for (const serverConfig of Object.values(mcpConfig.mcpServers)) {
            if (serverConfig && typeof serverConfig.env === 'object' && serverConfig.env !== null) {
                this.backfillHostEnv(serverConfig.env);
            }
        }

        // Write MCP config to a temporary file in ~/.claude directory
        let mcpConfigPath: string | null = null;
        if (Object.keys(mcpConfig.mcpServers).length > 0) {
            try {
                // Use ~/.claude directory for temporary files (Claude Code v1.0.48+)
                const homeDir = os.homedir();
                const claudeDir = path.join(homeDir, '.claude');
                
                // Ensure ~/.claude directory exists
                if (!fs.existsSync(claudeDir)) {
                    fs.mkdirSync(claudeDir, { recursive: true });
                }
                
                // Create temp directory within ~/.claude
                const tempDir = fs.mkdtempSync(path.join(claudeDir, 'mcp-'));
                mcpConfigPath = path.join(tempDir, 'mcp-config.json');
                
                // Log configuration before writing (redacted: second line of defense after placeholders)
                debugLog('buildMcpConfig', 'Generated MCP configuration', McpConfigManager.redactMcpConfigForLog(mcpConfig));

                fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

                // Verify the file was written correctly
                const writtenContent = fs.readFileSync(mcpConfigPath, 'utf8');
                debugLog('buildMcpConfig', `Written MCP config file: ${mcpConfigPath}`);
                debugLog('buildMcpConfig', 'File content', McpConfigManager.redactMcpConfigForLog(JSON.parse(writtenContent)));
                debugLog('buildMcpConfig', 'Secrets passed via CLI process env', Object.fromEntries(
                    Object.entries(secretEnv).map(([k, v]) => [k, `<set len=${v.length}>`])
                ));

                // ==================== DIAGNOSTIC: per-server env keys ====================
                // Print the env keys that each MCP server will supposedly receive via
                // mcp-config.json. We redact values that look like secrets so the log
                // can be shared safely. For Gemini servers we emit a specific marker
                // explaining what to look for in the MCP subprocess stderr.
                try {
                    const parsed = JSON.parse(writtenContent);
                    for (const [name, cfg] of Object.entries<any>(parsed.mcpServers || {})) {
                        const envEntries = Object.entries<any>(cfg.env || {}).map(([k, v]) => {
                            const sv = String(v ?? '');
                            const redact = SECRET_NAME_PATTERN.test(k) && !sv.startsWith('${');
                            const short = sv.length > 40 ? sv.slice(0, 20) + '...(' + sv.length + ')' : sv;
                            return [k, redact ? `<redacted len=${sv.length}>` : short];
                        });
                        debugLog('buildMcpConfig:env-probe', `server='${name}' command='${cfg.command}' argc=${(cfg.args || []).length}`, {
                            envKeys: envEntries.map(([k]) => k),
                            envSample: Object.fromEntries(envEntries),
                        });
                        if (name.toLowerCase().includes('gemini')) {
                            const useVertex = cfg.env?.GOOGLE_GENAI_USE_VERTEXAI;
                            const project = cfg.env?.GOOGLE_CLOUD_PROJECT;
                            const hasApiKey = !!cfg.env?.GEMINI_API_KEY;
                            const hasSaJson = !!cfg.env?.GOOGLE_CREDENTIALS_JSON;
                            debugLog('buildMcpConfig:gemini-marker',
                                `Gemini server '${name}' — inspect subprocess stderr for one of:\n` +
                                `  OK   -> '[INFO] Auth mode: vertex-ai (project: ${project}, location: ...)'  (means env reached subprocess)\n` +
                                `  FAIL -> 'No authentication configured'  (means env was stripped by Claude CLI)`,
                                { useVertex, project, hasApiKey, hasSaJson });
                        }
                    }
                } catch (e) {
                    debugWarn('buildMcpConfig:env-probe', 'Failed to dump env probe', e);
                }
            } catch (error) {
                debugError('buildMcpConfig', 'Failed to write MCP config file', error);
                throw new Error(`Failed to write MCP configuration: ${error}`);
            }
        }

        return { config: mcpConfig, configPath: mcpConfigPath, secretEnv };
    }

    /**
     * Tests MCP connection by spawning a test process
     * @param getExecutionEnvironment Function to get execution environment
     * @returns Promise resolving to test results
     */
    public async testMcpConnection(
        getExecutionEnvironment: () => Promise<{ spawnOptions: cp.SpawnOptions, claudeExecutablePath: string | undefined }>
    ): Promise<McpStatus> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const mcpEnabled = config.get<boolean>('mcp.enabled', false);

        // Use getMergedMcpServers to get merged server list (global + workspace)
        const mcpServers = this.getMergedMcpServers();

        if (!mcpEnabled || mcpServers.length === 0) {
            return {
                status: 'disabled',
                message: 'MCP is not enabled or no servers configured'
            };
        }

        // Build test configuration
        const { configPath, secretEnv } = await this.buildMcpConfig();
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
            // Values for the ${CHATUI_SECRET_*} placeholders (child process only)
            spawnOptions.env = { ...(spawnOptions.env || process.env), ...secretEnv };

            // Test the MCP connection by running a simple command
            const args = ['--version', '--mcp-config', configPath];
            const testProcess = cp.spawn(claudeExecutablePath, args, spawnOptions);
            testProcess.on('close', () => this.removeMcpConfigDir(configPath));

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
            this.removeMcpConfigDir(configPath);
            return {
                status: 'error',
                message: `Failed to test MCP: ${error.message}`,
                servers: mcpServers.map(s => ({ name: s.name, status: 'error' }))
            };
        }
    }

    // ==================== AI API Key Injection Methods ====================

    /**
     * Check if a server matches a provider by name or args
     */
    private isServerForProvider(serverName: string, serverConfig: any, keyword: string): boolean {
        if (serverName.toLowerCase().includes(keyword)) {
            return true;
        }
        if (serverConfig.args && Array.isArray(serverConfig.args)) {
            const argsString = serverConfig.args.join(' ').toLowerCase();
            if (argsString.includes(`${keyword}-mcp`) || argsString.includes(`${keyword}_mcp`)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Inject securely stored API keys and credentials into matching MCP servers
     */
    private async injectApiKeysIfNeeded(
        mcpConfig: { mcpServers: { [key: string]: any } },
        secretEnv: Record<string, string>
    ): Promise<void> {
        try {
            await this.injectGeminiCredentials(mcpConfig, secretEnv);
            await this.injectGrokApiKey(mcpConfig, secretEnv);
        } catch (error) {
            debugError('McpConfigManager', 'API key injection failed', error);
        }
    }

    /**
     * Backfill critical host environment variables into an MCP server's env map.
     *
     * Claude CLI hands this map to child_process.spawn({ env }) verbatim, so
     * anything missing here is invisible to the subprocess. We only add keys
     * that exist in the host process.env AND are absent from the server env
     * (user/injected values always win — this is a backfill, not an override).
     *
     * Cross-platform: we include both Windows (APPDATA, SystemRoot, ...) and
     * POSIX (HOME, TMPDIR, ...) keys. Platform-irrelevant ones will simply be
     * absent from process.env on the other OS and get skipped.
     */
    private backfillHostEnv(env: { [key: string]: any }): void {
        // Keys that MCP subprocesses commonly need to start up & authenticate.
        // Kept intentionally narrow — we do NOT want to leak unrelated host vars.
        const criticalKeys = [
            // PATH variants (Windows is case-insensitive, Node exposes both)
            'PATH', 'Path',
            // Windows userland / system directories
            'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
            'SystemRoot', 'SystemDrive', 'windir', 'ProgramData',
            'ProgramFiles', 'ProgramFiles(x86)', 'PATHEXT', 'COMSPEC', 'ComSpec',
            'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'OS',
            // Temp dirs
            'TEMP', 'TMP', 'TMPDIR',
            // POSIX basics
            'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
            // Proxy / corp-network
            'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
            'http_proxy', 'https_proxy', 'no_proxy',
            'ALL_PROXY', 'all_proxy',
            // TLS / CA trust — needed behind MITM proxies
            'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED',
            'SSL_CERT_DIR', 'SSL_CERT_FILE', 'CURL_CA_BUNDLE', 'REQUESTS_CA_BUNDLE',
            // Node runtime tuning
            'NODE_OPTIONS', 'NODE_PATH',
        ];

        for (const key of criticalKeys) {
            const hostValue = process.env[key];
            if (hostValue !== undefined && !(key in env)) {
                env[key] = hostValue;
            }
        }
    }

    /**
     * Remove Gemini auth env vars that would conflict with the selected mode.
     * The Google GenAI SDK picks a code path based on which vars are present,
     * so leftover values from a previous mode (or stale user-pasted junk) must
     * be cleared before we inject the current mode's vars.
     */
    private stripConflictingGeminiEnv(env: { [key: string]: string }, authMode: string): void {
        const apiKeyVars = ['GEMINI_API_KEY', 'GOOGLE_API_KEY'];
        const vertexVars = ['GOOGLE_GENAI_USE_VERTEXAI', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CREDENTIALS_JSON', 'GOOGLE_APPLICATION_CREDENTIALS'];
        const toDelete = authMode === 'api-key' ? vertexVars : apiKeyVars;
        for (const key of toDelete) {
            if (key in env) {
                delete env[key];
            }
        }
    }

    /**
     * Inject Gemini API Key or Vertex AI credentials into Gemini servers.
     * Branches on the user-selected auth mode:
     *   - api-key     -> GEMINI_API_KEY
     *   - vertex-json -> GOOGLE_GENAI_USE_VERTEXAI + GOOGLE_CREDENTIALS_JSON + GOOGLE_CLOUD_PROJECT
     *   - adc         -> GOOGLE_GENAI_USE_VERTEXAI + GOOGLE_CLOUD_PROJECT (SDK resolves ADC)
     */
    private async injectGeminiCredentials(
        mcpConfig: { mcpServers: { [key: string]: any } },
        secretEnv: Record<string, string>
    ): Promise<void> {
        const shouldInject = await secretService.shouldInjectGeminiApiKey();
        if (!shouldInject) {
            debugLog('McpConfigManager', 'Gemini Integration not enabled or selected auth mode not configured, skipping');
            return;
        }

        const config = await secretService.getGeminiIntegrationConfig();
        const authMode = config.authMode;
        const apiKey = config.apiKey;
        const vertexCredentials = await secretService.getVertexCredentials();
        const project = config.vertexProject;

        let injectedCount = 0;
        for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
            if (!this.isServerForProvider(serverName, serverConfig, 'gemini')) {
                continue;
            }
            if (!serverConfig.env) {
                serverConfig.env = {};
            }

            // Strip any stale / user-pasted auth vars from the *other* path so
            // the Google GenAI SDK cannot see a conflicting hint. Without this,
            // a leftover GEMINI_API_KEY (even a junk value like ".") will make
            // the SDK prefer API-Key mode over Vertex ADC and crash at call time.
            this.stripConflictingGeminiEnv(serverConfig.env, authMode);

            switch (authMode) {
                case 'api-key':
                    if (apiKey) {
                        serverConfig.env.GEMINI_API_KEY = McpConfigManager.toSecretPlaceholder(secretEnv, 'GEMINI_API_KEY', apiKey);
                        debugLog('McpConfigManager', `Injected Gemini API Key into server '${serverName}'`);
                    }
                    break;
                case 'vertex-json':
                    if (vertexCredentials && project) {
                        serverConfig.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
                        serverConfig.env.GOOGLE_CREDENTIALS_JSON = McpConfigManager.toSecretPlaceholder(secretEnv, 'GOOGLE_CREDENTIALS_JSON', vertexCredentials);
                        serverConfig.env.GOOGLE_CLOUD_PROJECT = project;
                        debugLog('McpConfigManager', `Injected Vertex AI JSON credentials into server '${serverName}' (project: ${project})`);
                    }
                    break;
                case 'adc':
                    if (project) {
                        serverConfig.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
                        serverConfig.env.GOOGLE_CLOUD_PROJECT = project;
                        debugLog('McpConfigManager', `Injected Vertex AI ADC mode into server '${serverName}' (project: ${project}; SDK will resolve ADC)`);
                    }
                    break;
            }
            injectedCount++;
        }

        if (injectedCount > 0) {
            debugLog('McpConfigManager', `Gemini credentials injection complete (mode: ${authMode}), injected into ${injectedCount} server(s)`);
        }
    }

    /**
     * Inject Grok API Key into Grok servers
     */
    private async injectGrokApiKey(
        mcpConfig: { mcpServers: { [key: string]: any } },
        secretEnv: Record<string, string>
    ): Promise<void> {
        const shouldInject = await secretService.shouldInjectGrokApiKey();
        if (!shouldInject) {
            debugLog('McpConfigManager', 'Grok Integration not enabled or API Key not set, skipping');
            return;
        }

        const apiKey = await secretService.getGrokApiKey();
        if (!apiKey) {
            return;
        }

        let injectedCount = 0;
        for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
            if (this.isServerForProvider(serverName, serverConfig, 'grok')) {
                if (!serverConfig.env) {
                    serverConfig.env = {};
                }
                serverConfig.env.XAI_API_KEY = McpConfigManager.toSecretPlaceholder(secretEnv, 'XAI_API_KEY', apiKey);
                injectedCount++;
                debugLog('McpConfigManager', `Injected Grok API Key into server '${serverName}'`);
            }
        }

        if (injectedCount > 0) {
            debugLog('McpConfigManager', `Grok API Key injection complete, injected into ${injectedCount} server(s)`);
        }
    }

    /**
     * Cleans up old MCP configuration dirs.
     * Uses the same strict rules as the per-launch sweep. It used to delete every
     * `mcp-*` entry, which could remove another window's live config and also hit
     * unrelated CLI files such as ~/.claude/mcp-needs-auth-cache.json.
     */
    public async cleanupOldMcpConfigs(): Promise<void> {
        try {
            await this.sweepStaleMcpConfigDirs();
        } catch (error) {
            debugLog('cleanupOldMcpConfigs', 'Error cleaning up old MCP configs', error);
        }
    }
}