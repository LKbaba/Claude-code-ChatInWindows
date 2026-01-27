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
     * 查找 CLI 可执行文件路径
     * 按优先级在多个位置搜索：原生安装路径 > npm > Bun (Windows) / Homebrew (Mac)
     */
    private findCliExecutable(cliCommand: string, npmPrefix: string | undefined): string | undefined {
        const searchPaths: string[] = [];
        const homeDir = require('os').homedir();

        // 1. 官方安装器路径 (最高优先级)
        const localBin = path.join(homeDir, '.local', 'bin');
        searchPaths.push(localBin);

        // 2. 备用路径
        const claudeBin = path.join(homeDir, '.claude', 'bin');
        searchPaths.push(claudeBin);

        if (process.platform === 'darwin') {
            // Mac: Homebrew 路径
            searchPaths.push('/opt/homebrew/bin');  // Apple Silicon
            searchPaths.push('/usr/local/bin');     // Intel Mac

            // Mac: nvm 路径 - 动态查找所有安装的 node 版本
            const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
            if (fs.existsSync(nvmDir)) {
                try {
                    const versions = fs.readdirSync(nvmDir);
                    for (const version of versions) {
                        searchPaths.push(path.join(nvmDir, version, 'bin'));
                    }
                } catch (e) {
                    // 忽略读取错误
                }
            }
        }

        // 3. npm prefix (传统方式，向后兼容)
        if (npmPrefix) {
            searchPaths.push(npmPrefix);
        }

        // 4. Bun bin path (用于 Bun 安装的包，如第三方镜像服务)
        const bunBinPath = this.getBunBinPath();
        if (fs.existsSync(bunBinPath)) {
            searchPaths.push(bunBinPath);
        }

        // Search for the executable in all paths
        for (const searchPath of searchPaths) {
            if (process.platform === 'win32') {
                // Windows: 检查 .cmd, .exe, 无扩展名
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
                // Mac/Linux: 只检查无扩展名
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

            // 为终端命令添加所有可能的 CLI 路径到 PATH
            if (forTerminal) {
                let pathAdditions = '';

                // 1. 添加原生安装路径 (最高优先级)
                const nativeLocalBin = path.join(homeDir, '.local', 'bin');
                if (fs.existsSync(nativeLocalBin)) {
                    pathAdditions = nativeLocalBin;
                }

                // 2. 添加备用原生路径
                const nativeClaudeBin = path.join(homeDir, '.claude', 'bin');
                if (fs.existsSync(nativeClaudeBin)) {
                    pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${nativeClaudeBin}` : nativeClaudeBin;
                }

                // 3. 添加 npm 路径 (传统方式)
                if (npmPrefix) {
                    pathAdditions = pathAdditions ? `${pathAdditions}${path.delimiter}${npmPrefix}` : npmPrefix;
                }

                // 4. 添加 Bun bin 路径 (用于 Bun 安装的包)
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
                    // 记录搜索过的路径，便于调试
                    const nativeLocalBin = path.join(homeDir, '.local', 'bin');
                    const nativeClaudeBin = path.join(homeDir, '.claude', 'bin');
                    const searchedPaths = [nativeLocalBin, nativeClaudeBin, npmPrefix, this.getBunBinPath()].filter(Boolean);
                    console.error(`${cliCommand} 未在以下路径找到: ${searchedPaths.join(', ')}`);
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
            // Mac: 查找 CLI 路径，设置 PATH 确保 node 可用
            const npmPrefix = await this._npmPrefixPromise;
            const cliCommand = this.getCliCommand();

            // Mac 上始终需要设置 PATH（因为 Claude CLI 是 node 脚本，需要 node 在 PATH 中）
            let pathAdditions = '';

            // 1. 添加官方安装路径 (最高优先级)
            const localBin = path.join(homeDir, '.local', 'bin');
            if (fs.existsSync(localBin)) {
                pathAdditions = localBin;
            }

            // 2. 添加备用路径
            const claudeBin = path.join(homeDir, '.claude', 'bin');
            if (fs.existsSync(claudeBin)) {
                pathAdditions = pathAdditions ? `${pathAdditions}:${claudeBin}` : claudeBin;
            }

            // 3. 添加 Homebrew 路径
            const homebrewPaths = ['/opt/homebrew/bin', '/usr/local/bin'];
            for (const hbPath of homebrewPaths) {
                if (fs.existsSync(hbPath)) {
                    pathAdditions = pathAdditions ? `${pathAdditions}:${hbPath}` : hbPath;
                }
            }

            // 4. 添加 nvm 路径（关键：node 脚本需要 node 在 PATH 中）
            const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
            if (fs.existsSync(nvmDir)) {
                try {
                    const versions = fs.readdirSync(nvmDir);
                    for (const version of versions) {
                        const nvmBinPath = path.join(nvmDir, version, 'bin');
                        if (fs.existsSync(nvmBinPath)) {
                            pathAdditions = pathAdditions ? `${pathAdditions}:${nvmBinPath}` : nvmBinPath;
                        }
                    }
                } catch (e) {
                    // 忽略读取错误
                }
            }

            // 5. 添加 npm 路径
            if (npmPrefix) {
                pathAdditions = pathAdditions ? `${pathAdditions}:${npmPrefix}` : npmPrefix;
            }

            if (pathAdditions) {
                spawnOptions.env!.PATH = `${pathAdditions}:${spawnOptions.env!.PATH}`;
            }

            if (forTerminal) {
                spawnOptions.shell = true;
            } else {
                // For direct spawn, search for executable
                const executablePath = this.findCliExecutable(cliCommand, npmPrefix);
                if (executablePath) {
                    claudeExecutablePath = executablePath;
                } else {
                    // Fallback: 如果找不到，使用默认的 'claude'（依赖 PATH）
                    console.warn(`Claude CLI not found in standard paths, falling back to 'claude'`);
                }
            }
            // Mac 使用系统默认 shell，不需要额外配置
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
                // 更新错误提示，推荐新的安装方式
                errorMessage = `无法启动 Claude。请确保：\n` +
                    `1. 已安装 Claude Code:\n` +
                    `   • 推荐: irm https://claude.ai/install.ps1 | iex\n` +
                    `   • 或 WinGet: winget install Anthropic.ClaudeCode\n` +
                    `   • 或 npm (已弃用): npm install -g @anthropic-ai/claude-code\n` +
                    `2. Git Bash 已安装并在设置中配置路径\n` +
                    `3. 已在终端中运行 'claude' 完成登录\n\n` +
                    `原始错误: ${error.message}`;
            } else if (error.message.includes('npm')) {
                // npm 错误现在是可选的，不再是必需
                errorMessage = `npm 配置错误。如果使用原生安装器，可以忽略此错误。\n` +
                    `如需使用 npm 安装，请确保 Node.js 和 npm 已正确安装。\n\n` +
                    `原始错误: ${error.message}`;
            } else if (error.message.includes('Git Bash') || error.message.includes('bash.exe')) {
                errorMessage = `找不到 Git Bash。请安装 Git for Windows 并在设置中配置 bash.exe 路径。\n\n` +
                    `原始错误: ${error.message}`;
            }
        }

        if (process.platform === 'darwin') {
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                errorMessage = `无法启动 Claude。请确保已安装 Claude Code:\n` +
                    `  • 推荐: curl -fsSL https://claude.ai/install.sh | bash\n` +
                    `  • 或 Homebrew: brew install --cask claude-code\n\n` +
                    `原始错误: ${error.message}`;
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