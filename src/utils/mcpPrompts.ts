/**
 * MCP (Model Context Protocol) System Prompts
 * Optimized version - Reduced token usage while maintaining core functionality
 * See CLAUDE.md for detailed documentation
 */

import { debugLog } from '../services/DebugLogger';

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
  
    'playwright': `
## Playwright
**Purpose**: Browser automation - web scraping, form filling, UI testing
**Core**: navigate, screenshot, click, fill, evaluate, save_as_pdf, resize (143+ device presets)
**File paths**: Screenshots→./CCimages/screenshots/ PDFs→./CCimages/pdfs/
**Browser fix**: If chromium error, run: npx playwright@latest install chromium`,

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

    // Grok AI assistant - for real-time web/X search and brainstorming
    'grok-assistant': `
## Grok AI Assistant
**Purpose**: Real-time web & X (Twitter) search + creative brainstorming
**Powered by**: Grok 4.20 Multi-Agent (2M context, 4-agent collaboration)

**Core Tools**:
- \`grok_agent_search\` - Real-time web and X search with source citations
  - search_type: web | x | mixed (default: mixed)
  - Supports domain filtering and X date/account filtering
- \`grok_brainstorm\` - Multi-perspective idea generation
  - style: innovative | practical | radical | balanced
  - Supports reading project files as context (up to 10 files)

**When to use Grok**:
- Real-time information lookup (news, trends, latest updates)
- X/Twitter content search and analysis
- Creative brainstorming with project context
- Fact-checking with source citations

**Note**: Requires XAI_API_KEY from console.x.ai`,

    // Gemini AI assistant - for UI generation, multimodal analysis, and creative coding
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

**Note**: Gemini is Claude's AI assistant - use it for tasks where visual understanding or frontend expertise is needed.`,

    // Codex autonomous coding agent - delegate implementation, review, debugging to OpenAI Codex
    'codex-official': `
## Codex (OpenAI)
**Purpose**: Autonomous coding agent — delegate implementation, review, and debugging tasks
**Core Tools**:
- \`codex\` - Start a session with prompt + sandbox/approval settings
  - sandbox: read-only | workspace-write | danger-full-access
  - approval-policy: untrusted | on-failure | on-request | never
  - Supports: model override, cwd, developer-instructions
- \`codex-reply\` - Continue a session by threadId for iterative refinement

**Workflow**: Claude architects the plan → delegate scoped tasks to Codex → review results
**Best practice**: Pass project context via \`developer-instructions\`, use \`codex-reply\` for multi-turn tasks
**Defaults**: sandbox='workspace-write', approval-policy='on-failure' for balanced autonomy and safety
**Note**: Requires \`npm i -g @openai/codex\` and OPENAI_API_KEY`
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

    debugLog('getMcpSystemPrompts', `Processing servers: ${mcpServers.map(s => s.name).join(', ')}`);

    for (const server of mcpServers) {
        const prompt = MCP_SYSTEM_PROMPTS[server.name];
        if (prompt) {
            debugLog('getMcpSystemPrompts', `Found prompt for ${server.name}, length: ${prompt.trim().length}`);
            prompts.push(prompt.trim());
        } else {
            debugLog('getMcpSystemPrompts', `No prompt found for ${server.name}`);
        }
    }
    
    // Add general guidance (minimal version)
    if (prompts.length > 1) {
        prompts.push('\n**Remember**: Check CLAUDE.md for detailed usage instructions.');
    }
    
    const result = prompts.join('\n');
    debugLog('getMcpSystemPrompts', 'Final result', {
        promptCount: prompts.length,
        totalLength: result.length,
        servers: mcpServers.map(s => s.name)
    });

    return result;
}