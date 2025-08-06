/**
 * MCP (Model Context Protocol) System Prompts
 * Optimized version - Reduced token usage while maintaining core functionality
 * See CLAUDE.md for detailed documentation
 */

export const MCP_SYSTEM_PROMPTS: Record<string, string> = {
    'sequential-thinking': `
## Sequential Thinking
**Purpose**: Structured thinking tool for complex problems
**Core**: sequentialthinking - Break tasks into steps, supports branching & revision
**Use cases**: Unclear requirements, iterative exploration, multi-solution comparison
**Usage**: Each step: goal→execute→record→decide next`,

    'context7': `
## Context7
**Purpose**: Fetch latest official docs, solve outdated knowledge issues
**Core**: resolve-library-id, get-library-docs
**When**: Unclear APIs, version differences, need official examples
**Note**: Call on-demand to save tokens`,
  
    'basic-memory': `
## Basic Memory
**Purpose**: Persistent knowledge base with notes & search
**Core**: write_note, read_note, search_notes, recent_activity, canvas
**Organization**: Use folder structure (e.g. projects/my-app), supports tags
**Best practice**: Create separate notes per topic, use descriptive titles`,

    'playwright': `
## Playwright
**Purpose**: Browser automation - web scraping, form filling, UI testing
**Core**: navigate, screenshot, click, fill, evaluate, save_as_pdf
**File paths**: Screenshots→./CCimages/screenshots/ PDFs→./CCimages/pdfs/
**Installation**: See browser install guide in CLAUDE.md`,

    'n8n': `
## n8n 
**Purpose**: n8n workflow automation - 532+ node documentation access
**Core tools**: tools_documentation, list_nodes, get_node_info, search_nodes
**Coverage**: 99% properties | 63% operations | 90% docs | 263 AI nodes
**Workflow management**: Requires N8N_API_URL and N8N_API_KEY configuration
**Important**: See detailed usage guide in CLAUDE.md's n8n MCP section`
};

/**
 * Get system prompts for enabled MCP servers
 * @param mcpServers Array of MCP server configurations
 * @returns Combined system prompt string
 */
export function getMcpSystemPrompts(mcpServers: Array<{ name: string }>): string {
    const prompts: string[] = [];
    
    // Add general MCP usage instructions (minimal version)
    const header = `# MCP Tools Available
The following MCP servers are enabled. Use their tools as needed:`;
    
    prompts.push(header);
    
    console.log('[getMcpSystemPrompts] Processing servers:', mcpServers.map(s => s.name));
    
    for (const server of mcpServers) {
        const prompt = MCP_SYSTEM_PROMPTS[server.name];
        if (prompt) {
            console.log(`[getMcpSystemPrompts] Found prompt for ${server.name}, length: ${prompt.trim().length}`);
            prompts.push(prompt.trim());
        } else {
            console.log(`[getMcpSystemPrompts] No prompt found for ${server.name}`);
        }
    }
    
    // Add general guidance (minimal version)
    if (prompts.length > 1) {
        prompts.push('\n**Remember**: Check CLAUDE.md for detailed usage instructions.');
    }
    
    const result = prompts.join('\n');
    console.log('[getMcpSystemPrompts] Final result:', {
        promptCount: prompts.length,
        totalLength: result.length,
        servers: mcpServers.map(s => s.name)
    });
    
    return result;
}