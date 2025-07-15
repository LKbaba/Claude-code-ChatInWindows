import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ApiConfigManager } from './config/ApiConfigManager';

export interface ExecutionEnvironment {
    spawnOptions: cp.SpawnOptions;
    claudeExecutablePath: string | undefined;
}

export class WindowsCompatibility {
    constructor(
        private readonly _npmPrefixPromise: Promise<string | undefined>,
        private readonly _configurationManager: ApiConfigManager
    ) {}

    async getExecutionEnvironment(forTerminal = false): Promise<ExecutionEnvironment> {
        const spawnOptions: cp.SpawnOptions = {
            env: { ...process.env }
        };
        let claudeExecutablePath: string | undefined = 'claude'; // Default

        const platform = process.platform;
        
        // Claude Code v1.0.48+ uses ~/.claude instead of /tmp for shell snapshots
        // Set CLAUDE_HOME to ensure Claude uses the correct directory
        const homeDir = require('os').homedir();
        let claudeHome = path.join(homeDir, '.claude');
        
        // Convert to Unix-style path for Git Bash on Windows
        if (platform === 'win32') {
            claudeHome = claudeHome.replace(/\\/g, '/');
        }
        
        spawnOptions.env!.CLAUDE_HOME = claudeHome;
        
        // On Windows, also set proper temp directory to avoid path issues
        if (platform === 'win32') {
            // Ensure ~/.claude directory exists
            if (!fs.existsSync(claudeHome)) {
                fs.mkdirSync(claudeHome, { recursive: true });
            }
            
            // Set temp directory to /tmp for Git Bash compatibility
            // This avoids Windows path format issues when Claude CLI runs in Git Bash
            spawnOptions.env!.TEMP = '/tmp';
            spawnOptions.env!.TMP = '/tmp';
            spawnOptions.env!.TMPDIR = '/tmp';
            
            const npmPrefix = await this._npmPrefixPromise;
            if (!npmPrefix) {
                // This should have been caught by the EnvironmentChecker, but we log it just in case.
                console.error('Could not determine npm prefix during execution.');
                return { spawnOptions, claudeExecutablePath: undefined };
            }

            // For terminal commands, we just need the PATH, not the absolute executable
            if (forTerminal) {
                spawnOptions.env!.PATH = `${npmPrefix}${path.delimiter}${spawnOptions.env!.PATH}`;
                spawnOptions.shell = true;
            } else {
                // For direct spawn, use the absolute path to avoid PATH issues
                const potentialPath = path.join(npmPrefix, 'claude.cmd');
                if (fs.existsSync(potentialPath)) {
                    claudeExecutablePath = potentialPath;
                } else {
                    console.error(`claude.cmd not found at expected path: ${potentialPath}`);
                    return { spawnOptions, claudeExecutablePath: undefined };
                }
            }

            // Both scenarios need the Posix shell
            const windowsConfig = this._configurationManager.getWindowsConfig();
            const gitBashPath = windowsConfig.gitBashPath;
            if (gitBashPath && fs.existsSync(gitBashPath)) {
                spawnOptions.shell = true;
                spawnOptions.env!.SHELL = gitBashPath;
            } else if (gitBashPath) {
                // Only log warning if path is configured but not found
                console.warn(`Git Bash path configured but not found at: ${gitBashPath}`);
            }
            // If no Git Bash path configured, Claude will use the default shell
        }

        if (!spawnOptions.shell) {
            spawnOptions.shell = true;
        }

        return { spawnOptions, claudeExecutablePath };
    }

    fixWindowsPath(cwd: string, spawnOptions: cp.SpawnOptions): string {
        // Fix Windows path issue when using Git Bash
        if (process.platform === 'win32' && spawnOptions.shell) {
            // Convert Windows paths to Unix-style for Git Bash
            return cwd.replace(/\\/g, '/');
        }
        return cwd;
    }

    getWindowsEnvironmentInfo(): string {
        if (process.platform === 'win32') {
            const osRelease = require('os').release();
            const shell = process.env.SHELL || 'Git Bash';
            return `[SYSTEM INFO: You are running on Windows ${osRelease}. Shell: ${shell}. Use Windows-compatible commands and paths. File system is case-insensitive.]\n\n`;
        }
        return '';
    }

