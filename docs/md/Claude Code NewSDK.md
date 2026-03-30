# Overview

> Build custom AI agents with the Claude Agent SDK (formerly Claude Code SDK)

## ⚠️ 重要更名通知

**Claude Code SDK 已更名为 Claude Agent SDK**

| 变更项 | 旧名称 | 新名称 |
|--------|--------|--------|
| TypeScript 包 | `@anthropic-ai/claude-code` | `@anthropic-ai/claude-agent-sdk` |
| Python 包 | `claude-code-sdk` | `claude-agent-sdk` |
| Python 类型 | `ClaudeCodeOptions` | `ClaudeAgentOptions` |
| 文档位置 | Claude Code docs | API Guide → Agent SDK |

### 迁移步骤

**TypeScript:**
```bash
npm uninstall @anthropic-ai/claude-code
npm install @anthropic-ai/claude-agent-sdk
```

**Python:**
```bash
pip uninstall claude-code-sdk
pip install claude-agent-sdk
```

### 破坏性变更 (v0.1.0+)

1. **系统提示不再默认加载**: 需要显式设置 `systemPrompt: { type: 'preset', preset: 'claude_code' }`
2. **设置源不再自动加载**: 需要显式设置 `settingSources: ['user', 'project', 'local']` 来加载文件系统设置
3. **Python 类型重命名**: `ClaudeCodeOptions` → `ClaudeAgentOptions`

## SDK Options

The Claude Agent SDK is available in multiple forms to suit different use cases:

* **[Headless Mode](/en/docs/claude-code/sdk/sdk-headless)** - For CLI scripts and automation
* **[TypeScript SDK](/en/docs/claude-code/sdk/sdk-typescript)** - For Node.js and web applications
* **[Python SDK](/en/docs/claude-code/sdk/sdk-python)** - For Python applications and data science
* **[Streaming vs Single Mode](/en/docs/claude-code/sdk/streaming-vs-single-mode)** - Understanding input modes and best practices

## What's New in v2.1.0

### Skills Hot-Reload
Skills created or modified in `~/.claude/skills` or `.claude/skills` are now immediately available without restarting the session.

### Forked Sub-agent Context
Run skills and slash commands in a forked sub-agent context using `context: fork` in skill frontmatter.

### Agent Field in Skills
New `agent` field in skills to specify agent type for execution.

### Language Setting
Configure Claude's response language with the `language` setting (e.g., `language: "japanese"`).

### Wildcard Pattern Matching
Bash tool permissions now support wildcard patterns using `*` at any position (e.g., `Bash(npm *)`, `Bash(* install)`, `Bash(git * main)`).

### MCP `list_changed` Notifications
Support for MCP `list_changed` notifications, allowing MCP servers to dynamically update their available tools, prompts, and resources without reconnection.

### Agent-Scoped Hooks
Hooks support in agent frontmatter, including PreToolUse, PostToolUse, and Stop hooks scoped to the agent's lifecycle.

### Task Agent Disabling
Disable specific agents using `Task(AgentName)` syntax in settings.json permissions or `--disallowedTools` CLI flag.

### New Vim Motions
Added new Vim motions including `;` and `,` for repeat f/F/t/T, `y` operator for yank, `p`/`P` for paste, text objects, `>>` and `<<` for indent/dedent, and `J` to join lines.

### LSP Tool
LSP (Language Server Protocol) tool for code intelligence features like go-to-definition, find references, and hover documentation (added in v2.0.74).

### Named Session Support
Use `/rename` to name sessions, `/resume <name>` in REPL or `claude --resume <name>` from terminal (added in v2.0.64).

## What's New Since v2.1.0

### Expanded Hook Event System (25+ Events)

Hooks now cover the full agent lifecycle. The complete list of supported hook events:

| Category | Events |
|----------|--------|
| Session lifecycle | `SessionStart`, `SessionEnd` |
| User interaction | `UserPromptSubmit`, `Notification`, `Elicitation`, `ElicitationResult` |
| Tool execution | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` |
| Agent lifecycle | `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`, `TeammateIdle` |
| Task lifecycle | `TaskCreated`, `TaskCompleted` |
| Configuration | `InstructionsLoaded`, `ConfigChange` |
| File system | `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove` |
| Compaction | `PreCompact`, `PostCompact` |

> Note: `PostToolUseFailure` fires when a tool call returns an error result, distinct from `PostToolUse` which fires on success. `StopFailure` fires when the agent aborts due to an unrecoverable error.

### New Hook Types

Three hook execution models are now supported:

| Type | Description |
|------|-------------|
| `command` | Execute a shell command (original behavior) |
| `prompt` | Single-turn LLM evaluation — Claude reads the hook output and decides whether to proceed |
| `agent` | Multi-turn verification with full tool access — a sub-agent runs to completion before the main flow continues |
| `http` | POST the event payload to a URL; response body is fed back to the agent |

```json
// settings.json — hook type examples
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Review the bash command for safety. Reply BLOCK if it should not run."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "http",
            "url": "https://my-audit-service.example.com/hook"
          }
        ]
      }
    ]
  }
}
```

### Argument-Level Hook Filtering with `if` Field (v2.1.85+)

The `if` field on a hook entry provides a secondary filter evaluated against the tool arguments after `matcher` selects the tool name. Supports glob patterns and simple expressions.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'git push detected'",
            "if": "input.command contains 'git push'"
          }
        ]
      }
    ]
  }
}
```

### Session History API

Read past sessions programmatically without reopening them:

```typescript
import { listSessions, getSessionMessages, getSessionInfo } from '@anthropic-ai/claude-agent-sdk';

// List all sessions for a project
const sessions = await listSessions({ projectPath: '/path/to/project' });

// Get all messages from a session
const messages = await getSessionMessages(sessionId);

// Get metadata (model, timestamps, token counts)
const info = await getSessionInfo(sessionId);
```

### Session Mutations API

Manage sessions from SDK code rather than the REPL:

```typescript
import { renameSession, tagSession, forkSession } from '@anthropic-ai/claude-agent-sdk';

await renameSession(sessionId, 'my-refactor-session');
await tagSession(sessionId, ['approved', 'production']);

// Fork creates a new session branching from a specific message index
const forkedId = await forkSession(sessionId, { fromMessageIndex: 42 });
```

### MCP Server Runtime Management

Inspect and control MCP servers at runtime without restarting the agent:

```typescript
import { mcpServerStatus, reconnectMcpServer, toggleMcpServer } from '@anthropic-ai/claude-agent-sdk';

// Check current state of all configured MCP servers
const statuses = await mcpServerStatus();

// Reconnect a server that dropped its connection
await reconnectMcpServer('my-database-server');

// Disable/enable a server without removing its config
await toggleMcpServer('my-database-server', false);
```

### Task Progress Events

Long-running agents now emit structured progress events you can stream:

| Event | When it fires |
|-------|--------------|
| `task_started` | Agent begins a new top-level task |
| `task_progress` | Periodic update with percentage and current step description |
| `task_notification` | Agent wants to surface a message without blocking |

```typescript
for await (const event of agent.stream()) {
  if (event.type === 'task_progress') {
    console.log(`${event.percent}% — ${event.step}`);
  }
}
```

Enable progress summaries by setting `agentProgressSummaries: true` in options. When enabled, the agent periodically emits a human-readable summary of what it has accomplished so far.

### Effort Parameter (GA)

The `effort` parameter graduated from beta to general availability. Set it via `output_config`:

```typescript
const result = await query({
  prompt: 'Refactor this module for testability',
  output_config: {
    effort: 'high'   // 'low' | 'medium' | 'high' | 'max'
  }
});
```

| Level | Behavior |
|-------|----------|
| `low` | Minimal reasoning, fastest and cheapest |
| `medium` | Balanced (default) |
| `high` | Extended reasoning, higher quality on complex tasks |
| `max` | Maximum reasoning budget — use for the hardest tasks |

