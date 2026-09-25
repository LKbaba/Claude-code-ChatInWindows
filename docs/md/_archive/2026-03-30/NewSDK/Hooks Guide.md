# Claude Code Hooks Guide

> **Source**: Synthesized from the official Claude Code documentation at `code.claude.com/docs/en/hooks-guide` and `code.claude.com/docs/en/hooks`. Last fetched 2026-03-30.

---

## 概述

Hooks（钩子）是用户自定义的 shell 命令，在 Claude Code 生命周期的特定时间点自动执行。通过 hooks，你可以：

- **确定性控制**：让某些操作始终发生，而不是依赖 LLM 决定是否执行
- **自动化工作流**：文件格式化、发送通知、验证命令、强制执行项目规则
- **决策拦截**：在工具调用执行前/后注入逻辑，或完全阻止某些操作
- **集成外部工具**：通过 HTTP hooks 接入 Web 服务、云函数、审计系统

Hooks 配置在 `settings.json` 文件中，支持四种执行类型：`command`（shell 命令）、`http`（HTTP 请求）、`prompt`（LLM 判断）、`agent`（子 Agent 验证）。

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Hook Events Reference Table](#hook-events-reference-table)
3. [Hook Types](#hook-types)
4. [Configuration Location](#configuration-location)
5. [Matcher Syntax](#matcher-syntax)
6. [The `if` Field (v2.1.85+)](#the-if-field-v2185)
7. [Input / Output Protocol](#input--output-protocol)
8. [Exit Code Semantics](#exit-code-semantics)
9. [JSON Output Format](#json-output-format)
10. [Decision Control by Event](#decision-control-by-event)
11. [Detailed Event Schemas](#detailed-event-schemas)
12. [Environment Variables](#environment-variables)
13. [HTTP Hooks](#http-hooks)
14. [Async Hooks](#async-hooks)
15. [Prompt-Based Hooks](#prompt-based-hooks)
16. [Agent-Based Hooks](#agent-based-hooks)
17. [MCP Tool Hooks](#mcp-tool-hooks)
18. [Common Patterns](#common-patterns)
19. [Troubleshooting](#troubleshooting)

---

## Quick Start

Add a `hooks` block to a settings file to create your first hook. This example sends a desktop notification whenever Claude is waiting for your input.

Open `~/.claude/settings.json` and add:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

After saving, type `/hooks` in Claude Code to open the hooks browser and verify the hook appears. Select an event to see all configured hooks for it.

> The `/hooks` menu is read-only. To modify hooks, edit your settings JSON directly or ask Claude to make the change.

---

## Hook Events Reference Table

All 25 hook events, their matcher field, blocking capability, and decision pattern:

| Event | Matcher Filters On | Can Block | Decision Pattern |
|:------|:-------------------|:----------|:-----------------|
| `SessionStart` | session source: `startup`, `resume`, `clear`, `compact` | No | `additionalContext` only |
| `UserPromptSubmit` | no matcher support | Yes | Top-level `decision: "block"` |
| `PreToolUse` | tool name | Yes | `hookSpecificOutput.permissionDecision` |
| `PermissionRequest` | tool name | Yes | `hookSpecificOutput.decision.behavior` |
| `PostToolUse` | tool name | No (sends feedback) | Top-level `decision: "block"` |
| `PostToolUseFailure` | tool name | No | `additionalContext` |
| `Notification` | notification type: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` | No | `additionalContext` only |
| `SubagentStart` | agent type: `Bash`, `Explore`, `Plan`, or custom | No | `additionalContext` |
| `SubagentStop` | agent type | Yes | Same as `Stop` |
| `TaskCreated` | no matcher support | Yes | Exit 2 or `continue: false` |
| `TaskCompleted` | no matcher support | Yes | Exit 2 or `continue: false` |
| `Stop` | no matcher support | Yes | Top-level `decision: "block"` |
| `StopFailure` | error type: `rate_limit`, `authentication_failed`, `billing_error`, `invalid_request`, `server_error`, `max_output_tokens`, `unknown` | No | None (logging/alerting only) |
| `TeammateIdle` | no matcher support | Yes | Exit 2 or `continue: false` |
| `InstructionsLoaded` | load reason: `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact` | No | None (observability only) |
| `ConfigChange` | config source: `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` | Yes | Top-level `decision: "block"` |
| `CwdChanged` | no matcher support | No | None |
| `FileChanged` | filename (basename of changed file) | No | None |
| `WorktreeCreate` | no matcher support | Yes | Print path to stdout |
| `WorktreeRemove` | no matcher support | No | None (debug logging only) |
| `PreCompact` | compaction trigger: `manual`, `auto` | No | None |
| `PostCompact` | compaction trigger: `manual`, `auto` | No | None |
| `Elicitation` | MCP server name | Yes | `hookSpecificOutput.action` |
| `ElicitationResult` | MCP server name | Yes | `hookSpecificOutput.action` |
| `SessionEnd` | session end reason: `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` | No | None |

When an event fires, all matching hooks run in parallel. Identical hook commands are automatically deduplicated.

---

## Hook Types

Each hook handler has a `type` field that determines how it executes:

### `command` (default)

Runs a shell command. The most common type. Communicates via stdin/stdout/stderr and exit codes.

```json
{
  "type": "command",
  "command": "npx prettier --write $(jq -r '.tool_input.file_path')"
}
```

### `http`

POSTs event data as JSON to an HTTP endpoint. Useful for integrating with external services, audit systems, or shared team infrastructure. See [HTTP Hooks](#http-hooks).

```json
{
  "type": "http",
  "url": "https://audit.example.com/hooks/tool-use",
  "headers": { "Authorization": "Bearer $MY_TOKEN" },
  "allowedEnvVars": ["MY_TOKEN"]
}
```

### `prompt`

Sends the hook input and a prompt to a Claude model (Haiku by default) for a single-turn yes/no decision. Useful when judgment is needed rather than deterministic rules. See [Prompt-Based Hooks](#prompt-based-hooks).

```json
{
  "type": "prompt",
  "prompt": "Is this operation safe? Return {\"ok\": true} or {\"ok\": false, \"reason\": \"...\"}.",
  "model": "claude-haiku-4-5",
  "timeout": 30
}
```

### `agent`

Spawns a subagent that can read files, run commands, and use tools before returning a decision. More capable than `prompt` but slower. See [Agent-Based Hooks](#agent-based-hooks).

```json
{
  "type": "agent",
  "prompt": "Verify the test suite passes after these changes. $ARGUMENTS",
  "timeout": 120
}
```

---

## Configuration Location

Where you place a settings file determines the scope of its hooks:

| Settings File | Scope | Shareable |
|:-------------|:------|:----------|
| `~/.claude/settings.json` | All your projects (global) | No — local to your machine |
| `.claude/settings.json` | Single project | Yes — can be committed to the repo |
| `.claude/settings.local.json` | Single project | No — gitignored |
| Managed policy settings | Organization-wide | Yes — admin-controlled |
| Plugin `hooks/hooks.json` | When the plugin is enabled | Yes — bundled with the plugin |
| Skill or agent frontmatter | While the skill or agent is active | Yes — defined in the component file |

To disable all hooks at once, set `"disableAllHooks": true` in your settings file. The file watcher normally picks up live edits automatically while Claude Code is running.

---

## Matcher Syntax

Matchers are regex patterns that filter which hook instances run. Without a matcher (empty string or omitted), the hook fires on every occurrence of the event.

### Matcher fields by event

| Event | What the matcher filters |
|:------|:------------------------|
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | Tool name |
| `SessionStart` | How the session started: `startup`, `resume`, `clear`, `compact` |
| `SessionEnd` | Why the session ended: `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| `Notification` | Notification type: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| `SubagentStart`, `SubagentStop` | Agent type: `Bash`, `Explore`, `Plan`, or custom agent names |
| `PreCompact`, `PostCompact` | Compaction trigger: `manual`, `auto` |
| `ConfigChange` | Config source: `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |
| `StopFailure` | Error type: `rate_limit`, `authentication_failed`, `billing_error`, `invalid_request`, `server_error`, `max_output_tokens`, `unknown` |
| `InstructionsLoaded` | Load reason: `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact` |
| `Elicitation`, `ElicitationResult` | MCP server name |
| `FileChanged` | Filename (basename of the changed file) |
| `UserPromptSubmit`, `Stop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `CwdChanged` | No matcher support — always fires |

### Matcher examples

```json
"matcher": "Bash"                // exact match: Bash tool only
"matcher": "Edit|Write"          // alternation: Edit or Write tool
"matcher": "mcp__.*"             // regex: any MCP tool
"matcher": "mcp__github__.*"     // regex: any tool from the github MCP server
"matcher": "mcp__.*__write.*"    // regex: any write tool on any MCP server
"matcher": "compact"             // exact match: compact session start
"matcher": ".envrc|.env"         // alternation: FileChanged on .envrc or .env
"matcher": ""                    // empty string: fire on every occurrence
```

Matchers are case-sensitive and applied against the specific field listed in the table above.

---

## The `if` Field (v2.1.85+)

> Requires Claude Code v2.1.85 or later. Earlier versions ignore this field and run the hook on every matched call.

The `if` field provides finer-grained filtering using [permission rule syntax](https://code.claude.com/docs/en/permissions). Unlike `matcher` (which filters at the group level by tool name), `if` evaluates tool name **and arguments together** — so the hook process only spawns when the actual arguments match.

This goes inside the individual hook handler object, not the matcher group.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(git *)",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-git-policy.sh"
          }
        ]
      }
    ]
  }
}
```

The hook process only spawns when the Bash command starts with `git`. All other Bash commands skip this handler entirely.

`if` accepts the same patterns as permission rules:
- `"Bash(git *)"` — Bash commands starting with `git`
- `"Edit(*.ts)"` — edits to TypeScript files
- `"Write(src/*)"` — writes to the `src/` directory

**Limitation**: `if` only works on tool events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, and `PermissionRequest`. Adding it to any other event type prevents the hook from running.

---

## Input / Output Protocol

Hooks communicate with Claude Code through stdin, stdout, stderr, and exit codes.

### Common input fields (all events)

Every hook receives these fields on stdin:

```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  // Present only when inside a subagent:
  "agent_id": "agent-abc123",
  "agent_type": "Explore"
}
```

`permission_mode` values: `"default"` | `"plan"` | `"acceptEdits"` | `"auto"` | `"dontAsk"` | `"bypassPermissions"`

Each event type adds additional fields — see [Detailed Event Schemas](#detailed-event-schemas).

### Common JSON output fields

These fields are valid in the JSON output of any hook event:

```json
{
  "continue": false,           // Stop Claude entirely (applies to all events)
  "stopReason": "message",     // Message shown to user when continue=false
  "suppressOutput": false,     // Hide stdout from verbose mode display
  "systemMessage": "warning"   // Warning shown to user as a system message
}
```

---

## Exit Code Semantics

| Exit Code | Behavior |
|:----------|:---------|
| `0` | Success. Claude Code parses stdout for JSON output. For `UserPromptSubmit` and `SessionStart`, plain text stdout is added to Claude's context. |
| `2` | Blocking error. The action is blocked. Write a reason to stderr — Claude receives it as feedback so it can adjust its approach. JSON output on exit 2 is ignored. |
| Any other non-zero | Non-blocking error. The action proceeds. Stderr is logged but not shown to Claude. Toggle verbose mode with `Ctrl+O` to see these messages. |

> JSON is **only** processed on exit 0. Exit 2 ignores any JSON output. Do not mix exit 2 with JSON — use exit 2 for simple blocking, or exit 0 with JSON for structured control.

---

## JSON Output Format

For more control than exit codes allow, exit 0 and write a JSON object to stdout.

### PreToolUse structured output

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Use rg instead of grep for better performance",
    "updatedInput": {
      "command": "rg 'search-term' ."
    },
    "additionalContext": "Context injected into Claude's view before the tool runs"
  }
}
```

`permissionDecision` values for `PreToolUse`:
- `"allow"` — skip the interactive permission prompt (deny rules and enterprise managed deny lists still apply)
- `"deny"` — cancel the tool call; `permissionDecisionReason` is fed back to Claude
- `"ask"` — show the permission prompt to the user as normal

> Note: The older `"approve"` / `"block"` values are deprecated. Use `"allow"` / `"deny"`.

### PermissionRequest structured output

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedInput": { "command": "npm run lint" },
      "updatedPermissions": [
        { "type": "setMode", "mode": "acceptEdits", "destination": "session" }
      ]
    }
  }
}
```

For `behavior: "deny"`:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny",
      "message": "This operation is not allowed in production",
      "interrupt": true
    }
  }
}
```

### PostToolUse / Stop structured output

```json
{
  "decision": "block",
  "reason": "Tests must pass before proceeding",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Additional information for Claude about why this was blocked"
  }
}
```

### UserPromptSubmit structured output

```json
{
  "decision": "block",
  "reason": "Explanation shown to user",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Context injected into Claude's conversation"
  }
}
```

Plain text stdout on exit 0 is also added as context for `UserPromptSubmit` and `SessionStart` events.

---

## Decision Control by Event

Quick reference for which JSON pattern to use when blocking:

| Event | Block Method | Allow Method |
|:------|:------------|:-------------|
| `PreToolUse` | `hookSpecificOutput.permissionDecision: "deny"` | `hookSpecificOutput.permissionDecision: "allow"` |
| `PermissionRequest` | `hookSpecificOutput.decision.behavior: "deny"` | `hookSpecificOutput.decision.behavior: "allow"` |
| `UserPromptSubmit` | Top-level `decision: "block"` | Exit 0 |
| `PostToolUse` | Top-level `decision: "block"` (sends feedback) | Exit 0 |
| `Stop`, `SubagentStop` | Top-level `decision: "block"` | Exit 0 |
| `ConfigChange` | Top-level `decision: "block"` | Exit 0 |
| `TaskCreated`, `TaskCompleted` | Exit 2 or `continue: false` | Exit 0 |
| `TeammateIdle` | Exit 2 or `continue: false` | Exit 0 |
| `Elicitation`, `ElicitationResult` | `hookSpecificOutput.action: "decline"` or exit 2 | `hookSpecificOutput.action: "accept"` |
| `WorktreeCreate` | Non-zero exit or missing path | Print path to stdout |
| All others | Cannot block | — |

### Permission update entries (`updatedPermissions`)

Used in `PermissionRequest` `allow` decisions and `permission_suggestions`:

| `type` | Required Fields | Effect |
|:-------|:----------------|:-------|
| `addRules` | `rules[]`, `behavior`, `destination` | Add permission rules |
| `replaceRules` | `rules[]`, `behavior`, `destination` | Replace all rules of given behavior |
| `removeRules` | `rules[]`, `behavior`, `destination` | Remove matching rules |
| `setMode` | `mode`, `destination` | Change permission mode |
| `addDirectories` | `directories[]`, `destination` | Add working directories |
| `removeDirectories` | `directories[]`, `destination` | Remove working directories |

`destination` values: `"session"` | `"localSettings"` | `"projectSettings"` | `"userSettings"`

---

## Detailed Event Schemas

### SessionStart

Fires when a session begins or resumes. Stdout (plain text or JSON `additionalContext`) is injected into Claude's context.

**Input:**
```json
{
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-sonnet-4-6"
}
```

`source` values: `"startup"` | `"resume"` | `"clear"` | `"compact"`

**Output (inject context):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Reminder: use Bun, not npm. Current sprint: auth refactor."
  }
}
```

**Environment variable:** `CLAUDE_ENV_FILE` is available. Write `export VAR=value` lines to this file to persist environment variables for all subsequent Bash commands in the session.

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=development' >> "$CLAUDE_ENV_FILE"
  echo 'export API_BASE=http://localhost:3000' >> "$CLAUDE_ENV_FILE"
fi
```

---

### UserPromptSubmit

Fires when you submit a prompt, before Claude processes it. Can block or inject additional context.

**Input:**
```json
{
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Write a function to calculate factorial"
}
```

**Output (block):**
```json
{
  "decision": "block",
  "reason": "Prompts must include a ticket number",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Always reference the Jira ticket in your response"
  }
}
```

Plain text on stdout (exit 0) is added as context without blocking.

---

### PreToolUse

Fires before a tool call executes. Can block, modify input, or pre-approve the call.

**Input:**
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_use_id": "toolu_01ABC123...",
  "tool_input": {
    "command": "npm test",
    "description": "Run test suite",
    "timeout": 120000,
    "run_in_background": false
  }
}
```

**Tool input schemas by tool:**

| Tool | Key Fields in `tool_input` |
|:-----|:--------------------------|
| `Bash` | `command`, `description`, `timeout`, `run_in_background` |
| `Write` | `file_path`, `content` |
| `Edit` | `file_path`, `old_string`, `new_string`, `replace_all` |
| `Read` | `file_path`, `offset`, `limit` |
| `Glob` | `pattern`, `path` |
| `Grep` | `pattern`, `path`, `glob`, `output_mode`, `-i`, `multiline` |
| `WebFetch` | `url`, `prompt` |
| `WebSearch` | `query`, `allowed_domains`, `blocked_domains` |
| `Agent` | `prompt`, `description`, `subagent_type`, `model` |
| `AskUserQuestion` | `questions[]`, `answers{}` |

**Output (deny with reason):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Do not use grep. Use rg (ripgrep) instead.",
    "additionalContext": "Ripgrep is configured in this project for performance reasons."
  }
}
```

**Output (modify and allow):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "command": "rg 'search-term' ."
    }
  }
}
```

---

### PermissionRequest

Fires when a permission dialog is about to appear. Returning `behavior: "allow"` answers it without user interaction.

**Input:**
```json
{
  "hook_event_name": "PermissionRequest",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf node_modules" },
  "permission_suggestions": [
    {
      "type": "addRules",
      "rules": [{ "toolName": "Bash", "ruleContent": "rm -rf node_modules" }],
      "behavior": "allow",
      "destination": "localSettings"
    }
  ]
}
```

**Output (allow):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow"
    }
  }
}
```

**Output (allow and set session mode):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedPermissions": [
        { "type": "setMode", "mode": "acceptEdits", "destination": "session" }
      ]
    }
  }
}
```

> Note: `behavior: "allow"` skips the interactive prompt but does not override permission rules. If a deny rule matches the tool call, the call is still blocked even when your hook returns `"allow"`. Deny rules from any settings scope, including managed settings, always take precedence.

---

### PostToolUse

Fires after a tool call succeeds. Cannot undo the action. Can send feedback to Claude.

**Input:**
```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_use_id": "toolu_01ABC123...",
  "tool_input": { "file_path": "/path/to/file.ts", "content": "..." },
  "tool_response": { "filePath": "/path/to/file.ts", "success": true }
}
```

**Output (block with feedback):**
```json
{
  "decision": "block",
  "reason": "ESLint found errors in the file you just wrote. Fix them before proceeding.",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Run npx eslint --fix to auto-fix where possible.",
    "updatedMCPToolOutput": "..."
  }
}
```

`updatedMCPToolOutput` (MCP tools only): replaces the tool's output text visible to Claude.

---

### PostToolUseFailure

Fires after a tool call fails. Cannot block. Can inject context about the failure.

**Input:**
```json
{
  "hook_event_name": "PostToolUseFailure",
  "tool_name": "Bash",
  "tool_use_id": "toolu_01ABC123...",
  "tool_input": { "command": "npm test" },
  "error": "Command exited with non-zero status code 1",
  "is_interrupt": false
}
```

**Output:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUseFailure",
    "additionalContext": "Check the test output above. Common cause: missing mock for the new service."
  }
}
```

