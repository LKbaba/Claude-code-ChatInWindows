/**
 * MCP (Model Context Protocol) System Prompts
 * These prompts are dynamically added when specific MCP servers are enabled
 */

export const MCP_SYSTEM_PROMPTS: Record<string, string> = {
    'sequential-thinking': `
### Sequential Thinking Tool  
  
Use the Sequential Thinking tool to handle complex, open-ended problems with a structured thinking approach.  
  
- Break down tasks into multiple **thought steps**.  
- Each step should include:  
  1. **Clear current goal or hypothesis** (e.g., "analyze login solutions", "optimize state management structure").  
  2. **Call appropriate MCP tools** (such as search_docs, code_generator, error_explainer) to perform document searches, generate code, or explain errors. Sequential Thinking itself doesn't produce code but coordinates the process.  
  3. **Clearly record the results and outputs of this step**.  
  4. **Determine the next goal or whether to branch**, and continue the process.  
  
- When facing uncertain or ambiguous tasks:  
  - Use "branch thinking" to explore multiple solutions.  
  - Compare pros and cons of different paths, rolling back or modifying completed steps when necessary.  
  
- Each step can have the following structured metadata:  
  - thought: current thinking content  
  - thoughtNumber: current step number  
  - totalThoughts: estimated total steps  
  - nextThoughtNeeded, needsMoreThoughts: whether to continue thinking  
  - isRevision, revisesThought: whether it's a revision action and its target  
  - branchFromThought, branchId: branch starting point number and identifier  
  
- Recommended for use in these scenarios:  
  - Problem scope is vague or changes with requirements  
  - Needs continuous iteration, revision, exploring multiple solutions  
  - Cross-step context consistency is particularly important  
  - Need to filter irrelevant or distracting information`,

    'context7': `
### Context7 Documentation Integration Tool  
  
Use [Context7](https://github.com/upstash/context7) to fetch the latest official documentation and code examples for specific versions, improving code generation accuracy and currency.  
  
- **Purpose**: Solve the model's outdated knowledge problem, avoiding generation of deprecated or incorrect API usage.  
  
- **Usage**:  
  1. **Invocation**: Add \`use context7\` in the prompt to trigger document retrieval.  
  2. **Fetch documents**: Context7 will pull relevant documentation fragments for the framework/library in use.  
  3. **Integrate content**: Reasonably integrate the fetched examples and explanations into your code generation or analysis.  
  
- **Use on demand**: **Only call Context7 when needed**, such as when APIs are ambiguous, version differences are significant, or users request official usage references. Avoid unnecessary calls to save tokens and improve response efficiency.  
  
- **Integration**:  
  - Supports MCP clients like Cursor, Claude Desktop, Windsurf.  
  - Configure server-side Context7 integration to get the latest reference materials in context.  
  
- **Advantages**:  
  - Improve code accuracy, reduce hallucinations and errors from outdated knowledge.  
  - Avoid relying on framework information that was outdated at training time.  
  - Provide clear, authoritative technical reference materials.`,
  
    'basic-memory': `
### Basic Memory Knowledge Persistence Tool

Use Basic Memory tool to build and maintain a persistent knowledge base, supporting memory of important information, searching historical conversations, and creating knowledge graphs.

**Main Features**:
- **write_note**: Create or update knowledge notes
- **read_note**: Read specific note content
- **search_notes**: Full-text search across the knowledge base
- **recent_activity**: View recent activities and updates
- **build_context**: Build relevant context
- **canvas**: Create visual knowledge graphs

**Use Cases**:
- Save important project information and decision records
- Record technical implementation details and best practices
- Maintain meeting minutes and discussion points
- Build personal or team knowledge bases
- Track task progress and to-do items

**Note Organization**:
- Use folder structure to organize notes (e.g., projects/my-app, meetings/2024-01)
- Support tag system for easy categorization and retrieval
- Automatically extract entities and relationships to build knowledge networks

**Best Practices**:
- Create separate notes for each important topic
- Use descriptive titles for easy future searching
- Regularly review and update knowledge base content
- Utilize canvas feature to visualize complex concept relationships`
};

/**
 * Get system prompts for enabled MCP servers
 * @param mcpServers Array of MCP server configurations
 * @returns Combined system prompt string
 */
export function getMcpSystemPrompts(mcpServers: Array<{ name: string }>): string {
    const prompts: string[] = [];
    
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
    
    const result = prompts.length > 0 ? prompts.join('\n\n---\n\n') : '';
    console.log('[getMcpSystemPrompts] Final result:', {
        promptCount: prompts.length,
        totalLength: result.length,
        servers: mcpServers.map(s => s.name)
    });
    
    return result;
}