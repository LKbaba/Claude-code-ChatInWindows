# Subagents in the SDK

Working with subagents in the Claude Agent SDK (v2.1.0+)

Subagents in the Claude Agent SDK are specialized AIs that are orchestrated by the main agent.
Use subagents for context management and parallelization.
This guide explains how SDK applications interact with and utilize subagents that are created via markdown files or defined programmatically.

## What's New in v2.1.0

- **Agent-scoped hooks**: Define PreToolUse, PostToolUse, and Stop hooks in agent frontmatter
- **Disable specific agents**: Use `Task(AgentName)` syntax in `--disallowedTools` or settings.json permissions
- **SubagentStop hooks**: Configure hooks to execute when a subagent considers stopping
- **SubagentStart/SubagentStop events**: Hook events fire at the start and end of each subagent invocation (see [Hook Events](#hook-events))
- **Improved subagent inheritance**: Subagents now properly inherit the parent's model by default
- **Async agent support**: Agents can run asynchronously and send messages to wake up the main agent
- **Background agent tokens**: Spinner token counter properly accumulates tokens from subagents

## Overview

Subagents can be created in two ways:

1. **Filesystem agents** — markdown files with YAML frontmatter placed in `.claude/agents/*.md`
2. **Programmatic agents** — defined inline via the `agents` option in the SDK `query()` call

The SDK can invoke both types during execution.

## Benefits of Using Subagents

### Context Management

Subagents maintain separate context from the main agent, preventing information overload and keeping interactions focused. This isolation ensures that specialized tasks don't pollute the main conversation context with irrelevant details.

**Example**: A `research-assistant` subagent can explore dozens of files and documentation pages without cluttering the main conversation with all the intermediate search results — only returning the relevant findings.

### Parallelization

Multiple subagents can run concurrently, dramatically speeding up complex workflows.

**Example**: During a code review, you can run `style-checker`, `security-scanner`, and `test-coverage` subagents simultaneously, reducing review time from minutes to seconds.

### Specialized Instructions and Knowledge

Each subagent can have tailored system prompts with specific expertise, best practices, and constraints.

**Example**: A `database-migration` subagent can have detailed knowledge about SQL best practices, rollback strategies, and data integrity checks that would be unnecessary noise in the main agent's instructions.

### Tool Restrictions

Subagents can be limited to specific tools, reducing the risk of unintended actions.

**Example**: A `doc-reviewer` subagent might only have access to Read and Grep tools, ensuring it can analyze but never accidentally modify your documentation files.

## Programmatic Agents (Defined in Code)

The `agents` option in `query()` lets you define subagents directly in your TypeScript or Python code without creating any filesystem files. This is useful for dynamically generated agent configurations or for keeping everything in one place.

### AgentDefinition Type

```typescript
type AgentDefinition = {
  description: string;           // Natural language description of when to use
  tools?: string[];              // Allowed tool names
  disallowedTools?: string[];    // Tools to disallow
  prompt: string;                // System prompt
  model?: "sonnet" | "opus" | "haiku" | "inherit";
  mcpServers?: AgentMcpServerSpec[];  // MCP servers for this agent
  skills?: string[];             // Skills to preload
  maxTurns?: number;             // Max agentic turns
  criticalSystemReminder_EXPERIMENTAL?: string;
};
```

### TypeScript Example

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Review the authentication module for security issues",
  options: {
    agents: {
      "security-reviewer": {
        description: "Use for security-focused code review tasks",
        tools: ["Read", "Grep", "Glob"],
        prompt: "You are a security expert. Analyze code for vulnerabilities including injection attacks, improper authentication, and insecure data handling.",
        model: "opus",
        maxTurns: 10
      }
    }
  }
})) {
  if (message.type === "assistant") {
    console.log(message.message.content);
  }
}
```

### Python Example

```python
from claude_agent_sdk import query

async for message in query(
    prompt="Review the authentication module for security issues",
    options={
        "agents": {
            "security-reviewer": {
                "description": "Use for security-focused code review tasks",
                "tools": ["Read", "Grep", "Glob"],
                "prompt": "You are a security expert. Analyze code for vulnerabilities including injection attacks, improper authentication, and insecure data handling.",
                "model": "opus",
                "max_turns": 10
            }
        }
    }
):
    if message["type"] == "assistant":
        print(message["message"]["content"])