---

### Stop

Fires whenever Claude finishes responding. Can block Claude from stopping to force continued work.

> Does not fire on user interrupts. API errors fire `StopFailure` instead.

**Input:**
```json
{
  "hook_event_name": "Stop",
  "stop_hook_active": true,
  "last_assistant_message": "I've completed the refactoring task."
}
```

**Output (block to continue work):**
```json
{
  "decision": "block",
  "reason": "You forgot to update the CHANGELOG.md file."
}
```

**Critical**: Always check `stop_hook_active` to prevent infinite loops:

```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Allow Claude to stop — hook already fired once
fi
# ... rest of your validation logic
```

---

### SubagentStop

Same structure as `Stop` but fires when a subagent finishes. Includes subagent-specific fields.

**Input:**
```json
{
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_id": "def456",
  "agent_type": "Explore",
  "agent_transcript_path": "~/.claude/projects/.../subagents/agent-def456.jsonl",
  "last_assistant_message": "Analysis complete."
}
```

---

### StopFailure

Fires when the turn ends due to an API error. Output and exit code are ignored. Useful for logging and alerting only.

**Input:**
```json
{
  "hook_event_name": "StopFailure",
  "error": "rate_limit",
  "error_details": "429 Too Many Requests",
  "last_assistant_message": "API Error: Rate limit reached"
}
```

