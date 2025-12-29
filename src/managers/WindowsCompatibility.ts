import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ApiConfigManager } from './config/ApiConfigManager';

export interface ExecutionEnvironment {
    spawnOptions: cp.SpawnOptions;
    claudeExecutablePath: string | undefined;
}

/**
 * 跨平台兼容性管理器
 * 支持 Windows 和 macOS
 */
export class PlatformCompatibility {
    private readonly _platform: NodeJS.Platform;
    private readonly _homeDir: string;
    private readonly _claudeHome: string;

    constructor(
        private readonly _npmPrefixPromise: Promise<string | undefined>,
        private readonly _configurationManager: ApiConfigManager
    ) {
        this._platform = process.platform;
        this._homeDir = os.homedir();
        this._claudeHome = path.join(this._homeDir, '.claude');
    }

    /**
     * 获取当前平台
     */
    get platform(): NodeJS.Platform {
        return this._platform;
    }

    /**
     * 是否为 macOS
     */
    get isMacOS(): boolean {
        return this._platform === 'darwin';
    }

    /**
     * 是否为 Windows
     */
    get isWindows(): boolean {
        return this._platform === 'win32';
    }

    /**
     * 确保 Claude 配置目录存在
     */
    private ensureClaudeHomeExists(): void {
        if (!fs.existsSync(this._claudeHome)) {
            fs.mkdirSync(this._claudeHome, { recursive: true });
            console.log(`[PlatformCompatibility] Created Claude home directory: ${this._claudeHome}`);
        }
    }

    /**
     * 获取执行环境配置
     */
    async getExecutionEnvironment(forTerminal = false): Promise<ExecutionEnvironment> {
        const spawnOptions: cp.SpawnOptions = {
            env: { ...process.env },
            // 在 macOS 上不使用 shell，避免特殊字符被解释
            // 在 Windows 上需要 shell 来正确处理路径
            shell: this.isWindows
        };
        let claudeExecutablePath: string | undefined = 'claude';

        // 确保 Claude 配置目录存在
        this.ensureClaudeHomeExists();

        // 设置 CLAUDE_HOME
        let claudeHome = this._claudeHome;
        if (this.isWindows) {
            claudeHome = claudeHome.replace(/\\/g, '/');
        }
        spawnOptions.env!.CLAUDE_HOME = claudeHome;

        if (this.isMacOS) {
            claudeExecutablePath = await this._getMacOSExecutablePath();
        } else if (this.isWindows) {
            const result = await this._getWindowsExecutionEnvironment(forTerminal, spawnOptions);
            claudeExecutablePath = result.claudeExecutablePath;
        }

        return { spawnOptions, claudeExecutablePath };
    }

    /**
     * macOS: 获取 Claude 可执行文件路径
     */
    private async _getMacOSExecutablePath(): Promise<string> {
        const npmPrefix = await this._npmPrefixPromise;
        if (npmPrefix) {
            const potentialPath = path.join(npmPrefix, 'bin', 'claude');
            if (fs.existsSync(potentialPath)) {
                return potentialPath;
            }
        }
        
        // 检查常见的 macOS 安装路径
        const commonPaths = [
            '/usr/local/bin/claude',
            '/opt/homebrew/bin/claude',
            path.join(this._homeDir, '.npm-global/bin/claude')
        ];
        
        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        
        return 'claude'; // 依赖 PATH
    }

    /**
     * Windows: 获取执行环境配置
     */
    private async _getWindowsExecutionEnvironment(
        forTerminal: boolean,
        spawnOptions: cp.SpawnOptions
    ): Promise<{ claudeExecutablePath: string | undefined }> {
        // Windows 特定的临时目录设置
        spawnOptions.env!.TEMP = '/tmp';
        spawnOptions.env!.TMP = '/tmp';
        spawnOptions.env!.TMPDIR = '/tmp';

        const npmPrefix = await this._npmPrefixPromise;
        if (!npmPrefix) {
            console.error('[PlatformCompatibility] Could not determine npm prefix on Windows');
            return { claudeExecutablePath: undefined };
        }

        let claudeExecutablePath: string | undefined;

        if (forTerminal) {
            spawnOptions.env!.PATH = `${npmPrefix}${path.delimiter}${spawnOptions.env!.PATH}`;
            claudeExecutablePath = 'claude';
        } else {
            const potentialPath = path.join(npmPrefix, 'claude.cmd');
            if (fs.existsSync(potentialPath)) {
                claudeExecutablePath = potentialPath;
            } else {
                console.error(`[PlatformCompatibility] claude.cmd not found at: ${potentialPath}`);
                return { claudeExecutablePath: undefined };
            }
        }

        // 配置 Git Bash
        const windowsConfig = this._configurationManager.getWindowsConfig();
        const gitBashPath = windowsConfig.gitBashPath;
        if (gitBashPath && fs.existsSync(gitBashPath)) {
            spawnOptions.env!.SHELL = gitBashPath;
        }

        return { claudeExecutablePath };
    }

