/**
 * Utility functions for Claude Code Chat VS Code Extension
 */

import * as cp from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TOOL_STATUS_MAP, DEFAULT_TOOL_STATUS, READ_TOOL_DEFAULTS, FILE_SIZE_LIMITS } from './constants';

const exec = util.promisify(cp.exec);

/**
 * Resolves the npm global installation prefix
 * This is used to find the location of globally installed npm packages on Windows
 */
export async function resolveNpmPrefix(): Promise<string | undefined> {
    try {
        const { stdout } = await exec('npm config get prefix');
        const prefix = stdout.trim();
        // DEBUG: console.log(`npm prefix found at: ${prefix}`);
        return prefix;
    } catch (error) {
        console.error('Failed to get npm prefix:', error);
        vscode.window.showErrorMessage('Could not find npm global path. Please ensure Node.js and npm are installed correctly.');
        return undefined;
    }
}

/**
 * Gets human-readable status text for a tool
 * @param toolName The name of the tool being executed
 * @returns Human-readable status text
 */
export function getToolStatusText(toolName: string): string {
    // Direct match first
    if (TOOL_STATUS_MAP[toolName]) {
        return TOOL_STATUS_MAP[toolName];
    }
    
    // Handle MCP tools dynamically
    if (toolName && toolName.startsWith('mcp__')) {
        const parts = toolName.split('__');
        if (parts.length >= 3) {
            const serverName = parts[1];
            const toolAction = parts[2];
            
            // Generate human-readable status for MCP tools
            if (toolAction.includes('sequentialthinking')) return '🧠 Analyzing with sequential thinking';
            if (toolAction.includes('thinking')) return '🧠 Analyzing with enhanced reasoning';
            if (serverName === 'context7' && toolAction.includes('search')) return '📚 Searching documentation via Context7';
            if (serverName === 'context7' && toolAction.includes('get_context')) return '📋 Fetching context via Context7';
            if (toolAction.includes('search')) return `🔍 Searching via ${serverName}`;
            if (toolAction.includes('read')) return `📖 Reading via ${serverName}`;
            if (toolAction.includes('write')) return `✍️ Writing via ${serverName}`;
            if (toolAction.includes('query')) return `🔎 Querying ${serverName}`;
            
            // Default MCP status with emoji
            return `⚙️ Processing with ${serverName}`;
        }
    }
    
    return DEFAULT_TOOL_STATUS;
}

/**
 * Optimizes tool inputs for Windows compatibility and prevents errors
 * @param toolName The name of the tool
 * @param input The original tool input
 * @param onMessage Optional callback to send messages to the UI
 * @returns Optimized tool input
 */