`error` values: `"rate_limit"` | `"authentication_failed"` | `"billing_error"` | `"invalid_request"` | `"server_error"` | `"max_output_tokens"` | `"unknown"`

---

### Notification

Fires when Claude Code sends a notification (e.g., waiting for permission or input). Cannot block.

**Input:**
```json
{
  "hook_event_name": "Notification",
  "message": "Claude needs your permission to use Bash",
  "title": "Permission needed",
  "notification_type": "permission_prompt"
}
```

`notification_type` values: `"permission_prompt"` | `"idle_prompt"` | `"auth_success"` | `"elicitation_dialog"`

---

### SubagentStart

Fires when a subagent is spawned. Can inject context that the subagent receives.

**Input:**
```json
{
  "hook_event_name": "SubagentStart",
  "agent_id": "agent-abc123",
  "agent_type": "Explore"
}
```

**Output:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "Follow the security guidelines in .claude/security-rules.md"
  }
}
```

---

### TeammateIdle / TaskCreated / TaskCompleted

Events for [agent team](https://code.claude.com/docs/en/agent-teams) workflows.

**TeammateIdle input:**
```json
{
  "hook_event_name": "TeammateIdle",
  "teammate_name": "researcher",
  "team_name": "my-project"
}
```

**TaskCreated / TaskCompleted input:**
```json
{
  "hook_event_name": "TaskCreated",
  "task_id": "task-001",
  "task_subject": "Implement user authentication",
  "task_description": "Add login and signup endpoints with JWT tokens",
  "teammate_name": "implementer",
  "team_name": "my-project"
}
```

To block: exit 2 (stderr fed to model as feedback) or return `{"continue": false, "stopReason": "..."}` to stop the teammate entirely.

---

### ConfigChange

Fires when a configuration file changes during a session. Useful for compliance auditing.

**Input:**
```json
{
  "hook_event_name": "ConfigChange",
  "source": "project_settings",
  "file_path": "/Users/alice/my-project/.claude/settings.json"
}
```

`source` values: `"user_settings"` | `"project_settings"` | `"local_settings"` | `"policy_settings"` | `"skills"`

Can block with `{"decision": "block"}` — except `policy_settings` cannot be blocked.

---

### InstructionsLoaded

Fires when a CLAUDE.md or `.claude/rules/*.md` file is loaded into context. Observability only — cannot block.

**Input:**
```json
{
  "hook_event_name": "InstructionsLoaded",
  "file_path": "/Users/alice/my-project/CLAUDE.md",
  "memory_type": "Project",
  "load_reason": "session_start",
  "globs": ["src/**"],
  "trigger_file_path": "/Users/alice/my-project/src/auth.ts",
  "parent_file_path": "/Users/alice/my-project/CLAUDE.md"
}
```

`memory_type` values: `"User"` | `"Project"` | `"Local"` | `"Managed"`
`load_reason` values: `"session_start"` | `"nested_traversal"` | `"path_glob_match"` | `"include"` | `"compact"`

`globs` is only present for `path_glob_match`. `trigger_file_path` is present for lazy loads. `parent_file_path` is present for `include` loads.

---

### CwdChanged

Fires when the working directory changes (e.g., when Claude executes a `cd` command). `CLAUDE_ENV_FILE` is available.

**Input:**
```json
{
  "hook_event_name": "CwdChanged",
  "new_cwd": "/home/alice/new-directory"
}
```

No matcher support. No decision control.

---

### FileChanged

Fires when a watched file changes on disk. The `matcher` field specifies which filenames (by basename) to watch.

**Input:**
```json
{
  "hook_event_name": "FileChanged",
  "file_path": "/home/alice/my-project/.envrc"
}
```

`CLAUDE_ENV_FILE` is available. No decision control.

---

### WorktreeCreate / WorktreeRemove

`WorktreeCreate` fires when a worktree is being created. Your hook replaces the default git behavior and must print the path to use.

**Input:**
```json
{
  "hook_event_name": "WorktreeCreate",
  "suggested_path": "/path/to/suggested/worktree"
}
```

**Output:**
- Command hook: print the worktree path to stdout
- HTTP hook: `hookSpecificOutput.worktreePath`
- Non-zero exit or missing path = creation fails

`WorktreeRemove` fires when a worktree is removed. No decision control.

---

### PreCompact / PostCompact

Fire before and after context compaction. No decision control.

**Input:**
```json
{
  "hook_event_name": "PreCompact",
  "trigger": "auto"
}
```

`trigger` values: `"auto"` | `"manual"`

---

### Elicitation / ElicitationResult

Fire when an MCP server requests user input during a tool call, and after the user responds.

**Elicitation input:**
```json
{
  "hook_event_name": "Elicitation",
  "mcp_server_name": "my-server",
  "request_id": "req-123",
  "message": "Please provide your API key",
  "schema": { "type": "object", "properties": { "api_key": { "type": "string" } } }
}
```

**ElicitationResult input:**
```json
{
  "hook_event_name": "ElicitationResult",
  "mcp_server_name": "my-server",
  "request_id": "req-123",
  "action": "accept",
  "content": { "api_key": "sk-..." }
}
```

**Output (auto-respond):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "Elicitation",
    "action": "accept",
    "content": { "api_key": "from-env-var" }
  }
}
```

Exit 2 = deny elicitation (action becomes `decline`). `action` values: `"accept"` | `"decline"` | `"cancel"`

---

### SessionEnd

Fires when a session terminates. No decision control.

**Input:**
```json
{
  "hook_event_name": "SessionEnd",
  "reason": "clear"
}
```

`reason` values: `"clear"` | `"resume"` | `"logout"` | `"prompt_input_exit"` | `"bypass_permissions_disabled"` | `"other"`

---

## Environment Variables

| Variable | Available In | Description |
|:---------|:------------|:------------|
| `CLAUDE_PROJECT_DIR` | All hooks | The project root directory |
| `CLAUDE_PLUGIN_ROOT` | Plugin hooks | Plugin installation directory |
| `CLAUDE_PLUGIN_DATA` | Plugin hooks | Plugin persistent data directory |
| `CLAUDE_ENV_FILE` | `SessionStart`, `CwdChanged`, `FileChanged` | File path to write `export VAR=value` lines that persist as env vars for Bash commands |
| `CLAUDE_CODE_REMOTE` | All hooks | Set to `"true"` in remote web environments |

### Using CLAUDE_ENV_FILE

Write shell export statements to this file to set environment variables that persist for all subsequent Bash tool calls in the session:

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export DOCKER_HOST=unix:///var/run/docker.sock' >> "$CLAUDE_ENV_FILE"
  echo "export BUILD_TAG=$(git rev-parse --short HEAD)" >> "$CLAUDE_ENV_FILE"
fi
```

---

## HTTP Hooks

Use `type: "http"` to POST event data to an HTTP endpoint instead of running a shell command. The endpoint receives the same JSON that a command hook would receive on stdin.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:8080/hooks/tool-use",
            "timeout": 30,
            "headers": {
              "Authorization": "Bearer $MY_TOKEN",
              "X-Project": "${CLAUDE_PROJECT_DIR}"
            },
            "allowedEnvVars": ["MY_TOKEN"]
          }
        ]
      }
    ]
  }
}
```

Header values support environment variable interpolation (`$VAR_NAME` or `${VAR_NAME}`). Only variables listed in `allowedEnvVars` are resolved; all other `$VAR` references remain empty.

### HTTP response handling

| Response | Behavior |
|:---------|:---------|
| 2xx + empty body | Success (equivalent to exit 0) |
| 2xx + plain text | Text added as context |
| 2xx + JSON body | Parsed using the same schema as command hook JSON output |
| Non-2xx status | Non-blocking error; execution continues |
| Connection failure or timeout | Non-blocking error; execution continues |

> HTTP hooks cannot use HTTP status codes to block actions. To block, return a 2xx response with the appropriate JSON (`decision: "block"` or `permissionDecision: "deny"`).

---

## Async Hooks

Add `"async": true` to run a hook in the background without blocking Claude Code. No decision control is possible for async hooks.

```json
{
  "type": "command",
  "command": "/path/to/background-logger.sh",
  "async": true
}
```

Use for fire-and-forget side effects: logging, metrics, notifications that don't need to control flow.

---

## Prompt-Based Hooks

For decisions that require judgment rather than deterministic rules, use `type: "prompt"`. Claude Code sends your prompt and the hook's input data to a Claude model (Haiku by default) for a single-turn yes/no decision.

The model returns:
- `{"ok": true}` — the action proceeds
- `{"ok": false, "reason": "..."}` — the action is blocked; `reason` is fed back to Claude

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if all requested tasks are complete. If any task remains, respond with {\"ok\": false, \"reason\": \"what remains to be done\"}. If everything is done, respond with {\"ok\": true}.",
            "model": "claude-haiku-4-5",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

`$ARGUMENTS` in the prompt is replaced with the full hook input JSON.

**Fields:**

| Field | Required | Default | Description |
|:------|:---------|:--------|:------------|
| `type` | yes | — | `"prompt"` |
| `prompt` | yes | — | Instructions for the model. Use `$ARGUMENTS` for hook input. |
| `model` | no | Haiku | Claude model to use for the decision |
| `timeout` | no | 30 | Seconds before the call is cancelled |

---

## Agent-Based Hooks

Use `type: "agent"` when verification requires inspecting files, running commands, or otherwise examining actual codebase state. Unlike prompt hooks (single LLM call), agent hooks spawn a subagent with up to 50 tool-use turns.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify that all unit tests pass. Run the test suite and check the results. If any tests fail, return {\"ok\": false, \"reason\": \"list the failing tests\"}. $ARGUMENTS",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

The agent uses the same `"ok"` / `"reason"` response format as prompt hooks.

**When to use each:**
- `prompt` hook: hook input data alone is sufficient to make the decision
- `agent` hook: you need to verify something against the actual state of the codebase (run tests, read files, check git status)

**Fields:**

| Field | Required | Default | Description |
|:------|:---------|:--------|:------------|
| `type` | yes | — | `"agent"` |
| `prompt` | yes | — | Task instructions for the subagent. Use `$ARGUMENTS` for hook input. |
| `timeout` | no | 60 | Seconds before the agent is cancelled (default is higher than prompt type) |

---

## MCP Tool Hooks

MCP tools follow the naming convention `mcp__<server>__<tool>`:
- `mcp__github__search_repositories`
- `mcp__filesystem__read_file`
- `mcp__memory__add_observation`

Use regex matchers to target specific servers or tool patterns:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__github__.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"GitHub MCP tool called: $(jq -r '.tool_name')\" >&2"
          }
        ]
      },
      {
        "matcher": "mcp__.*__write.*",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-mcp-write.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "jq '{tool: .tool_name, server: (.tool_name | split(\"__\")[1])}' >> ~/.claude/mcp-usage.log"
          }
        ]
      }
    ]
  }
}
```

In `PostToolUse`, you can replace the MCP tool's output visible to Claude using `updatedMCPToolOutput` in the JSON response:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "updatedMCPToolOutput": "Sanitized or enhanced version of the tool output"
  }
}
```

---

## Common Patterns

### Get notified when Claude needs input

Send a desktop notification when Claude is waiting for input, so you can work on other things.

**macOS:**
```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

If no notification appears, run `osascript -e 'display notification "test"'` once in Terminal to make Script Editor appear in System Settings > Notifications, then enable Allow Notifications.

**Linux:**
```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Claude Code' 'Claude Code needs your attention'"
          }
        ]
      }
    ]
  }
}
```

**Windows (PowerShell balloon notification):**
```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -Command \"[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Claude Code needs your attention', 'Claude Code')\""
          }
        ]
      }
    ]
  }
}
```

**Windows (toast notification via PowerShell, non-blocking):**
```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -Command \"Add-Type -AssemblyName System.Windows.Forms; $notify = New-Object System.Windows.Forms.NotifyIcon; $notify.Icon = [System.Drawing.SystemIcons]::Information; $notify.Visible = $true; $notify.ShowBalloonTip(3000, 'Claude Code', 'Claude needs your attention', [System.Windows.Forms.ToolTipIcon]::Info)\"",
            "async": true
          }
        ]
      }
    ]
  }
}
```

---

### Auto-format code after edits

Run Prettier on every file Claude edits to keep formatting consistent. Add this to `.claude/settings.json` (project scope):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

**Windows PowerShell equivalent:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "shell": "powershell",
            "command": "$input | ConvertFrom-Json | Select-Object -ExpandProperty tool_input | Select-Object -ExpandProperty file_path | ForEach-Object { npx prettier --write $_ }"
          }
        ]
      }
    ]
  }
}
```

**With `if` filter to target only TypeScript files (v2.1.85+):**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "if": "Edit(*.ts)|Write(*.ts)",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

---

### Block edits to protected files

Prevent Claude from modifying sensitive files such as `.env`, `package-lock.json`, or anything in `.git/`.

**Step 1 — Create the hook script** at `.claude/hooks/protect-files.sh`:

```bash
#!/bin/bash
# protect-files.sh: Block edits to protected files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

PROTECTED_PATTERNS=(".env" "package-lock.json" ".git/" "*.pem" "*.key")

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "Blocked: $FILE_PATH matches protected pattern '$pattern'" >&2
    exit 2
  fi
done

exit 0
```

**Step 2 — Make it executable** (macOS/Linux):

```bash
chmod +x .claude/hooks/protect-files.sh
```

**Step 3 — Register the hook** in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"
          }
        ]
      }
    ]
  }
}
```

**Windows PowerShell equivalent** for `protect-files.ps1`:

```powershell
# protect-files.ps1
$inputData = $input | ConvertFrom-Json
$filePath = $inputData.tool_input.file_path

$protected = @('.env', 'package-lock.json', '.git\', '*.pem', '*.key')

foreach ($pattern in $protected) {
  if ($filePath -like "*$pattern*") {
    Write-Error "Blocked: $filePath matches protected pattern '$pattern'"
    exit 2
  }
}

exit 0
```

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "shell": "powershell",
            "command": "& \"$env:CLAUDE_PROJECT_DIR\\.claude\\hooks\\protect-files.ps1\""
          }
        ]
      }
    ]
  }
}
```

---

### Re-inject context after compaction

When the context window fills up, compaction summarizes the conversation to free space and can lose important project context. Re-inject it automatically:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Reminder: use Bun (not npm). Run bun test before committing. Current sprint: auth refactor.'"
          }
        ]
      }
    ]
  }
}
```

For dynamic context (e.g., recent commits):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo '=== Recent commits ==='; git -C \"$CLAUDE_PROJECT_DIR\" log --oneline -5; echo '=== Active branch ==='; git -C \"$CLAUDE_PROJECT_DIR\" branch --show-current"
          }
        ]
      }
    ]
  }
}
```

For injecting context on every session start (not just after compaction), use [CLAUDE.md](https://code.claude.com/docs/en/memory) instead.

---

### Audit configuration changes

Track when settings files change during a session for compliance logging:

```json
{
  "hooks": {
    "ConfigChange": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{timestamp: now | todate, source: .source, file: .file_path}' >> ~/claude-config-audit.log"
          }
        ]
      }
    ]
  }
}
```

**Windows PowerShell equivalent:**
```json
{
  "hooks": {
    "ConfigChange": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "shell": "powershell",
            "command": "$d = $input | ConvertFrom-Json; [PSCustomObject]@{timestamp=(Get-Date -Format o); source=$d.source; file=$d.file_path} | ConvertTo-Json -Compress | Add-Content -Path \"$env:USERPROFILE\\claude-config-audit.log\""
          }
        ]
      }
    ]
  }
}
```

---

### Reload environment when directory or files change

Integrate with [direnv](https://direnv.net/) to reload environment variables when Claude changes directory:

```json
{
  "hooks": {
    "CwdChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "direnv export bash >> \"$CLAUDE_ENV_FILE\""
          }
        ]
      }
    ]
  }
}
```

To react to specific file changes instead of every directory change, use `FileChanged`:

```json
{
  "hooks": {
    "FileChanged": [
      {
        "matcher": ".envrc|.env",
        "hooks": [
          {
            "type": "command",
            "command": "direnv export bash >> \"$CLAUDE_ENV_FILE\""
          }
        ]
      }
    ]
  }
}
```

---

### Auto-approve specific permission prompts

Skip approval dialogs for tool calls you always allow. This example auto-approves `ExitPlanMode`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"hookSpecificOutput\": {\"hookEventName\": \"PermissionRequest\", \"decision\": {\"behavior\": \"allow\"}}}'"
          }
        ]
      }
    ]
  }
}
```

**Windows PowerShell equivalent:**
```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "shell": "powershell",
            "command": "Write-Output '{\"hookSpecificOutput\": {\"hookEventName\": \"PermissionRequest\", \"decision\": {\"behavior\": \"allow\"}}}'"
          }
        ]
      }
    ]
  }
}
```

> Keep matchers as narrow as possible. Matching `.*` or using an empty matcher would auto-approve every permission prompt, including file writes and shell commands.

---

### Validate commands with a script

Block dangerous SQL commands before execution. Create `.claude/hooks/validate-bash.sh`:

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Block DROP TABLE
if echo "$COMMAND" | grep -qi "drop table"; then
  echo "Blocked: dropping tables is not allowed in this environment" >&2
  exit 2
fi

# Block force pushes
if echo "$COMMAND" | grep -q "push.*--force\|push.*-f"; then
  echo "Blocked: force push is not allowed. Use --force-with-lease instead." >&2
  exit 2
fi

exit 0
```

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/validate-bash.sh"
          }
        ]
      }
    ]
  }
}
```

---

## Hook Handler Fields Reference

Complete list of fields available on each hook handler object:

| Field | Required | Default | Description |
|:------|:---------|:--------|:------------|
| `type` | yes | — | `"command"` \| `"http"` \| `"prompt"` \| `"agent"` |
| `command` | command type | — | Shell command to execute |
| `url` | http type | — | HTTP endpoint URL |
| `headers` | http type | `{}` | HTTP headers (supports `$VAR` interpolation) |
| `allowedEnvVars` | http type | `[]` | Env vars allowed to be interpolated in headers |
| `prompt` | prompt/agent | — | LLM prompt text. `$ARGUMENTS` = hook input JSON |
| `model` | prompt type | Haiku | Claude model to use |
| `if` | no | — | Permission-rule-syntax filter (tool events only, v2.1.85+) |
| `timeout` | no | 600/30/60 | Timeout in seconds (command/prompt/agent defaults) |
| `statusMessage` | no | — | Custom spinner message shown while hook runs |
| `once` | no | false | Run only once per session (skills context only) |
| `async` | no | false | Run in background without blocking (command type only) |
| `shell` | no | `"bash"` | Shell to use: `"bash"` or `"powershell"` |

---

## Troubleshooting

### Hook not firing

The hook is configured but never executes.

- Run `/hooks` and confirm the hook appears under the correct event with the right count
- Check that the matcher pattern matches the tool name exactly — matchers are case-sensitive
- Verify you're triggering the right event type (`PreToolUse` fires before execution, `PostToolUse` fires after)
- If using `PermissionRequest` hooks in non-interactive mode (`-p`), switch to `PreToolUse` instead — `PermissionRequest` does not fire in headless mode

### Hook error in output

You see a message like "PreToolUse hook error: ..." in the transcript.

Test your script manually by piping sample JSON:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ./my-hook.sh
echo $?  # Check the exit code
```

Common causes:
- Script exited with a non-zero code unexpectedly
- `command not found` — use absolute paths or `$CLAUDE_PROJECT_DIR` to reference scripts
- `jq: command not found` — install `jq` or use Python/Node.js for JSON parsing
- Script is not executable — run `chmod +x ./my-hook.sh` (macOS/Linux)

### `/hooks` shows no hooks configured

You edited a settings file but the hooks don't appear in the menu.

- File edits are normally picked up automatically. If they haven't appeared after a few seconds, restart your session
- Verify your JSON is valid — trailing commas and comments are not allowed in JSON
- Confirm the settings file is in the correct location: `.claude/settings.json` for project hooks, `~/.claude/settings.json` for global hooks

### Stop hook causes infinite loop

Claude keeps working indefinitely instead of stopping.

Your `Stop` hook must check `stop_hook_active` and exit early if it is `true`:

```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Allow Claude to stop — don't trigger another continuation
fi
# ... rest of hook logic
```

Without this guard, each time Claude stops, your hook blocks it from stopping, causing another response, which triggers your hook again.

### JSON validation failed

Claude Code shows a JSON parsing error even though your hook outputs valid JSON.

When Claude Code runs a hook, it spawns a shell that sources your profile (`~/.zshrc` or `~/.bashrc`). If your profile contains unconditional `echo` statements, that output is prepended to your hook's JSON:

```
Shell ready on arm64
{"decision": "block", "reason": "Not allowed"}
```

Claude Code tries to parse the whole thing as JSON and fails. Fix by guarding echoes in your shell profile:

```bash
# In ~/.zshrc or ~/.bashrc — only echo in interactive shells
if [[ $- == *i* ]]; then
  echo "Shell ready"
fi
```

The `$-` variable contains shell flags; `i` means interactive. Hooks run in non-interactive shells, so the echo is skipped.

**Windows PowerShell profile equivalent** (`~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`):

```powershell
# Only output in interactive sessions
if ([Environment]::UserInteractive) {
  Write-Host "PowerShell ready"
}
```

### Hook times out

The hook takes too long and is cancelled.

Default timeouts: 600 seconds for command hooks, 30 seconds for prompt hooks, 60 seconds for agent hooks. Override per-hook:

```json
{
  "type": "command",
  "command": "...",
  "timeout": 120
}
```

For long-running side effects that don't need to control flow, use `"async": true` to run without any timeout blocking.

### Debugging

Toggle verbose mode with `Ctrl+O` to see hook output in the transcript (non-zero exit stderr, hook match details). For full execution details including which hooks matched and their exit codes, run:

```bash
claude --debug
```

---

## See Also

- [Hooks Reference](https://code.claude.com/docs/en/hooks) — full event schemas, async hooks, MCP tool hook details
- [Permissions](https://code.claude.com/docs/en/permissions) — permission rule syntax used by the `if` field
- [Settings](https://code.claude.com/docs/en/settings) — settings file locations and structure
- [Skills](https://code.claude.com/docs/en/skills) — giving Claude additional instructions and executable commands
- [Subagents](https://code.claude.com/docs/en/sub-agents) — running tasks in isolated contexts
- [Plugins](https://code.claude.com/docs/en/plugins) — packaging extensions to share across projects
- [Bash command validator example](https://github.com/anthropics/claude-code/blob/main/examples/hooks/bash_command_validator_example.py) — complete reference implementation
