/**
 * Claude Process Service
 * Manages Claude CLI process lifecycle including spawning, monitoring, and termination
 */

import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { WindowsCompatibility, ExecutionEnvironment } from '../managers/WindowsCompatibility';
import { ConfigurationManagerFacade } from '../managers/config/ConfigurationManagerFacade';
import { ConversationManager } from '../managers/ConversationManager';
import { VALID_MODELS, ValidModel } from '../utils/constants';
import { getMcpSystemPrompts } from '../utils/mcpPrompts';

export interface ProcessOptions {
    message: string;
    cwd: string;
    sessionId?: string;
    model: string;
    platformEnvironmentInfo?: string;
    customInstructions?: string;
    resumeFrom?: string;
    imagesInMessage?: string[];
    // Note: planMode and thinkingMode are handled through message prefixes
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

        // Fix path for cross-platform compatibility
        const fixedCwd = this._windowsCompatibility.fixPath(options.cwd, execEnvironment.spawnOptions);
        
        // Set the working directory in spawn options
        execEnvironment.spawnOptions.cwd = fixedCwd;
        
        // Spawn the process
        console.log('[ClaudeProcessService] Spawning Claude with:', {
            executable: execEnvironment.claudeExecutablePath,
            args: args,
            cwd: fixedCwd,
            shell: execEnvironment.spawnOptions.shell,
            argsLength: args.length,
            argsDetails: args.map((arg, i) => `[${i}]: "${arg}"`)
        });
        this._currentProcess = cp.spawn(execEnvironment.claudeExecutablePath, args, { ...execEnvironment.spawnOptions, cwd: fixedCwd });
        
        // Send the message to stdin
        if (this._currentProcess.stdin) {
            console.log('[ClaudeProcessService] Sending message to stdin:', options.message);
            this._currentProcess.stdin.write(options.message + '\n');
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
                console.error('Error killing Claude process:', error);
                // Try to kill directly as fallback
                try {
                    processToKill.kill('SIGTERM');
                } catch (killError) {
                    console.error('Fallback kill failed:', killError);
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
        const apiConfig = this._configurationManager.getApiConfig();
        if (apiConfig.useCustomAPI && apiConfig.key && apiConfig.baseUrl) {
            execEnvironment.spawnOptions.env = {
                ...execEnvironment.spawnOptions.env,
                ANTHROPIC_API_KEY: apiConfig.key,
                ANTHROPIC_BASE_URL: apiConfig.baseUrl
            };
            console.log('[ClaudeProcessService] Using custom API:', {
                baseUrl: apiConfig.baseUrl,
                hasKey: !!apiConfig.key
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
        args.push('-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions');

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
        // 注意：当使用 Bedrock 时，不传递 --model 参数，让 Claude CLI 自动处理
        const isUsingBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === '1';
        if (!isUsingBedrock && options.model && options.model !== 'default' && VALID_MODELS.includes(options.model as ValidModel)) {
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
        console.log('[ClaudeProcessService] MCP Status:', {
            status: mcpStatus.status,
            serverCount: mcpStatus.servers?.length || 0,
            serverNames: mcpStatus.servers?.map((s: any) => s.name) || []
        });
        
        if (mcpStatus.status === 'configured' && mcpStatus.servers && mcpStatus.servers.length > 0) {
            const mcpPrompts = getMcpSystemPrompts(mcpStatus.servers);
            if (mcpPrompts && mcpPrompts.trim()) {
                // On Windows, we need to properly escape the multi-line prompt
                // The prompt should be passed as a single quoted argument
                console.log('[ClaudeProcessService] MCP prompts content:', {
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
     * Set up process event handlers
     */
    private _setupProcessHandlers(process: cp.ChildProcess, callbacks: ProcessCallbacks): void {
        let stdoutBuffer = '';
        let stderrBuffer = '';

        // Handle stdout data
        process.stdout?.on('data', (data: Buffer) => {
            const chunk = data.toString();
            console.log('[ClaudeProcessService] Raw stdout chunk:', chunk);
            stdoutBuffer += chunk;
            
            // Process complete JSON objects from the buffer
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            console.log('[ClaudeProcessService] Processing', lines.length, 'lines');
            for (const line of lines) {
                if (line.trim()) {
                    console.log('[ClaudeProcessService] Processing line:', line.substring(0, 200));
                    try {
                        const jsonData = JSON.parse(line);
                        console.log('[ClaudeProcessService] Parsed JSON type:', jsonData.type);
                        callbacks.onData(jsonData);
                    } catch (error) {
                        // Not JSON, might be plain text output
                        console.log('[ClaudeProcessService] Non-JSON line, sending as text');
                        callbacks.onData({ type: 'text', data: line });
                    }
                }
            }
        });

        // Handle stderr data
        process.stderr?.on('data', (data: Buffer) => {
            const chunk = data.toString();
            console.log('[ClaudeProcessService] Raw stderr chunk:', chunk);
            stderrBuffer += chunk;
            const lines = stderrBuffer.split('\n');
            stderrBuffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.trim()) {
                    console.log('[ClaudeProcessService] stderr line:', line);
                    callbacks.onError(line);
                }
            }
        });

        // Handle process close
        process.on('close', (code: number | null) => {
            console.log('[ClaudeProcessService] Process closed with code:', code);
            
            // Process any remaining buffered data
            if (stdoutBuffer.trim()) {
                console.log('[ClaudeProcessService] Processing remaining stdout buffer:', stdoutBuffer.substring(0, 200));
                try {
                    const jsonData = JSON.parse(stdoutBuffer);
                    callbacks.onData(jsonData);
                } catch (error) {
                    callbacks.onData({ type: 'text', data: stdoutBuffer });
                }
            }
            
            if (stderrBuffer.trim()) {
                console.log('[ClaudeProcessService] Processing remaining stderr buffer:', stderrBuffer);
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
            console.error('Claude process error:', error);
            callbacks.onError(`Process error: ${error.message}`);
            
            // Clear process reference
            if (this._currentProcess === process) {
                this._currentProcess = undefined;
            }
        });
    }
}