> See also: [Thinking and Effort.md](Thinking%20and%20Effort.md) for budget_tokens migration notes.

### Adaptive Thinking (Opus 4.6 / Sonnet 4.6)

On `claude-opus-4-6` and `claude-sonnet-4-6`, setting `effort` activates **adaptive thinking** rather than a fixed `budget_tokens` value. The model dynamically decides how much reasoning to apply based on task complexity. Explicit `budget_tokens` is still accepted for backward compatibility but is ignored on these models when `effort` is also set.

> See: [Models Reference.md](Models%20Reference.md) for the full model capability matrix.

### Compaction (Beta)

Server-side context compression for long-running conversations. When the context window approaches its limit, the server condenses earlier turns into a compact summary rather than truncating them. Opt in per-request:

```typescript
const result = await query({
  prompt: '...',
  compaction: { enabled: true, strategy: 'auto' }
});
```

Hook events `PreCompact` and `PostCompact` fire before and after each compaction cycle, letting you inspect or veto the operation.

### Commands Merged into Skills

Slash commands and skills are now unified under the Skills system. Files in `.claude/commands/` continue to work but are treated as skills with `user-invocable: true` set implicitly. Going forward, place all slash-command definitions in `.claude/skills/` with explicit frontmatter.

## Why use the Claude Agent SDK?

Built on top of the agent harness that powers Claude Code, the Claude Agent SDK provides all the building blocks you need to build production-ready agents.

Taking advantage of the work we've done on Claude Code including:

* **Context Management**: Automatic compaction and context management to ensure your agent doesn't run out of context.
* **Rich tool ecosystem**: File operations, code execution, web search, and MCP extensibility
* **Advanced permissions**: Fine-grained control over agent capabilities
* **Production essentials**: Built-in error handling, session management, and monitoring
* **Optimized Claude integration**: Automatic prompt caching and performance optimizations

## What can you build with the SDK?

Here are some example agent types you can create:

**Coding agents:**

* SRE agents that diagnose and fix production issues
* Security review bots that audit code for vulnerabilities
* Oncall engineering assistants that triage incidents
* Code review agents that enforce style and best practices

**Business agents:**

* Legal assistants that review contracts and compliance
* Finance advisors that analyze reports and forecasts
* Customer support agents that resolve technical issues
* Content creation assistants for marketing teams

## Core Concepts

### Authentication