    async createTerminal(
        name: string,
        forModel = false
    ): Promise<vscode.Terminal> {
        const { spawnOptions } = await this.getExecutionEnvironment(true);
        const terminalOptions: vscode.TerminalOptions = {
            name: name,
            env: spawnOptions.env
        };
        
        // On Windows, use Git Bash for slash commands to avoid PowerShell issues
        if (process.platform === 'win32') {
            const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
            const gitBashPath = config.get<string>('windows.gitBashPath');
            
            // Check if Git Bash path is configured and exists
            if (gitBashPath && fs.existsSync(gitBashPath)) {
                terminalOptions.shellPath = gitBashPath;
                // Add shell args to ensure proper bash behavior
                terminalOptions.shellArgs = ['--login', '-i'];
            }
        }
        
        return vscode.window.createTerminal(terminalOptions);
    }

    getTerminalCommand(
        command: string,
        sessionId?: string
    ): string {
        let fullCommand = command;
        if (sessionId) {
            fullCommand = `${command} --session ${sessionId}`;
        }

        // The environment is already configured by spawnOptions
        return `claude ${fullCommand}`;
    }

    getLoginCommand(): string {
        return 'claude';
    }

    providePlatformSpecificError(error: any): string {
        let errorMessage = error.message;
        
        if (process.platform === 'win32') {
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                errorMessage = `Failed to start Claude. Please ensure:\n` +
                    `1. Claude CLI is installed globally: npm install -g @anthropic-ai/claude-cli\n` +
                    `2. Git Bash is installed and configured in settings\n` +
                    `3. You've logged in to Claude by running 'claude' in a terminal\n\n` +
                    `Original error: ${error.message}`;
            } else if (error.message.includes('npm')) {
                errorMessage = `NPM configuration error. Please ensure Node.js and npm are properly installed.\n\n` +
                    `Original error: ${error.message}`;
            } else if (error.message.includes('Git Bash') || error.message.includes('bash.exe')) {
                errorMessage = `Git Bash not found. Please install Git for Windows and ensure the path to bash.exe is configured in settings.\n\n` +
                    `Original error: ${error.message}`;
            }
        }
        
        return errorMessage;
    }

    async killProcess(pid: number): Promise<void>;
    async killProcess(processToKill: cp.ChildProcess): Promise<void>;
    async killProcess(processOrPid: cp.ChildProcess | number): Promise<void> {
        const pid = typeof processOrPid === 'number' ? processOrPid : processOrPid.pid;
        const processToKill = typeof processOrPid === 'number' ? null : processOrPid;
        
        // Platform-specific termination
        if (process.platform === 'win32' && pid) {
            // On Windows, use taskkill to ensure all child processes are terminated
            try {
                // /T flag terminates child processes, /F forces termination
                cp.exec(`taskkill /pid ${pid} /t /f`, (error) => {
                    if (error) {
                        console.error('Failed to kill process with taskkill:', error);
                    }
                });
            } catch (error) {
                console.error('Error executing taskkill:', error);
                // Fallback to Node.js kill
                if (processToKill) {
                    processToKill.kill();
                }
            }
        } else {
            // On Unix-like systems, use standard signals
            if (processToKill) {
                processToKill.kill('SIGTERM');
                
                // Force kill after 2 seconds if still running
                setTimeout(() => {
                    if (processToKill && !processToKill.killed) {
                        // DEBUG: console.log('Force killing Claude process...');
                        processToKill.kill('SIGKILL');
                    }
                }, 2000);
            } else if (pid) {
                // If we only have a PID, use process.kill
                try {
                    process.kill(pid, 'SIGTERM');
                    setTimeout(() => {
                        try {
                            process.kill(pid, 'SIGKILL');
                        } catch (error) {
                            // Process may have already terminated
                        }
                    }, 2000);
                } catch (error) {
                    console.error('Error killing process:', error);
                }
            }
        }
    }
}