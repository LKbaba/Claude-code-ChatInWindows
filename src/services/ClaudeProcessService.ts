/**
 * Claude Process Service
 * Manages Claude CLI process lifecycle including spawning, monitoring, and termination
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WindowsCompatibility, ExecutionEnvironment } from '../managers/WindowsCompatibility';
import { ConfigurationManagerFacade } from '../managers/config/ConfigurationManagerFacade';
import { ConversationManager } from '../managers/ConversationManager';
import { VALID_MODELS, ValidModel } from '../utils/constants';
import { getMcpSystemPrompts } from '../utils/mcpPrompts';
import { debugLog, debugError } from './DebugLogger';

export interface ProcessOptions {
    message: string;
    cwd: string;
    sessionId?: string;
    model: string;
    windowsEnvironmentInfo?: string;
    customInstructions?: string;
    resumeFrom?: string;
    imagesInMessage?: string[];
    // Note: planMode and thinkingMode are handled through message prefixes
    // thinkingIntensity is also no longer needed here
}

export interface ProcessCallbacks {
    onData: (data: any) => void;
    onError: (error: string) => void;
    onClose: (code: number | null) => void;
}

export class ClaudeProcessService {
    private _currentProcess: cp.ChildProcess | undefined;
    private _npmPrefixPromise: Promise<string | undefined>;

    constructor(
        private _windowsCompatibility: WindowsCompatibility,
        private _configurationManager: ConfigurationManagerFacade,
        private _conversationManager: ConversationManager,
        private _npmPrefixResolver: () => Promise<string | undefined>
    ) {
        this._npmPrefixPromise = this._npmPrefixResolver();
    }

    /**
     * Check if a process is currently running
     */
    public isProcessRunning(): boolean {
        return this._currentProcess !== undefined;
    }

    /**
     * Get the current process
     */
    public getCurrentProcess(): cp.ChildProcess | undefined {
        return this._currentProcess;
    }

    /**
     * Start a new Claude process
     */
    public async startProcess(options: ProcessOptions, callbacks: ProcessCallbacks): Promise<void> {
        if (this._currentProcess) {
            throw new Error('A Claude process is already running');
        }

        const { execEnvironment, args } = await this._prepareProcessExecution(options);
        
        if (!execEnvironment.claudeExecutablePath) {
            throw new Error('Claude executable path could not be determined');
        }

        // Fix Windows path issue when using Git Bash
        const fixedCwd = this._windowsCompatibility.fixWindowsPath(options.cwd, execEnvironment.spawnOptions);
        
        // Set the working directory in spawn options
        execEnvironment.spawnOptions.cwd = fixedCwd;
        
        // Spawn the process
        debugLog('ClaudeProcessService', 'Spawning Claude', {
            executable: execEnvironment.claudeExecutablePath,
            args: args,
            cwd: fixedCwd,
            shell: execEnvironment.spawnOptions.shell,
            argsLength: args.length,
            argsDetails: args.map((arg, i) => `[${i}]: "${arg}"`)
        });
        this._currentProcess = cp.spawn(execEnvironment.claudeExecutablePath, args, { ...execEnvironment.spawnOptions, cwd: fixedCwd });

        // Send JSON-formatted user message to stdin
        if (this._currentProcess.stdin) {
            // Build user message in stream-json format
            const userMessage = this._buildUserMessage(options.message, options.imagesInMessage);
            const jsonMessage = JSON.stringify(userMessage);
            debugLog('ClaudeProcessService', `Sending JSON message to stdin: ${jsonMessage.substring(0, 200)}...`);
            this._currentProcess.stdin.write(jsonMessage + '\n');
            this._currentProcess.stdin.end();
        }
        
        // Set up event handlers
        this._setupProcessHandlers(this._currentProcess, callbacks);
    }

    /**
     * Stop the current Claude process
     */
    public async stopProcess(): Promise<void> {
        if (!this._currentProcess) {
            return;
        }

        const processToKill = this._currentProcess;
        const pid = processToKill.pid;
        
        // Clear the reference immediately to prevent race conditions
        this._currentProcess = undefined;

        if (pid) {
            try {
                await this._windowsCompatibility.killProcess(pid);
            } catch (error) {
                debugError('ClaudeProcessService', 'Error killing Claude process', error);
                // Try to kill directly as fallback
                try {
                    processToKill.kill('SIGTERM');
                } catch (killError) {
                    debugError('ClaudeProcessService', 'Fallback kill failed', killError);
                }
            }
        }
    }

    /**
     * Prepare execution environment and arguments
     */
    private async _prepareProcessExecution(options: ProcessOptions): Promise<{
        execEnvironment: ExecutionEnvironment;
        args: string[];
    }> {
        // Get execution environment
        const execEnvironment = await this._windowsCompatibility.getExecutionEnvironment();

        // Build MCP configuration if enabled
        const { configPath: mcpConfigPath } = await this._configurationManager.buildMcpConfig();

        // Build command arguments
        const args = await this._buildCommandArgs(options, mcpConfigPath);

        // Merge MCP environment variables if needed
        const mcpStatus = this._configurationManager.getMcpStatus();
        if (mcpStatus.servers) {
            mcpStatus.servers.forEach((server: any) => {
                if (server.env && typeof server.env === 'object') {
                    execEnvironment.spawnOptions.env = { 
                        ...execEnvironment.spawnOptions.env, 
                        ...server.env 
                    };
                }
            });
        }

        // Add API configuration to environment variables if custom API is enabled
        // Note: Only pass env vars for official 'claude' command
        // Third-party CLIs (e.g., 'xxxxclaude') have their own auth mechanism and don't use these env vars
        const apiConfig = this._configurationManager.getApiConfig();
        const cliCommand = apiConfig.cliCommand || 'claude';
        const isOfficialClaude = cliCommand === 'claude';

        if (apiConfig.useCustomAPI && apiConfig.key && apiConfig.baseUrl && isOfficialClaude) {
            // Only pass API env vars for official claude CLI
            execEnvironment.spawnOptions.env = {
                ...execEnvironment.spawnOptions.env,
                ANTHROPIC_API_KEY: apiConfig.key,
                ANTHROPIC_BASE_URL: apiConfig.baseUrl
            };
            debugLog('ClaudeProcessService', 'Using custom API with official claude', {
                baseUrl: apiConfig.baseUrl,
                hasKey: !!apiConfig.key
            });
        } else if (apiConfig.useCustomAPI && !isOfficialClaude) {
            // Third-party CLI (e.g., xxxxclaude) - don't pass API env vars
            // These CLIs have their own authentication mechanism
            debugLog('ClaudeProcessService', 'Using third-party CLI', {
                cliCommand: cliCommand,
                note: 'API env vars not passed - CLI has its own auth'
            });
        }

        return { execEnvironment, args };
    }

    /**
     * Build command arguments for Claude CLI
     */
    private async _buildCommandArgs(options: ProcessOptions, mcpConfigPath: string | null): Promise<string[]> {
        const args: string[] = [];

        // Add base arguments
        // --input-format=stream-json: Enable JSON input format, consistent with output-format
        // --dangerously-skip-permissions: Auto-approve all permissions
        args.push(
            '-p',
            '--output-format', 'stream-json',
            '--input-format', 'stream-json',
            '--verbose',
            '--dangerously-skip-permissions'
        );

        // Add MCP config if available
        if (mcpConfigPath) {
            args.push('--mcp-config', mcpConfigPath);
        }

        // Add session ID or resume
        if (options.resumeFrom) {
            args.push('--resume', options.resumeFrom);
        } else if (options.sessionId) {
            args.push('--resume', options.sessionId);
        }

        // Add model if not default
        if (options.model && options.model !== 'default' && VALID_MODELS.includes(options.model as ValidModel)) {
            args.push('--model', options.model);
        }

        // Note: Plan mode and thinking mode are now handled through message prefixes,
        // not through CLI arguments. The actual prompts are added in extension.ts

        // Add custom instructions
        if (options.customInstructions) {
            args.push('--custom-instructions');
            args.push(options.customInstructions);
        }

        // Add MCP system prompts if MCP is enabled
        const mcpStatus = this._configurationManager.getMcpStatus();
        debugLog('ClaudeProcessService', 'MCP Status', {
            status: mcpStatus.status,
            serverCount: mcpStatus.servers?.length || 0,
            serverNames: mcpStatus.servers?.map((s: any) => s.name) || []
        });

        if (mcpStatus.status === 'configured' && mcpStatus.servers && mcpStatus.servers.length > 0) {
            const mcpPrompts = getMcpSystemPrompts(mcpStatus.servers);
            if (mcpPrompts && mcpPrompts.trim()) {
                // On Windows, we need to properly escape the multi-line prompt
                // The prompt should be passed as a single quoted argument
                debugLog('ClaudeProcessService', 'MCP prompts content', {
                    length: mcpPrompts.length,
                    hasNewlines: mcpPrompts.includes('\n'),
                    preview: mcpPrompts.substring(0, 100) + '...'
                });
                args.push('--append-system-prompt');
                args.push(mcpPrompts.trim());
            }
        }

        // Note: The message is not added to args anymore - it will be sent via stdin

        return args;
    }

    /**
     * Build user message JSON
     * Convert user input to Claude CLI stream-json format
     * @param text Text content
     * @param images Image array (Base64 encoded, optional)
     */
    private _buildUserMessage(text: string, images?: string[]): object {
        // Build message content array, starting with text
        const content: any[] = [{ type: 'text', text }];

        // Add images if provided
        if (images && images.length > 0) {
            images.forEach(imageData => {
                content.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: 'image/png',  // Default PNG, can be extended for auto-detection
                        data: imageData
                    }
                });
            });
        }

        // Return user message object in stream-json format
        return {
            type: 'user',
            message: {
                role: 'user',
                content
            }
        };
    }

    /**
     * Set up process event handlers
     */
    private _setupProcessHandlers(process: cp.ChildProcess, callbacks: ProcessCallbacks): void {
        let stdoutBuffer = '';
        let stderrBuffer = '';

        // Handle stdout data
        process.stdout?.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stdoutBuffer += chunk;
            
            // Process complete JSON objects from the buffer
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const jsonData = JSON.parse(line);
                        callbacks.onData(jsonData);
                    } catch (error) {
                        // Not JSON, might be plain text output
                        callbacks.onData({ type: 'text', data: line });
                    }
                }
            }
        });

        // Handle stderr data
        process.stderr?.on('data', (data: Buffer) => {
            stderrBuffer += data.toString();
            const lines = stderrBuffer.split('\n');
            stderrBuffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.trim()) {
                    callbacks.onError(line);
                }
            }
        });

        // Handle process close
        process.on('close', (code: number | null) => {
            // Process any remaining buffered data
            if (stdoutBuffer.trim()) {
                try {
                    const jsonData = JSON.parse(stdoutBuffer);
                    callbacks.onData(jsonData);
                } catch (error) {
                    callbacks.onData({ type: 'text', data: stdoutBuffer });
                }
            }
            
            if (stderrBuffer.trim()) {
                callbacks.onError(stderrBuffer);
            }

            // Clear process reference
            if (this._currentProcess === process) {
                this._currentProcess = undefined;
            }

            callbacks.onClose(code);
        });

        // Handle process error
        process.on('error', (error: Error) => {
            debugError('ClaudeProcessService', 'Claude process error', error);
            callbacks.onError(`Process error: ${error.message}`);

            // Clear process reference
            if (this._currentProcess === process) {
                this._currentProcess = undefined;
            }
        });
    }

    /**
     * Clean up resources (called when VS Code closes or extension deactivates)
     * Ensure Claude CLI process is properly terminated to prevent orphan processes
     */
    public dispose(): void {
        if (this._currentProcess) {
            debugLog('ClaudeProcessService', 'Disposing: killing Claude process on extension deactivation');
            try {
                this._currentProcess.kill();
            } catch (error) {
                debugError('ClaudeProcessService', 'Error killing process during dispose', error);
            }
            this._currentProcess = undefined;
        }
    }


    /**
     * Clean up Claude CLI temporary files (tmpclaude-*-cwd)
     * These files are created by Claude CLI during execution and may be left behind
     * Uses vscode.workspace.findFiles for fast recursive search (powered by Ripgrep)
     * @param workspacePath The workspace directory to clean (used for single-dir cleanup)
     */
    public static cleanupTempFiles(workspacePath: string): void {
        // First, clean the root directory synchronously (fast path)
        ClaudeProcessService.cleanupTempFilesInDir(workspacePath);

        // Then, trigger async recursive cleanup for subdirectories
        ClaudeProcessService.cleanupTempFilesRecursive();
    }

    /**
     * Clean temp files in a specific directory (synchronous, for known paths)
     */
    private static cleanupTempFilesInDir(dirPath: string): void {
        try {
            const files = fs.readdirSync(dirPath);
            const tempFileRegex = /^tmpclaude-[a-f0-9]+-cwd$/;
            const tempFiles = files.filter(f => tempFileRegex.test(f));

            if (tempFiles.length > 0) {
                debugLog('ClaudeProcessService', `Cleaning up ${tempFiles.length} Claude temp file(s) in ${dirPath}`, {
                    files: tempFiles
                });

                for (const file of tempFiles) {
                    try {
                        const filePath = path.join(dirPath, file);
                        fs.unlinkSync(filePath);
                        debugLog('ClaudeProcessService', `Deleted temp file: ${file}`);
                    } catch (err) {
                        debugError('ClaudeProcessService', `Failed to delete temp file: ${file}`, err);
                    }
                }
            }
        } catch (error) {
            debugError('ClaudeProcessService', `Error during temp file cleanup in ${dirPath}`, error);
        }
    }

    /**
     * Recursively clean temp files using VS Code's findFiles API (async, fast)
     * Uses Ripgrep under the hood, automatically excludes node_modules
     */
    public static async cleanupTempFilesRecursive(): Promise<void> {
        try {
            // Use VS Code's findFiles API - it's fast (Ripgrep) and respects .gitignore
            const pattern = '**/tmpclaude-*-cwd';
            const exclude = '**/node_modules/**';

            const files = await vscode.workspace.findFiles(pattern, exclude);

            if (files.length === 0) {
                return;
            }

            debugLog('ClaudeProcessService', `Found ${files.length} Claude temp file(s) recursively`, {
                files: files.map(f => f.fsPath)
            });

            const tempFileRegex = /^tmpclaude-[a-f0-9]+-cwd$/;

            // Delete files concurrently
            await Promise.all(files.map(async (uri) => {
                try {
                    // Double-check filename with regex for safety
                    const fileName = path.basename(uri.fsPath);
                    if (tempFileRegex.test(fileName)) {
                        await vscode.workspace.fs.delete(uri, { useTrash: false });
                        debugLog('ClaudeProcessService', `Deleted temp file (recursive): ${uri.fsPath}`);
                    }
                } catch (err) {
                    debugError('ClaudeProcessService', `Failed to delete temp file: ${uri.fsPath}`, err);
                }
            }));

            debugLog('ClaudeProcessService', `Cleaned up ${files.length} temp file(s) recursively`);
        } catch (error) {
            debugError('ClaudeProcessService', 'Error during recursive temp file cleanup', error);
        }
    }
}