For basic authentication, retrieve an Anthropic API key from the [Anthropic Console](https://console.anthropic.com/) and set the `ANTHROPIC_API_KEY` environment variable.

The SDK also supports authentication via third-party API providers:

* **Amazon Bedrock**: Set `CLAUDE_CODE_USE_BEDROCK=1` environment variable and configure AWS credentials
* **Google Vertex AI**: Set `CLAUDE_CODE_USE_VERTEX=1` environment variable and configure Google Cloud credentials

For detailed configuration instructions for third-party providers, see the [Amazon Bedrock](/en/docs/claude-code/amazon-bedrock) and [Google Vertex AI](/en/docs/claude-code/google-vertex-ai) documentation.

### Full Claude Code Feature Support

The SDK provides access to all the default features available in Claude Code, leveraging the same file system-based configuration:

* **Subagents**: Launch specialized agents stored as Markdown files in `./.claude/agents/`
* **Skills**: Custom skills with hot-reload support from `~/.claude/skills/` or `./.claude/skills/`; commands are now unified under this system
* **Hooks**: Execute custom commands configured in `./.claude/settings.json` responding to 25+ lifecycle events:
  `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, `ElicitationResult`
* **Slash Commands**: Legacy `./.claude/commands/` files continue to work; new definitions go in `./.claude/skills/`
* **Memory (CLAUDE.md)**: Maintain project context through `CLAUDE.md` files that provide persistent instructions and context
* **Rules**: Project-specific rules from `.claude/rules/` directory

These features work identically to their Claude Code counterparts by reading from the same file system locations.

### Skills Configuration (v2.1.0+)

Skills support advanced frontmatter configuration. All currently recognized fields:

```yaml
---
name: my-skill
description: A custom skill

# Execution context
context: fork        # 在 forked sub-agent 上下文中运行 (fork | default)
agent: code-reviewer # 指定执行的 agent 类型

# Tool access
allowed-tools:       # YAML 风格的工具列表
  - Read
  - Write
  - Bash

# Invocation
once: true           # 只运行一次 (subsequent invocations are no-ops)
user-invocable: true # 在斜杠命令菜单中显示
argument-hint: "path/to/file [--flag]"  # 用于命令补全的参数提示文字

# Activation
paths:               # Glob patterns — skill auto-activates when matched files are in context
  - "src/**/*.ts"
  - "*.config.js"

# Shell environment
shell: powershell    # Shell to use when running Bash tool calls (bash | powershell | cmd)

# Reasoning effort
effort: high         # Reasoning effort for this skill (low | medium | high | max)

# Lifecycle hooks scoped to this skill's execution
hooks:
  PreToolUse:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: "Validate tool usage..."
---
```

#### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique skill identifier |
| `description` | string | Human-readable purpose; shown in slash command menu |
| `context` | `fork` \| `default` | Execution context; `fork` isolates the skill in a sub-agent |
| `agent` | string | Agent definition to use for execution |
| `allowed-tools` | list | Tools the skill may call |
| `once` | boolean | Prevent repeat execution in the same session |
| `user-invocable` | boolean | Show in the `/` command palette |
| `argument-hint` | string | Completion hint displayed next to the command name |
| `paths` | glob list | File patterns that trigger automatic skill activation |
| `shell` | `bash` \| `powershell` \| `cmd` | Shell used for Bash tool invocations within this skill |
| `effort` | `low`\|`medium`\|`high`\|`max` | Reasoning effort for this skill's model calls |
| `hooks` | object | Hook handlers scoped to this skill's lifecycle |

> Note: `paths` and `shell` require v2.1.0+; `effort` and `argument-hint` require v2.1.85+. See [Skills.md](Skills.md) for the full authoring guide.

### System Prompts

System prompts define your agent's role, expertise, and behavior. This is where you specify what kind of agent you're building.

### Tool Permissions

Control which tools your agent can use with fine-grained permissions:

* `allowedTools` - Explicitly allow specific tools
* `disallowedTools` - Block specific tools
* `permissionMode` - Set overall permission strategy

### Model Context Protocol (MCP)

Extend your agents with custom tools and integrations through MCP servers. This allows you to connect to databases, APIs, and other external services.

## Related Resources

* [CLI Reference](/en/docs/claude-code/cli-reference) - Complete CLI documentation
* [GitHub Actions Integration](/en/docs/claude-code/github-actions) - Automate your GitHub workflow
* [MCP Documentation](/en/docs/claude-code/mcp) - Extend Claude with custom tools
* [Common Workflows](/en/docs/claude-code/common-workflows) - Step-by-step guides
* [Troubleshooting](/en/docs/claude-code/troubleshooting) - Common issues and solutions

## Local Documentation Cross-References

The following files in `docs/md/` cover topics referenced in this document:

| File | What it covers |
|------|---------------|
| [Hooks Guide.md](Hooks%20Guide.md) | Complete hook event reference, all hook types, `if` field syntax, debugging hooks |
| [Skills.md](Skills.md) | Full skills authoring guide, frontmatter field reference, `paths` activation, `shell` field |
| [Models Reference.md](Models%20Reference.md) | Model capability matrix, adaptive thinking support, context window sizes |
| [Thinking and Effort.md](Thinking%20and%20Effort.md) | `effort` vs `budget_tokens`, adaptive thinking on Opus 4.6 / Sonnet 4.6, migration guide |
| [Claude Code NewSDK.md](Claude%20Code%20NewSDK.md) | This file — SDK overview and feature changelog |