```

## Filesystem Agents (Defined in `.claude/agents/`)

Filesystem agents are defined as markdown files in specific directories:

- **Project-level**: `.claude/agents/*.md` — Available only in the current project
- **User-level**: `~/.claude/agents/*.md` — Available across all projects

### File Format

Each subagent is a markdown file with YAML frontmatter:

```markdown
---
name: code-reviewer
description: Expert code review specialist. Use for quality, security, and maintainability reviews.
tools: Read, Grep, Glob, Bash  # Optional - inherits all tools if omitted
---

Your subagent's system prompt goes here. This defines the subagent's
role, capabilities, and approach to solving problems.

Include specific instructions, best practices, and any constraints
the subagent should follow.
```

### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier using lowercase letters and hyphens |
| `description` | Yes | Natural language description of when to use this subagent |
| `tools` | No | Comma-separated list of allowed tools. If omitted, inherits all tools |
| `model` | No | Model to use for this agent (e.g., `inherit`, `claude-sonnet-4`, `claude-opus-4`) |
| `color` | No | Color for agent identification (e.g., `blue`, `green`, `red`) |
| `hooks` | No | Agent-scoped hooks for PreToolUse, PostToolUse, Stop events (v2.1.0+) |

### Agent Frontmatter with Hooks (v2.1.0+)

```markdown
---
name: secure-code-reviewer
description: Security-focused code reviewer with validation hooks
model: inherit
color: red
tools: Read, Grep, Glob
hooks:
  PreToolUse:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: "Verify this tool usage is security-safe"
  Stop:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: "Ensure all security checks are complete before stopping"
---

You are a security-focused code reviewer...
```

## Programmatic vs. Filesystem Agents: When to Use Each

| Consideration | Programmatic (`agents` option) | Filesystem (`.claude/agents/*.md`) |
|---|---|---|
| **Definition location** | Inline in code | Separate markdown files |
| **Versioning** | With source code | As standalone files (can be in repo) |
| **Dynamic configuration** | Yes — build agent config at runtime | No — static files |
| **Shared across projects** | No — per `query()` call | Yes — via `~/.claude/agents/` |
| **Team discoverability** | Requires reading source | Self-documenting via `/agents` command |
| **Frontmatter hooks** | Not available | Available (v2.1.0+) |
| **Best for** | CI scripts, dynamic workflows, SDK-only tools | Persistent team agents, multi-project reuse |

Use programmatic agents when agent configuration is derived from runtime state (e.g., project metadata, environment variables). Use filesystem agents when the configuration is stable, reusable, or needs to be shared with the whole team.

## Hook Events

### SubagentStart and SubagentStop

Two hook events fire around each subagent invocation:

- **`SubagentStart`** — fires just before the subagent begins its first turn. The event payload includes the agent name and its initial prompt.
- **`SubagentStop`** — fires when the subagent finishes all turns and returns control to the orchestrator. The payload includes the agent name and exit reason.

These events are available in both agent-scoped frontmatter hooks and in the global hooks configuration (`settings.json` or `--hooks`). Use them for logging, audit trails, or enforcing checkpoints between agent handoffs.

```markdown
---
name: deployment-agent
description: Handles deployment operations
hooks:
  Stop:
    - matcher: "*"
      hooks:
        - type: command
          command: "echo 'Deployment agent completed' >> /tmp/agent-log.txt"
---
```

## How the SDK Uses Subagents

When using the Claude Agent SDK, subagents defined in the filesystem are automatically available. Claude Code will:

- **Auto-detect subagents** from `.claude/agents/` directories
- **Merge with programmatic agents** passed via the `agents` option
- **Invoke them automatically** based on task matching
- **Use their specialized prompts** and tool restrictions
- **Maintain separate context** for each subagent invocation

If a name appears in both the `agents` option and the filesystem, the programmatic definition takes precedence.

## Example Subagents

For comprehensive examples of subagents including code reviewers, test runners, debuggers, and security auditors, see the [main Subagents guide](/en/docs/claude-code/subagents). The guide includes detailed configurations and best practices for creating effective subagents.

## SDK Integration Patterns

### Automatic Invocation

The SDK will automatically invoke appropriate subagents based on the task context. Ensure your subagent's `description` field clearly indicates when it should be used:

```markdown
---
name: performance-optimizer
description: Use PROACTIVELY when code changes might impact performance. MUST BE USED for optimization tasks.
tools: Read, Edit, Bash, Grep
---
```

### Explicit Invocation

Users can request specific subagents in their prompts:

```typescript
// When using the SDK, users can explicitly request subagents:
const result = await query({
  prompt: "Use the code-reviewer subagent to check the authentication module"
});
```

### Tool Restrictions

Subagents can have restricted tool access via the `tools` field:

- **Omit the field** — Subagent inherits all available tools (default)
- **Specify tools** — Subagent can only use listed tools

Example of a read-only analysis subagent:

```markdown
---
name: code-analyzer
description: Static code analysis and architecture review
tools: Read, Grep, Glob  # No write or execute permissions
---

You are a code architecture analyst. Analyze code structure,
identify patterns, and suggest improvements without making changes.
```

## Related Documentation

- [Main Subagents Guide](/en/docs/claude-code/subagents) - Comprehensive subagent documentation
- [SDK Configuration Guide](/en/docs/claude-code/sdk/sdk-configuration) - Overview of configuration approaches
- [Settings](/en/docs/claude-code/configuration/settings) - Configuration file reference
- [Slash Commands](/en/docs/claude-code/slash-commands) - Custom command creation
