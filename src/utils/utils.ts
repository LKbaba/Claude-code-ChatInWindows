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

const exec = util.promisify(cp.exec);

/**
 * Resolves the npm global installation prefix
 * This is used to find the location of globally installed npm packages on Windows
 * Uses smart npm finder to resolve VS Code environment variable issues
 */
export async function resolveNpmPrefix(): Promise<string | undefined> {
    const prefix = await getNpmPrefix();

    if (!prefix) {
        console.error('[utils] Could not get npm prefix');
        vscode.window.showErrorMessage(
            'Could not find npm global path. Please ensure Node.js and npm are properly installed.\n' +
            'Tip: Try starting VS Code from command line (run "code" command)'
        );
        return undefined;
    }

    console.log(`[utils] npm prefix found at: ${prefix}`);
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

        case 'Grep':
            // v1.0.45 redesigned the Grep tool with new parameters
            // Ensure compatibility by logging parameters for debugging
            console.log(`Grep tool parameters: pattern="${optimizedInput.pattern}", path="${optimizedInput.path || '.'}", include="${optimizedInput.include || ''}", exclude="${optimizedInput.exclude || ''}"`);
            
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
 * Updates CLAUDE.md file with Windows environment information and MCP usage guides
 * @param workspaceFolder The current workspace folder
 * @param mcpServers Optional array of enabled MCP servers
 */
export async function updateClaudeMdWithWindowsInfo(
    workspaceFolder: vscode.WorkspaceFolder | undefined, 
    mcpServers?: Array<{ name: string }>
): Promise<void> {
    if (!workspaceFolder) {return;}

    const claudeMdPath = path.join(workspaceFolder.uri.fsPath, 'CLAUDE.md');
    
    // Windows environment information
    const windowsSection = `## Development Environment
- OS: Windows ${require('os').release()}
- Shell: Git Bash
- Path format: Windows (use forward slashes in Git Bash)
- File system: Case-insensitive
- Line endings: CRLF (configure Git autocrlf)`;

    // Playwright MCP
    const playwrightSection = `## Playwright MCP Guide

File paths:
- Screenshots: \`./CCimages/screenshots/\`
- PDFs: \`./CCimages/pdfs/\`

Browser version fix:
- Error: "Executable doesn't exist at chromium-1179" → Version mismatch
- Quick fix: \`cd ~/AppData/Local/ms-playwright && cmd //c "mklink /J chromium-1179 chromium-1181"\`
- Or install: \`npx playwright@1.40.0 install chromium\``;

    // n8n MCP 
    const n8nSection = `## n8n MCP Guide 🔧

### Quick Start
You are an expert in n8n automation software using n8n-MCP tools. Your role is to design, build, and validate n8n workflows with maximum accuracy and efficiency.

## Core Workflow Process

1. **ALWAYS start new conversation with**: \`tools_documentation()\` to understand best practices and available tools.

2. **Discovery Phase** - Find the right nodes:
   - Think deeply about user request and the logic you are going to build to fulfill it. Ask follow-up questions to clarify the user's intent, if something is unclear. Then, proceed with the rest of your instructions.
   - \`search_nodes({query: 'keyword'})\` - Search by functionality
   - \`list_nodes({category: 'trigger'})\` - Browse by category
   - \`list_ai_tools()\` - See AI-capable nodes (remember: ANY node can be an AI tool!)

3. **Configuration Phase** - Get node details efficiently:
   - \`get_node_essentials(nodeType)\` - Start here! Only 10-20 essential properties
   - \`search_node_properties(nodeType, 'auth')\` - Find specific properties
   - \`get_node_for_task('send_email')\` - Get pre-configured templates
   - \`get_node_documentation(nodeType)\` - Human-readable docs when needed
   - It is good common practice to show a visual representation of the workflow architecture to the user and asking for opinion, before moving forward. 

4. **Pre-Validation Phase** - Validate BEFORE building:
   - \`validate_node_minimal(nodeType, config)\` - Quick required fields check
   - \`validate_node_operation(nodeType, config, profile)\` - Full operation-aware validation
   - Fix any validation errors before proceeding

5. **Building Phase** - Create the workflow:
   - Use validated configurations from step 4
   - Connect nodes with proper structure
   - Add error handling where appropriate
   - Use expressions like $json, $node["NodeName"].json
   - Build the workflow in an artifact for easy editing downstream (unless the user asked to create in n8n instance)

6. **Workflow Validation Phase** - Validate complete workflow:
   - \`validate_workflow(workflow)\` - Complete validation including connections
   - \`validate_workflow_connections(workflow)\` - Check structure and AI tool connections
   - \`validate_workflow_expressions(workflow)\` - Validate all n8n expressions
   - Fix any issues found before deployment

7. **Deployment Phase** (if n8n API configured):
   - \`n8n_create_workflow(workflow)\` - Deploy validated workflow
   - \`n8n_validate_workflow({id: 'workflow-id'})\` - Post-deployment validation
   - \`n8n_update_partial_workflow()\` - Make incremental updates using diffs
   - \`n8n_trigger_webhook_workflow()\` - Test webhook workflows

## Key Insights

- **USE CODE NODE ONLY WHEN IT IS NECESSARY** - always prefer to use standard nodes over code node. Use code node only when you are sure you need it.
- **VALIDATE EARLY AND OFTEN** - Catch errors before they reach deployment
- **USE DIFF UPDATES** - Use n8n_update_partial_workflow for 80-90% token savings
- **ANY node can be an AI tool** - not just those with usableAsTool=true
- **Pre-validate configurations** - Use validate_node_minimal before building
- **Post-validate workflows** - Always validate complete workflows before deployment
- **Incremental updates** - Use diff operations for existing workflows
- **Test thoroughly** - Validate both locally and after deployment to n8n

## Validation Strategy

### Before Building:
1. validate_node_minimal() - Check required fields
2. validate_node_operation() - Full configuration validation
3. Fix all errors before proceeding

### After Building:
1. validate_workflow() - Complete workflow validation
2. validate_workflow_connections() - Structure validation
3. validate_workflow_expressions() - Expression syntax check

### After Deployment:
1. n8n_validate_workflow({id}) - Validate deployed workflow
2. n8n_list_executions() - Monitor execution status
3. n8n_update_partial_workflow() - Fix issues using diffs

## Response Structure

1. **Discovery**: Show available nodes and options
2. **Pre-Validation**: Validate node configurations first
3. **Configuration**: Show only validated, working configs
4. **Building**: Construct workflow with validated components
5. **Workflow Validation**: Full workflow validation results
6. **Deployment**: Deploy only after all validations pass
7. **Post-Validation**: Verify deployment succeeded

## Example Workflow

### 1. Discovery & Configuration
search_nodes({query: 'slack'})
get_node_essentials('n8n-nodes-base.slack')

### 2. Pre-Validation
validate_node_minimal('n8n-nodes-base.slack', {resource:'message', operation:'send'})
validate_node_operation('n8n-nodes-base.slack', fullConfig, 'runtime')

### 3. Build Workflow
// Create workflow JSON with validated configs

### 4. Workflow Validation
validate_workflow(workflowJson)
validate_workflow_connections(workflowJson)
validate_workflow_expressions(workflowJson)

### 5. Deploy (if configured)
n8n_create_workflow(validatedWorkflow)
n8n_validate_workflow({id: createdWorkflowId})

### 6. Update Using Diffs
n8n_update_partial_workflow({
  workflowId: id,
  operations: [
    {type: 'updateNode', nodeId: 'slack1', changes: {position: [100, 200]}}
  ]
})

## Important Rules

- ALWAYS validate before building
- ALWAYS validate after building
- NEVER deploy unvalidated workflows
- USE diff operations for updates (80-90% token savings)
- STATE validation results clearly
- FIX all errors before proceeding`;

    try {
        let content = '';
        let hasWindowsInfo = false;
        let hasPlaywrightInfo = false;
        let hasN8nInfo = false;

        // Check if CLAUDE.md exists
        if (fs.existsSync(claudeMdPath)) {
            content = fs.readFileSync(claudeMdPath, 'utf8');
            // Check if it already has Windows environment info
            hasWindowsInfo = content.includes('Development Environment') && content.includes('Windows');
            // Check if it already has Playwright MCP info
            hasPlaywrightInfo = content.includes('Playwright MCP');
            // Check if it already has n8n MCP info
            hasN8nInfo = content.includes('n8n MCP');
        }

        let needsUpdate = false;
        let updatedSections: string[] = [];
        
        // Add Windows information (if not present)
        if (!hasWindowsInfo) {
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
            if (content.length > 0) {
                content += '\n';
            }
            content += windowsSection + '\n';
            needsUpdate = true;
            updatedSections.push('Windows info');
        }
        
        // Add Playwright MCP information (if not present)
        if (!hasPlaywrightInfo) {
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
            content += '\n' + playwrightSection + '\n';
            needsUpdate = true;
            updatedSections.push('Playwright MCP guide');
        }

        // Add n8n MCP information (if enabled and not present)
        const hasN8nMcp = mcpServers?.some(server => server.name === 'n8n');
        if (hasN8nMcp && !hasN8nInfo) {
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
            content += '\n' + n8nSection + '\n';
            needsUpdate = true;
            updatedSections.push('n8n MCP guide');
        }
        
        // Only write file when update is needed
        if (needsUpdate) {
            fs.writeFileSync(claudeMdPath, content, 'utf8');
            console.log('[updateClaudeMd] Successfully updated CLAUDE.md with:', 
                updatedSections.join(', '));
        }
    } catch (error) {
        console.error('[updateClaudeMd] Failed to update CLAUDE.md:', error);
        // Don't throw - this is not critical
    }
}