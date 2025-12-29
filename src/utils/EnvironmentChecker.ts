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

const exec = util.promisify(cp.exec);

export class EnvironmentChecker {
    public static async check(context: vscode.ExtensionContext): Promise<{ success: boolean, message: string }> {
        const platform = process.platform;
        
        // macOS 环境检查
        if (platform === 'darwin') {
            return await this.checkMacOS();
        }
        
        // Windows 环境检查
        if (platform === 'win32') {
            return await this.checkWindows();
        }

        // Linux 或其他平台
        return { success: true, message: 'Platform check passed.' };
    }

    /**
     * macOS 环境检查
     */
    private static async checkMacOS(): Promise<{ success: boolean, message: string }> {
        // 1. 检查 Claude CLI 是否安装
        try {
            await exec('which claude');
        } catch (error) {
            return {
                success: false,
                message: 'Claude CLI not found. Please install it via:\n' +
                        'npm install -g @anthropic-ai/claude-code\n\n' +
                        'Then run "claude" in terminal to login.'
            };
        }

        // 2. 检查 Node.js 是否安装
        try {
            await exec('which node');
        } catch (error) {
            return {
                success: false,
                message: 'Node.js not found. Please install Node.js (v18+) from https://nodejs.org/'
            };
        }

        return { success: true, message: 'macOS environment check successful.' };
    }

    /**
     * Windows 环境检查
     */
    private static async checkWindows(): Promise<{ success: boolean, message: string }> {
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const wslEnabled = config.get('wsl.enabled', false);
        if (wslEnabled) {
            return { success: true, message: 'WSL enabled, skipping native Windows check.' };
        }

        // 1. Use smart npm finder to check npm prefix
        let npmPrefix: string | undefined;
        npmPrefix = await getNpmPrefix();

        if (!npmPrefix) {
            // Provide detailed error information and solutions
            return {
                success: false,
                message: 'Cannot find npm. Please ensure Node.js/npm is installed.\n' +
                        'Solutions:\n' +
                        '1. Start VS Code from command line (run "code" in Git Bash)\n' +
                        '2. Or add Node.js path to system PATH environment variable and restart computer\n' +
                        '3. If you just installed Node.js, please restart VS Code'
            };
        }

        // 2. Check for claude.cmd
        const claudePath = path.join(npmPrefix, 'claude.cmd');
        if (!fs.existsSync(claudePath)) {
            return { success: false, message: `Claude CLI not found at the expected path: ${claudePath}. Please install it globally via 'npm install -g @anthropic-ai/claude-code'.` };
        }

        // 3. Check for Git Bash
        const gitBashPath = config.get<string>('windows.gitBashPath');
        if (!gitBashPath) {
            return { success: false, message: 'The path to Git Bash (bash.exe) is not configured. Please set "claudeCodeChatUI.windows.gitBashPath" in your settings.' };
        }
        if (!fs.existsSync(gitBashPath)) {
            return { success: false, message: `The configured Git Bash path was not found: ${gitBashPath}. Please verify the path.` };
        }

        return { success: true, message: 'Windows environment check successful.' };
    }
}