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
* **Skills**: Custom skills with hot-reload support from `~/.claude/skills/` or `./.claude/skills/`
* **Hooks**: Execute custom commands configured in `./.claude/settings.json` that respond to tool events (supports PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart, SessionEnd, Notification, PreCompact)
* **Slash Commands**: Use custom commands defined as Markdown files in `./.claude/commands/`
* **Memory (CLAUDE.md)**: Maintain project context through `CLAUDE.md` files that provide persistent instructions and context
* **Rules**: Project-specific rules from `.claude/rules/` directory

These features work identically to their Claude Code counterparts by reading from the same file system locations.

### Skills Configuration (v2.1.0+)

Skills support advanced frontmatter configuration:

```yaml
---
name: my-skill
description: A custom skill
context: fork        # 在 forked sub-agent 上下文中运行
agent: code-reviewer # 指定执行的 agent 类型
allowed-tools:       # YAML 风格的工具列表
  - Read
  - Write
  - Bash
hooks:               # skill 级别的 hooks
  PreToolUse:
    - matcher: "*"
      hooks:
        - type: prompt
          prompt: "Validate tool usage..."
once: true           # 只运行一次
user-invocable: true # 在斜杠命令菜单中显示
---
```

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