export function optimizeToolInput(
    toolName: string, 
    input: any,
    onMessage?: (message: { type: string, message?: string, data?: any }) => void
): any {
    // Return a copy of the input to avoid modifying the original
    const optimizedInput = { ...input };

    // Optimize based on tool name
    switch (toolName) {
        case 'Read':
            // ALWAYS enforce both offset and limit to prevent large file errors
            const hadOffset = optimizedInput.offset !== undefined;
            const hadLimit = optimizedInput.limit !== undefined;
            
            // Always set offset if not specified
            if (!hadOffset) {
                optimizedInput.offset = READ_TOOL_DEFAULTS.DEFAULT_OFFSET;
            }
            
            // Always set limit if not specified
            if (!hadLimit) {
                // Use a conservative limit to avoid token issues
                // This accounts for potentially long lines (e.g., minified code)
                optimizedInput.limit = READ_TOOL_DEFAULTS.CONSERVATIVE_LIMIT;
            }
            
            // Check if file path exists and warn about large files
            if (optimizedInput.file_path) {
                try {
                    const filePath = optimizedInput.file_path;
                    if (fs.existsSync(filePath)) {
                        const stats = fs.statSync(filePath);
                        
                        // Warn if file is larger than threshold
                        if (stats.size > FILE_SIZE_LIMITS.WARNING_THRESHOLD) {
                            const fileSizeInMB = stats.size / (1024 * 1024);
                            if (onMessage) {
                                onMessage({
                                    type: 'info',
                                    message: `⚠️ Large file detected (${fileSizeInMB.toFixed(2)}MB). Reading with offset=${optimizedInput.offset}, limit=${optimizedInput.limit}. Claude may need to read in chunks.`
                                });
                            }
                        }
                    }
                } catch (error) {
                    // Ignore errors, let Claude handle file not found
                }
            }
            
            // Log what was added
            if (!hadOffset && !hadLimit) {
                console.log(`Read tool: Enforced offset=${READ_TOOL_DEFAULTS.DEFAULT_OFFSET} and limit=${READ_TOOL_DEFAULTS.CONSERVATIVE_LIMIT} for file "${optimizedInput.file_path}"`);
            } else if (!hadOffset) {
                console.log(`Read tool: Added missing offset=${READ_TOOL_DEFAULTS.DEFAULT_OFFSET} (limit=${optimizedInput.limit}) for file "${optimizedInput.file_path}"`);
            } else if (!hadLimit) {
                console.log(`Read tool: Added missing limit=${READ_TOOL_DEFAULTS.CONSERVATIVE_LIMIT} (offset=${optimizedInput.offset}) for file "${optimizedInput.file_path}"`);
            }
            
            // Always log the final parameters for debugging
            console.log(`Read tool parameters: file="${optimizedInput.file_path}", offset=${optimizedInput.offset}, limit=${optimizedInput.limit}`);
            break;

        case 'Bash':
            // Fix Windows-specific issues but preserve command semantics
            if (optimizedInput.command && process.platform === 'win32') {
                const originalCommand = optimizedInput.command;
                
                // Instead of replacing &&, wrap the command to ensure proper execution
                // This preserves the original semantics while working around Windows issues
                if (originalCommand.includes('&&')) {
                    // Use bash -c to ensure proper shell execution with && support
                    optimizedInput.command = `bash -c "${originalCommand.replace(/"/g, '\\"')}"`;
                    console.log(`Wrapped Bash command for Windows: "${originalCommand}" -> "${optimizedInput.command}"`);
                    
                    // Send optimization notice to UI
                    if (onMessage) {
                        onMessage({
                            type: 'info',
                            message: `⚙️ Command wrapped for Windows compatibility: Using bash -c to preserve && semantics`
                        });
                    }
                }
            }
            break;

        // Add more tool-specific optimizations as needed
    }

    return optimizedInput;
}

/**
 * Updates CLAUDE.md file with Windows environment information
 * @param workspaceFolder The current workspace folder
 */
export async function updateClaudeMdWithWindowsInfo(workspaceFolder: vscode.WorkspaceFolder | undefined): Promise<void> {
    if (!workspaceFolder) return;

    const claudeMdPath = path.join(workspaceFolder.uri.fsPath, 'CLAUDE.md');
    const windowsSection = `## Development Environment
- OS: Windows ${require('os').release()}
- Shell: Git Bash
- Path format: Windows (use forward slashes in Git Bash)
- File system: Case-insensitive
- Line endings: CRLF (configure Git autocrlf)`;

    try {
        let content = '';
        let hasWindowsInfo = false;

        // Check if CLAUDE.md exists
        if (fs.existsSync(claudeMdPath)) {
            content = fs.readFileSync(claudeMdPath, 'utf8');
            // Check if it already has Windows environment info
            hasWindowsInfo = content.includes('Development Environment') && content.includes('Windows');
        }

        // If no Windows info, add it
        if (!hasWindowsInfo) {
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
            if (content.length > 0) {
                content += '\n';
            }
            content += windowsSection + '\n';
            
            fs.writeFileSync(claudeMdPath, content, 'utf8');
            // DEBUG: console.log('Updated CLAUDE.md with Windows environment information');
        }
    } catch (error) {
        console.error('Failed to update CLAUDE.md:', error);
        // Don't throw - this is not critical
    }
}