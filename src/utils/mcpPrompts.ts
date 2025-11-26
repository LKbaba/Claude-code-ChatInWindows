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
**Important**: See detailed usage guide in CLAUDE.md's n8n MCP section`,

    'shadcn': `
## shadcn/ui MCP
**Purpose**: Project-aware component manager for shadcn/ui (React/Next.js)
**Core capabilities**: Browse, search, and **install** components directly to your project
**Key features**:
- Reads components.json for project configuration
- Installs components to your codebase automatically
- Supports multiple registries (public & private)
**Usage examples**:
- "Add button and dialog components to my project"
- "Show me all available components"
- "Install the card component from shadcn registry"
**Requirements**: Must run in a project with components.json file
**Note**: Run 'npx shadcn@latest init' first if components.json doesn't exist`,

    // Gemini AI 助手 - 用于 UI 生成、多模态分析和创意编码
    'gemini-assistant': `
## Gemini AI Assistant
**Purpose**: AI-powered UI generation, multimodal analysis, and creative coding
**Powered by**: Gemini 2.5 Pro (1M context, vision, thinking capabilities)

**Core Tools**:
- \`gemini_generate_ui\` - Generate HTML/CSS/JS from description or design image
- \`gemini_multimodal_query\` - Analyze images with natural language questions
- \`gemini_fix_ui_from_screenshot\` - Diagnose and fix UI issues from screenshots
- \`gemini_create_animation\` - Create Canvas/WebGL/CSS animations
- \`gemini_analyze_content\` - Analyze code, documents, or data
- \`gemini_analyze_codebase\` - Analyze entire codebase using 1M token context
- \`gemini_brainstorm\` - Generate creative ideas and solutions

**When to use Gemini**:
- UI/Frontend code generation (Gemini excels at WebDev)
- Converting design mockups to code (supports image input)
- Creating interactive animations and effects
- Analyzing screenshots or design images
- Large codebase analysis (1M token context)

**Usage pattern**:
1. For UI generation: Describe what you want or provide a design image
2. For debugging: Provide a screenshot of the issue
3. For animation: Describe the desired effect and technology (CSS/Canvas/WebGL)

**Note**: Gemini is Claude's AI assistant - use it for tasks where visual understanding or frontend expertise is needed.`
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