    /**
     * 修复路径格式（Windows Git Bash 兼容）
     */
    fixPath(cwd: string, spawnOptions: cp.SpawnOptions): string {
        if (this.isWindows && spawnOptions.shell) {
            return cwd.replace(/\\/g, '/');
        }
        return cwd;
    }

    /**
     * 获取平台特定的环境信息（注入到消息中）
     */
    getPlatformEnvironmentInfo(): string {
        if (this.isWindows) {
            const osRelease = os.release();
            const shell = process.env.SHELL || 'Git Bash';
            return `[SYSTEM INFO: Windows ${osRelease}, Shell: ${shell}. Use Windows-compatible commands.]\n\n`;
        }
        return '';
    }

    /**
     * 创建终端
     */
    async createTerminal(name: string): Promise<vscode.Terminal> {
        const { spawnOptions } = await this.getExecutionEnvironment(true);
        const terminalOptions: vscode.TerminalOptions = {
            name,
            env: spawnOptions.env
        };

        if (this.isWindows) {
            const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
            const gitBashPath = config.get<string>('windows.gitBashPath');
            if (gitBashPath && fs.existsSync(gitBashPath)) {
                terminalOptions.shellPath = gitBashPath;
                terminalOptions.shellArgs = ['--login', '-i'];
            }
        }

        return vscode.window.createTerminal(terminalOptions);
    }

    /**
     * 获取终端命令
     */
    getTerminalCommand(command: string, sessionId?: string): string {
        const fullCommand = sessionId ? `${command} --session ${sessionId}` : command;
        return `claude ${fullCommand}`;
    }

    /**
     * 获取登录命令
     */
    getLoginCommand(): string {
        return 'claude';
    }

    /**
     * 提供平台特定的错误信息
     */
    providePlatformSpecificError(error: any): string {
        const msg = error.message || String(error);

        if (this.isMacOS) {
            if (msg.includes('ENOENT') || msg.includes('not found')) {
                return `Claude CLI 未找到。请确保：\n` +
                    `1. 已安装 Claude CLI: npm install -g @anthropic-ai/claude-code\n` +
                    `2. 已在终端运行 'claude' 完成登录\n\n` +
                    `原始错误: ${msg}`;
            }
            if (msg.includes('npm')) {
                return `NPM 配置错误。请确保 Node.js 和 npm 已正确安装。\n\n原始错误: ${msg}`;
            }
        }

        if (this.isWindows) {
            if (msg.includes('ENOENT') || msg.includes('not found')) {
                return `Claude CLI 未找到。请确保：\n` +
                    `1. 已安装 Claude CLI: npm install -g @anthropic-ai/claude-code\n` +
                    `2. Git Bash 已安装并在设置中配置\n` +
                    `3. 已在终端运行 'claude' 完成登录\n\n` +
                    `原始错误: ${msg}`;
            }
            if (msg.includes('Git Bash') || msg.includes('bash.exe')) {
                return `Git Bash 未找到。请安装 Git for Windows 并在设置中配置 bash.exe 路径。\n\n原始错误: ${msg}`;
            }
        }

        return msg;
    }

    /**
     * 终止进程
     */
    async killProcess(processOrPid: cp.ChildProcess | number): Promise<void> {
        const pid = typeof processOrPid === 'number' ? processOrPid : processOrPid.pid;
        const proc = typeof processOrPid === 'number' ? null : processOrPid;

        if (this.isWindows && pid) {
            // Windows: 使用 taskkill
            try {
                cp.exec(`taskkill /pid ${pid} /t /f`, (error) => {
                    if (error) {
                        console.error('[PlatformCompatibility] taskkill failed:', error);
                    }
                });
            } catch (error) {
                console.error('[PlatformCompatibility] Error executing taskkill:', error);
                proc?.kill();
            }
        } else {
            // macOS/Linux: 使用 SIGTERM/SIGKILL
            if (proc) {
                proc.kill('SIGTERM');
                setTimeout(() => {
                    if (!proc.killed) {
                        proc.kill('SIGKILL');
                    }
                }, 2000);
            } else if (pid) {
                try {
                    process.kill(pid, 'SIGTERM');
                    setTimeout(() => {
                        try { process.kill(pid, 'SIGKILL'); } catch {}
                    }, 2000);
                } catch {}
            }
        }
    }
}

// 导出别名以保持向后兼容
export { PlatformCompatibility as WindowsCompatibility };