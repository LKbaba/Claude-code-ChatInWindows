/**
 * Environment Checker for Claude Code Chat VS Code Extension
 * Validates system requirements on Windows
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { getNpmPrefix } from './npmFinder';
import { ApiConfigManager } from '../managers/config/ApiConfigManager';

const exec = util.promisify(cp.exec);

export class EnvironmentChecker {
    public static async check(context: vscode.ExtensionContext): Promise<{ success: boolean, message: string }> {
        const platform = process.platform;
        if (platform !== 'win32') {
            return { success: true, message: 'Check only applicable on Windows.' };
        }

        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const wslEnabled = config.get('wsl.enabled', false);
        if (wslEnabled) {
            return { success: true, message: 'WSL enabled, skipping native Windows check.' };
        }

        // 1. 尝试获取 npm prefix（可选，原生安装器不需要 npm）
        let npmPrefix: string | undefined;
        try {
            npmPrefix = await getNpmPrefix();
        } catch (e) {
            // npm 不存在也没关系，原生安装器不需要 npm
            npmPrefix = undefined;
        }
        // 注意：不再因为 npm 不存在而直接返回错误
        // 继续检查其他安装路径（原生安装器、Bun 等）

        // 2. Get configured CLI command name (supports mirror service custom commands like xxxxclaude)
        const configManager = new ApiConfigManager();
        const apiConfig = configManager.getApiConfig();
        // If custom API is enabled, use configured command name; otherwise use default 'claude'
        const cliCommand = apiConfig.useCustomAPI ? (apiConfig.cliCommand || 'claude') : 'claude';

        // 3. 在多个位置检查 CLI 命令（原生安装路径 > npm > Bun）
        const homeDir = require('os').homedir();
        const nativeLocalBin = path.join(homeDir, '.local', 'bin');
        const nativeClaudeBin = path.join(homeDir, '.claude', 'bin');
        const bunBinPath = path.join(homeDir, '.bun', 'bin');

        // 按优先级排列的搜索路径
        const searchPaths: { path: string, exists: boolean }[] = [
            // 1. 原生安装路径 (最高优先级) - PowerShell/WinGet 安装位置
            { path: path.join(nativeLocalBin, `${cliCommand}.exe`), exists: false },
            { path: path.join(nativeLocalBin, cliCommand), exists: false },
            // 2. 备用原生路径
            { path: path.join(nativeClaudeBin, `${cliCommand}.exe`), exists: false },
            { path: path.join(nativeClaudeBin, cliCommand), exists: false },
            // 3. npm 路径 (传统方式，可选)
            ...(npmPrefix ? [
                { path: path.join(npmPrefix, `${cliCommand}.cmd`), exists: false },
                { path: path.join(npmPrefix, `${cliCommand}.exe`), exists: false },
            ] : []),
            // 4. Bun 路径
            { path: path.join(bunBinPath, `${cliCommand}.cmd`), exists: false },
            { path: path.join(bunBinPath, `${cliCommand}.exe`), exists: false },
            { path: path.join(bunBinPath, cliCommand), exists: false }
        ];

        let cliFound = false;
        for (const searchPath of searchPaths) {
            if (fs.existsSync(searchPath.path)) {
                searchPath.exists = true;
                cliFound = true;
                break;
            }
        }

        if (!cliFound) {
            // 根据命令名称提供不同的错误提示
            const installHint = cliCommand === 'claude'
                ? `请安装 Claude Code:\n` +
                  `  • 推荐方式: irm https://claude.ai/install.ps1 | iex\n` +
                  `  • 或 WinGet: winget install Anthropic.ClaudeCode\n` +
                  `  • 或 npm (已弃用): npm install -g @anthropic-ai/claude-code`
                : `请确保 '${cliCommand}' 已正确安装。\n` +
                  `如果使用镜像服务，命令可能通过 Bun 安装。\n` +
                  `已搜索路径:\n` +
                  `  - 原生: ${nativeLocalBin}\n` +
                  `  - npm: ${npmPrefix || '(未安装)'}\n` +
                  `  - Bun: ${bunBinPath}`;
            return { success: false, message: `找不到 CLI '${cliCommand}'。${installHint}` };
        }

        // 4. Check for Git Bash
        const gitBashPath = config.get<string>('windows.gitBashPath');
        if (!gitBashPath) {
            return { success: false, message: 'The path to Git Bash (bash.exe) is not configured. Please set "claudeCodeChatUI.windows.gitBashPath" in your settings.' };
        }
        if (!fs.existsSync(gitBashPath)) {
            return { success: false, message: `The configured Git Bash path was not found: ${gitBashPath}. Please verify the path.` };
        }

        return { success: true, message: 'Environment check successful.' };
    }
}