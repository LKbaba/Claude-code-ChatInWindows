/**
 * Utility functions for Claude Code Chat VS Code Extension
 */

import * as cp from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TOOL_STATUS_MAP, DEFAULT_TOOL_STATUS, READ_TOOL_DEFAULTS, FILE_SIZE_LIMITS } from './constants';
import { getNpmPrefix } from './npmFinder';
import { debugLog, debugError } from '../services/DebugLogger';

const exec = util.promisify(cp.exec);

/**
 * Resolves the npm global installation prefix
 * This is used to find the location of globally installed npm packages
 * Uses smart npm finder to resolve VS Code environment variable issues
 */
export async function resolveNpmPrefix(): Promise<string | undefined> {
    const prefix = await getNpmPrefix();

    if (!prefix) {
        debugError('utils', 'Could not get npm prefix');
        // Mac: npm is not required (official installation method doesn't depend on npm)
        // Windows: npm is also not required (native installer doesn't depend on npm)
        // Only log warning, don't show error popup
        console.warn('[Claude Code] npm not found - this is OK if Claude CLI was installed via official installer');
        return undefined;
    }

    debugLog('utils', `npm prefix found at: ${prefix}`);
    return prefix;
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
                debugLog('ReadTool', `Enforced offset=${READ_TOOL_DEFAULTS.DEFAULT_OFFSET} and limit=${READ_TOOL_DEFAULTS.CONSERVATIVE_LIMIT} for file "${optimizedInput.file_path}"`);
            } else if (!hadOffset) {
                debugLog('ReadTool', `Added missing offset=${READ_TOOL_DEFAULTS.DEFAULT_OFFSET} (limit=${optimizedInput.limit}) for file "${optimizedInput.file_path}"`);
            } else if (!hadLimit) {
                debugLog('ReadTool', `Added missing limit=${READ_TOOL_DEFAULTS.CONSERVATIVE_LIMIT} (offset=${optimizedInput.offset}) for file "${optimizedInput.file_path}"`);
            }

            // Always log the final parameters for debugging
            debugLog('ReadTool', `Parameters: file="${optimizedInput.file_path}", offset=${optimizedInput.offset}, limit=${optimizedInput.limit}`);
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
                    debugLog('BashTool', `Wrapped command for Windows: "${originalCommand}" -> "${optimizedInput.command}"`);
                    
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

        case 'Grep':
            // v1.0.45 redesigned the Grep tool with new parameters
            // Ensure compatibility by logging parameters for debugging
            debugLog('GrepTool', `Parameters: pattern="${optimizedInput.pattern}", path="${optimizedInput.path || '.'}", include="${optimizedInput.include || ''}", exclude="${optimizedInput.exclude || ''}"`);
            
            // Fix Windows path if provided
            if (optimizedInput.path && process.platform === 'win32') {
                // Convert Windows backslashes to forward slashes for consistency
                optimizedInput.path = optimizedInput.path.replace(/\\/g, '/');
            }
            break;

        // Add more tool-specific optimizations as needed
    }

    return optimizedInput;
}

/**
 * Updates CLAUDE.md file with platform environment information and MCP usage guides
 * @param workspaceFolder The current workspace folder
 * @param mcpServers Optional array of enabled MCP servers
 */
export async function updateClaudeMdWithPlatformInfo(
    workspaceFolder: vscode.WorkspaceFolder | undefined,
    mcpServers?: Array<{ name: string }>
): Promise<void> {
    if (!workspaceFolder) {return;}

    const claudeMdPath = path.join(workspaceFolder.uri.fsPath, 'CLAUDE.md');

    // Platform environment information
    const platformSection = process.platform === 'win32'
        ? `## Development Environment
- OS: Windows ${require('os').release()}
- Shell: Git Bash
- Path format: Windows (use forward slashes in Git Bash)
- File system: Case-insensitive
- Line endings: CRLF (configure Git autocrlf)`
        : process.platform === 'darwin'
        ? `## Development Environment
- OS: macOS ${require('os').release()}
- Shell: ${process.env.SHELL || 'zsh'}
- Path format: Unix
- File system: Case-sensitive (default)
- Line endings: LF`
        : '';

    // Playwright MCP
    const playwrightSection = `## Playwright MCP Guide

File paths:
- Screenshots: \`./CCimages/screenshots/\`
- PDFs: \`./CCimages/pdfs/\`

Browser version fix:
- Error: "Executable doesn't exist at chromium-XXXX" → Version mismatch
- v1.0.12+ uses Playwright 1.57.0, requires chromium-1200 with \`chrome-win64/\` structure
- Quick fix: \`npx playwright@latest install chromium\`
- Manual symlink (if needed): \`cd ~/AppData/Local/ms-playwright && cmd //c "mklink /J chromium-1200 chromium-1181"\``;

    // Codex MCP
    const codexSection = `## Codex MCP Guide

Codex is an autonomous coding agent by OpenAI, integrated via MCP.

Workflow: Claude plans architecture → delegate scoped tasks to Codex → review results
- \`codex\` tool: start a session with prompt, sandbox, approval-policy
- \`codex-reply\` tool: continue a session by threadId for multi-turn tasks
- Pass project context via \`developer-instructions\` parameter
- Recommended: sandbox='workspace-write', approval-policy='on-failure'

Prerequisite: \`npm i -g @openai/codex\`, OPENAI_API_KEY configured`;

    try {
        let content = '';
        let hasPlatformInfo = false;
        let hasPlaywrightInfo = false;
        let hasCodexInfo = false;

        // Check if CLAUDE.md exists
        if (fs.existsSync(claudeMdPath)) {
            content = fs.readFileSync(claudeMdPath, 'utf8');
            // Check if it already has platform environment info
            hasPlatformInfo = content.includes('Development Environment') &&
                (content.includes('Windows') || content.includes('macOS'));
            // Check if it already has Playwright MCP info
            hasPlaywrightInfo = content.includes('Playwright MCP');
            // Check if it already has Codex MCP info
            hasCodexInfo = content.includes('Codex MCP');
        }

        // Detect which MCP servers are enabled
        const hasPlaywrightServer = mcpServers?.some(s => s.name === 'playwright') ?? false;
        const hasCodexServer = mcpServers?.some(s => s.name === 'codex-official') ?? false;

        let needsUpdate = false;
        let updatedSections: string[] = [];

        // Add platform information (if not present and platformSection is not empty)
        if (!hasPlatformInfo && platformSection) {
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
            if (content.length > 0) {
                content += '\n';
            }
            content += platformSection + '\n';
            needsUpdate = true;
            updatedSections.push('Platform info');
        }

        // Add Playwright MCP information (if enabled and not present)
        if (!hasPlaywrightInfo && hasPlaywrightServer) {
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
            content += '\n' + playwrightSection + '\n';
            needsUpdate = true;
            updatedSections.push('Playwright MCP guide');
        }

        // Add Codex MCP information (if enabled and not present)
        if (!hasCodexInfo && hasCodexServer) {
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
            content += '\n' + codexSection + '\n';
            needsUpdate = true;
            updatedSections.push('Codex MCP guide');
        }

        // Only write file when update is needed
        if (needsUpdate) {
            fs.writeFileSync(claudeMdPath, content, 'utf8');
            debugLog('updateClaudeMd', `Successfully updated CLAUDE.md with: ${updatedSections.join(', ')}`);
        }
    } catch (error) {
        debugError('updateClaudeMd', 'Failed to update CLAUDE.md', error);
        // Don't throw - this is not critical
    }
}