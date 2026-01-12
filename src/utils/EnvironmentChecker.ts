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

        // 2. Get configured CLI command name (supports relay service custom commands like sssclaude)
        const configManager = new ApiConfigManager();
        const apiConfig = configManager.getApiConfig();
        // If custom API is enabled, use configured command name; otherwise use default 'claude'
        const cliCommand = apiConfig.useCustomAPI ? (apiConfig.cliCommand || 'claude') : 'claude';

        // 3. Check for CLI command in multiple locations (npm prefix and Bun bin)
        const homeDir = require('os').homedir();
        const bunBinPath = path.join(homeDir, '.bun', 'bin');

        // Search paths for the CLI executable
        const searchPaths: { path: string, exists: boolean }[] = [
            { path: path.join(npmPrefix, `${cliCommand}.cmd`), exists: false },
            { path: path.join(npmPrefix, `${cliCommand}.exe`), exists: false },
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
            // Provide different error hints based on command name
            const installHint = cliCommand === 'claude'
                ? `Please install it globally via 'npm install -g @anthropic-ai/claude-cli'.`
                : `Please ensure '${cliCommand}' is installed correctly.\n` +
                  `If using a relay service (like sssaicode), the command may be installed via Bun.\n` +
                  `Searched paths:\n` +
                  `  - npm: ${npmPrefix}\n` +
                  `  - Bun: ${bunBinPath}`;
            return { success: false, message: `CLI '${cliCommand}' not found. ${installHint}` };
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