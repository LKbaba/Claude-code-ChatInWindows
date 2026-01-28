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

    /**
     * Get CLI command name
     * If custom API is enabled, use configured command name (e.g., xxxxclaude); otherwise use default 'claude'
     */
    private getCliCommand(): string {
        const apiConfig = this._configurationManager.getApiConfig();
        return apiConfig.useCustomAPI ? (apiConfig.cliCommand || 'claude') : 'claude';
    }

    /**
     * Get Bun global bin path
     * Bun installs global packages to ~/.bun/bin/
     */
    private getBunBinPath(): string {
        const homeDir = require('os').homedir();
        return path.join(homeDir, '.bun', 'bin');
    }

    /**
     * Find CLI executable path
     * Search priority: native installer path > npm > Bun (Windows) / Homebrew (Mac)
     */
    private findCliExecutable(cliCommand: string, npmPrefix: string | undefined): string | undefined {
        const searchPaths: string[] = [];
        const homeDir = require('os').homedir();

        // 1. Official installer path (highest priority)
        const localBin = path.join(homeDir, '.local', 'bin');
        searchPaths.push(localBin);

        // 2. Fallback path
        const claudeBin = path.join(homeDir, '.claude', 'bin');
        searchPaths.push(claudeBin);

        if (process.platform === 'darwin') {
            // Mac: Homebrew paths
            searchPaths.push('/opt/homebrew/bin');  // Apple Silicon
            searchPaths.push('/usr/local/bin');     // Intel Mac

            // Mac: nvm paths - dynamically find all installed node versions
            const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
            if (fs.existsSync(nvmDir)) {
                try {
                    const versions = fs.readdirSync(nvmDir);
                    for (const version of versions) {
                        searchPaths.push(path.join(nvmDir, version, 'bin'));
                    }
                } catch (e) {
                    // Ignore read errors
                }
            }
        }

        // 3. npm prefix (legacy method, for backward compatibility)
        if (npmPrefix) {
            searchPaths.push(npmPrefix);
        }

        // 4. Bun bin path (for Bun-installed packages, e.g., third-party mirror services)
        const bunBinPath = this.getBunBinPath();
        if (fs.existsSync(bunBinPath)) {
            searchPaths.push(bunBinPath);
        }

        // Search for the executable in all paths
        for (const searchPath of searchPaths) {
            if (process.platform === 'win32') {
                // Windows: check .cmd, .exe, and no extension
                const cmdPath = path.join(searchPath, `${cliCommand}.cmd`);
                const exePath = path.join(searchPath, `${cliCommand}.exe`);
                const noExtPath = path.join(searchPath, cliCommand);

                if (fs.existsSync(cmdPath)) {
                    return cmdPath;
                }
                if (fs.existsSync(exePath)) {
                    return exePath;
                }
                if (fs.existsSync(noExtPath)) {
                    return noExtPath;
                }
            } else {
                // Mac/Linux: only check no extension
                const noExtPath = path.join(searchPath, cliCommand);
                if (fs.existsSync(noExtPath)) {
                    return noExtPath;
                }
            }
        }

        return undefined;
    }

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
            const cliCommand = this.getCliCommand();

            // Add all possible CLI paths to PATH for terminal commands
            if (forTerminal) {
                let pathAdditions = '';

                // 1. Add native installer path (highest priority)
                const nativeLocalBin = path.join(homeDir, '.local', 'bin');
                if (fs.existsSync(nativeLocalBin)) {
                    pathAdditions = nativeLocalBin;
                }

                // 2. Add fallback native path
                const nativeClaudeBin = path.join(homeDir, '.claude', 'bin');
                if (fs.existsSync(nativeClaudeBin)) {
                    pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${nativeClaudeBin}` : nativeClaudeBin;
                }

                // 3. Add npm path (legacy method)
                if (npmPrefix) {
                    pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${npmPrefix}` : npmPrefix;
                }

                // 4. Add Bun bin path (for Bun-installed packages)
                const bunBinPath = this.getBunBinPath();
                if (fs.existsSync(bunBinPath)) {
                    pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${bunBinPath}` : bunBinPath;
                }

                if (pathAdditions) {
                    spawnOptions.env!.PATH = `${pathAdditions}${path.delimiter}${spawnOptions.env!.PATH}`;
                }
                spawnOptions.shell = true;
            } else {
                // For direct spawn, search for executable in multiple locations
                const executablePath = this.findCliExecutable(cliCommand, npmPrefix);
                if (executablePath) {
                    claudeExecutablePath = executablePath;
                } else {
                    // Log searched paths for debugging
                    const nativeLocalBin = path.join(homeDir, '.local', 'bin');
                    const nativeClaudeBin = path.join(homeDir, '.claude', 'bin');
                    const searchedPaths = [nativeLocalBin, nativeClaudeBin, npmPrefix, this.getBunBinPath()].filter(Boolean);
                    console.error(`${cliCommand} not found in paths: ${searchedPaths.join(', ')}`);
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
        } else if (platform === 'darwin') {
            // Mac: Find CLI path and set PATH to ensure node is available
            const npmPrefix = await this._npmPrefixPromise;
            const cliCommand = this.getCliCommand();

            // Mac always needs PATH setup (Claude CLI is a node script, requires node in PATH)
            let pathAdditions = '';

            // 1. Add official installer path (highest priority)
            const localBin = path.join(homeDir, '.local', 'bin');
            if (fs.existsSync(localBin)) {
                pathAdditions = localBin;
            }

            // 2. Add fallback path
            const claudeBin = path.join(homeDir, '.claude', 'bin');
            if (fs.existsSync(claudeBin)) {
                pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${claudeBin}` : claudeBin;
            }

            // 3. Add Homebrew paths
            const homebrewPaths = ['/opt/homebrew/bin', '/usr/local/bin'];
            for (const hbPath of homebrewPaths) {
                if (fs.existsSync(hbPath)) {
                    pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${hbPath}` : hbPath;
                }
            }

            // 4. Add nvm paths (critical: node scripts need node in PATH)
            const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
            if (fs.existsSync(nvmDir)) {
                try {
                    const versions = fs.readdirSync(nvmDir);
                    for (const version of versions) {
                        const nvmBinPath = path.join(nvmDir, version, 'bin');
                        if (fs.existsSync(nvmBinPath)) {
                            pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${nvmBinPath}` : nvmBinPath;
                        }
                    }
                } catch (e) {
                    // Ignore read errors
                }
            }

            // 5. Add npm path
            if (npmPrefix) {
                pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${npmPrefix}` : npmPrefix;
            }

            if (pathAdditions) {
                spawnOptions.env!.PATH = `${pathAdditions}${path.delimiter}${spawnOptions.env!.PATH}`;
            }

            if (forTerminal) {
                spawnOptions.shell = true;
            } else {
                // For direct spawn, search for executable
                const executablePath = this.findCliExecutable(cliCommand, npmPrefix);
                if (executablePath) {
                    claudeExecutablePath = executablePath;
                } else {
                    // Fallback: if not found, use default 'claude' (relies on PATH)
                    console.warn(`Claude CLI not found in standard paths, falling back to 'claude'`);
                }
            }
            // Mac: Don't use shell in non-terminal mode to avoid special characters being parsed by shell
            // This is important for --append-system-prompt and other arguments containing newlines
            if (!forTerminal) {
                spawnOptions.shell = false;
            }
        }

        // Windows must use shell (Git Bash) to execute .cmd files
        // Mac non-terminal mode doesn't use shell, can directly execute binary files
        if (platform === 'win32' && !spawnOptions.shell) {
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

    getEnvironmentInfo(): string {
        const osRelease = require('os').release();
        const shell = process.env.SHELL || 'default';

        if (process.platform === 'win32') {
            return `[SYSTEM INFO: You are running on Windows ${osRelease}. Shell: Git Bash. Use Windows-compatible commands and paths. File system is case-insensitive.]\n\n`;
        } else if (process.platform === 'darwin') {
            return `[SYSTEM INFO: You are running on macOS ${osRelease}. Shell: ${shell}. Use Unix-style paths and commands.]\n\n`;
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

        // Use configured CLI command name (supports mirror service custom commands like xxxxclaude)
        const cliCommand = this.getCliCommand();
        return `${cliCommand} ${fullCommand}`;
    }

    getLoginCommand(): string {
        // Use configured CLI command name (supports mirror service custom commands like xxxxclaude)
        return this.getCliCommand();
    }

    providePlatformSpecificError(error: any): string {
        let errorMessage = error.message;

        if (process.platform === 'win32') {
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                // Updated error message with recommended installation methods
                errorMessage = `Failed to start Claude. Please ensure:\n` +
                    `1. Claude Code is installed:\n` +
                    `   • Recommended: irm https://claude.ai/install.ps1 | iex\n` +
                    `   • Or WinGet: winget install Anthropic.ClaudeCode\n` +
                    `   • Or npm (deprecated): npm install -g @anthropic-ai/claude-code\n` +
                    `2. Git Bash is installed and configured in settings\n` +
                    `3. Run 'claude' in terminal to complete login\n\n` +
                    `Original error: ${error.message}`;
            } else if (error.message.includes('npm')) {
                // npm error is optional now, not required
                errorMessage = `npm configuration error. This can be ignored if using native installer.\n` +
                    `If you need npm installation, ensure Node.js and npm are properly installed.\n\n` +
                    `Original error: ${error.message}`;
            } else if (error.message.includes('Git Bash') || error.message.includes('bash.exe')) {
                errorMessage = `Git Bash not found. Please install Git for Windows and configure bash.exe path in settings.\n\n` +
                    `Original error: ${error.message}`;
            }
        }

        if (process.platform === 'darwin') {
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                errorMessage = `Failed to start Claude. Please ensure Claude Code is installed:\n` +
                    `  • Recommended: curl -fsSL https://claude.ai/install.sh | bash\n` +
                    `  • Or Homebrew: brew install --cask claude-code\n\n` +
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