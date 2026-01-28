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

        // Get configured CLI command name
        const configManager = new ApiConfigManager();
        const apiConfig = configManager.getApiConfig();
        const cliCommand = apiConfig.useCustomAPI ? (apiConfig.cliCommand || 'claude') : 'claude';

        // Mac: Check Claude CLI, skip Git Bash check
        if (platform === 'darwin') {
            const homeDir = require('os').homedir();
            const searchPaths = [
                path.join(homeDir, '.local', 'bin', cliCommand),      // Official installation
                path.join(homeDir, '.claude', 'bin', cliCommand),     // Fallback path
                '/usr/local/bin/' + cliCommand,                        // Homebrew Intel
                '/opt/homebrew/bin/' + cliCommand,                     // Homebrew Apple Silicon
            ];

            // Add nvm paths (dynamically find current node version)
            const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
            if (fs.existsSync(nvmDir)) {
                try {
                    const versions = fs.readdirSync(nvmDir);
                    for (const version of versions) {
                        searchPaths.push(path.join(nvmDir, version, 'bin', cliCommand));
                    }
                } catch (e) {
                    // Ignore read errors
                }
            }

            let cliFound = false;
            for (const p of searchPaths) {
                if (fs.existsSync(p)) {
                    cliFound = true;
                    break;
                }
            }

            if (!cliFound) {
                return {
                    success: false,
                    message: `Claude CLI not found. Please install:\n` +
                        `  • Recommended: curl -fsSL https://claude.ai/install.sh | bash\n` +
                        `  • Or Homebrew: brew install --cask claude-code`
                };
            }
            return { success: true, message: 'Environment check successful.' };
        }

        if (platform !== 'win32') {
            return { success: true, message: 'Platform not supported.' };
        }

        // Windows: Continue with original check logic
        const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
        const wslEnabled = config.get('wsl.enabled', false);
        if (wslEnabled) {
            return { success: true, message: 'WSL enabled, skipping native Windows check.' };
        }

        // 1. Try to get npm prefix (optional, native installer doesn't need npm)
        let npmPrefix: string | undefined;
        try {
            npmPrefix = await getNpmPrefix();
        } catch (e) {
            // npm not existing is fine, native installer doesn't need npm
            npmPrefix = undefined;
        }
        // Note: No longer return error if npm doesn't exist
        // Continue checking other installation paths (native installer, Bun, etc.)

        // 2. cliCommand is already defined at the start of the function

        // 3. Check CLI command in multiple locations (native path > npm > Bun)
        const homeDir = require('os').homedir();
        const nativeLocalBin = path.join(homeDir, '.local', 'bin');
        const nativeClaudeBin = path.join(homeDir, '.claude', 'bin');
        const bunBinPath = path.join(homeDir, '.bun', 'bin');

        // Search paths sorted by priority
        const searchPaths: { path: string, exists: boolean }[] = [
            // 1. Native installation path (highest priority) - PowerShell/WinGet install location
            { path: path.join(nativeLocalBin, `${cliCommand}.exe`), exists: false },
            { path: path.join(nativeLocalBin, cliCommand), exists: false },
            // 2. Fallback native path
            { path: path.join(nativeClaudeBin, `${cliCommand}.exe`), exists: false },
            { path: path.join(nativeClaudeBin, cliCommand), exists: false },
            // 3. npm path (legacy method, optional)
            ...(npmPrefix ? [
                { path: path.join(npmPrefix, `${cliCommand}.cmd`), exists: false },
                { path: path.join(npmPrefix, `${cliCommand}.exe`), exists: false },
            ] : []),
            // 4. Bun path
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
                ? `Please install Claude Code:\n` +
                  `  • Recommended: irm https://claude.ai/install.ps1 | iex\n` +
                  `  • Or WinGet: winget install Anthropic.ClaudeCode\n` +
                  `  • Or npm (deprecated): npm install -g @anthropic-ai/claude-code`
                : `Please ensure '${cliCommand}' is properly installed.\n` +
                  `If using a mirror service, the command may be installed via Bun.\n` +
                  `Searched paths:\n` +
                  `  - Native: ${nativeLocalBin}\n` +
                  `  - npm: ${npmPrefix || '(not installed)'}\n` +
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
