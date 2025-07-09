/**
 * Environment Checker for Claude Code Chat VS Code Extension
 * Validates system requirements on Windows
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs';

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

        // 1. Check for npm prefix
        let npmPrefix: string | undefined;
        try {
            const { stdout } = await exec('npm config get prefix');
            npmPrefix = stdout.trim();
            if (!npmPrefix) {
                return { success: false, message: 'Could not determine npm global path. Is Node.js/npm installed and in your PATH?' };
            }
        } catch (error) {
            return { success: false, message: 'Failed to find npm. Is Node.js/npm installed and in your PATH?' };
        }

        // 2. Check for claude.cmd
        const claudePath = path.join(npmPrefix, 'claude.cmd');
        if (!fs.existsSync(claudePath)) {
            return { success: false, message: `Claude CLI not found at the expected path: ${claudePath}. Please install it globally via 'npm install -g @anthropic-ai/claude-cli'.` };
        }

        // 3. Check for Git Bash
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