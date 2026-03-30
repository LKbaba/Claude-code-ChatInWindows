# Skills

Extend Claude Code with reusable, shareable capabilities using SKILL.md files

---

## 概述

Skills（技能）是 Claude Code 的可扩展能力系统，允许用户通过创建 `SKILL.md` 文件来定义新的行为，让 Claude 在会话中自动应用或通过 `/skill-name` 命令手动调用。

**核心概念**：
- 每个技能是一个目录，包含必需的 `SKILL.md` 文件和可选的支持文件
- 技能可存放于四个作用域层级：企业级、个人级、项目级、插件级
- 技能支持 YAML frontmatter 配置调用控制、工具限制、模型选择、上下文注入
- **自定义命令（`.claude/commands/`）已合并进技能系统**——两者等价，技能优先级更高
- 本扩展（Claude Code ChatUI）通过 `SkillManager` 服务类读取、缓存并管理这些技能，支持在 UI 中启用/禁用单个技能

---

## Table of Contents

1. [What Are Skills](#1-what-are-skills)
2. [Skills vs Custom Commands: Unified System](#2-skills-vs-custom-commands-unified-system)
3. [Skill Directory Structure](#3-skill-directory-structure)
4. [SKILL.md Format](#4-skillmd-format)
5. [Frontmatter Reference](#5-frontmatter-reference)
6. [String Substitution Variables](#6-string-substitution-variables)
7. [Skill Directory Locations and Scope](#7-skill-directory-locations-and-scope)
8. [Bundled Skills](#8-bundled-skills)
9. [Invocation Control Matrix](#9-invocation-control-matrix)
10. [Dynamic Context Injection](#10-dynamic-context-injection)
11. [Passing Arguments to Skills](#11-passing-arguments-to-skills)
12. [Supporting Files](#12-supporting-files)
13. [Running Skills in a Subagent](#13-running-skills-in-a-subagent)
14. [Tool Access Restriction](#14-tool-access-restriction)
15. [Restricting Claude's Skill Access](#15-restricting-claudes-skill-access)
16. [Sharing Skills](#16-sharing-skills)
17. [SkillManager: Extension Implementation](#17-skillmanager-extension-implementation)
18. [Example SKILL.md Files](#18-example-skillmd-files)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. What Are Skills

Skills extend what Claude can do within a Claude Code session. Each skill is backed by a `SKILL.md` file that contains:

- **YAML frontmatter** — configuration metadata between `---` markers (optional but recommended)
- **Markdown content** — instructions Claude follows when the skill is invoked

Once a skill exists, Claude can use it in two ways:

1. **Automatic invocation** — Claude reads skill descriptions and loads a skill when it determines the skill is relevant to the current conversation.
2. **Manual invocation** — The user types `/skill-name` (or `/skill-name <arguments>`) to directly trigger the skill.

Claude Code skills follow the [Agent Skills](https://agentskills.io) open standard, which works across multiple AI tools. Claude Code extends the standard with invocation control, subagent execution, and dynamic context injection.

---

## 2. Skills vs Custom Commands: Unified System

**Custom commands have been merged into skills.** The two systems are now equivalent and interchangeable. A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way.

Key differences to be aware of:

| Feature | `.claude/commands/deploy.md` | `.claude/skills/deploy/SKILL.md` |
|:--------|:-----------------------------|:---------------------------------|
| Creates `/deploy` command | Yes | Yes |
| Supports YAML frontmatter | Yes | Yes |
| Supporting files in same directory | No (flat file) | Yes (full directory) |
| Invocation control (`disable-model-invocation`) | Yes | Yes |
| Priority when names conflict | Lower | Higher |
| Enabled/disabled via rename | N/A | `SKILL.md` → `SKILL.md.disabled` |

**Migration note**: Existing `.claude/commands/` files continue to work without changes. Skills are recommended for new work because they support a directory structure for supporting files.

---

## 3. Skill Directory Structure

Each skill is a directory named after the skill, containing `SKILL.md` as the required entrypoint plus optional supporting files:

```
my-skill/
├── SKILL.md              # Main instructions (required)
├── reference.md          # Detailed API docs — loaded on demand
├── examples.md           # Example outputs — loaded on demand
└── scripts/
    ├── validate.sh        # Shell script Claude can execute
    └── helper.py          # Python utility Claude can run
```

The directory name becomes the default slash command name (e.g., directory `explain-code` → `/explain-code`). This can be overridden by the `name` field in frontmatter.

**Enabling and disabling a skill** is done by renaming the entrypoint file:

| File name | State |
|:----------|:------|
| `SKILL.md` | Enabled — Claude CLI sees and uses this skill |
| `SKILL.md.disabled` | Disabled — hidden from Claude CLI entirely |

This rename-based approach means no configuration file changes are required to toggle a skill. The Claude Code ChatUI extension uses this mechanism via `SkillManager.toggleSkillState()`.

---

## 4. SKILL.md Format

A `SKILL.md` file has two sections:

```
---
<YAML frontmatter>
---

<Markdown content with instructions>
```

**Minimal valid example** (no frontmatter):

```markdown
When reviewing code, always check for:
1. Security vulnerabilities
2. Performance bottlenecks
3. Missing error handling
```

**Recommended example** (with frontmatter):

```yaml
---
name: code-review
description: Review code for security, performance, and correctness. Use when asked to review, audit, or check code quality.
disable-model-invocation: false
---

When reviewing code, always check for:
1. Security vulnerabilities
2. Performance bottlenecks
3. Missing error handling
4. Test coverage gaps
```

All frontmatter fields are optional. The `description` field is strongly recommended because Claude uses it to decide when to automatically load the skill.

**Keep `SKILL.md` under 500 lines.** Move detailed reference material to separate files in the skill directory and reference them from `SKILL.md`.

---

## 5. Frontmatter Reference

All fields are optional. Only `description` is recommended.

| Field | Required | Type | Default | Description |
|:------|:---------|:-----|:--------|:------------|
| `name` | No | string | Directory name | Display name and slash-command name. Lowercase letters, numbers, and hyphens only. Max 64 characters. If omitted, the directory name is used. |
| `description` | Recommended | string | First paragraph of content | What the skill does and when to use it. Claude uses this to decide when to load the skill automatically. Front-load the key use case. Descriptions longer than 250 characters are truncated in the skill listing. |
| `argument-hint` | No | string | — | Hint shown during autocomplete. Example: `[issue-number]` or `[filename] [format]`. |
| `disable-model-invocation` | No | boolean | `false` | Set to `true` to prevent Claude from loading this skill automatically. The skill is only triggered when the user types `/skill-name`. This also removes the skill from Claude's context entirely. |
| `user-invocable` | No | boolean | `true` | Set to `false` to hide the skill from the `/` menu. Claude can still load it automatically. Use for background knowledge that users should not invoke as a command. |
| `allowed-tools` | No | string or list | All tools | Tools Claude can use without asking permission when this skill is active. Examples: `Read, Grep, Glob` or `Bash(git *)`. |
| `model` | No | string | Session default | Model to use when this skill is active. Overrides the session model for the duration of the skill. |
| `effort` | No | string | Session default | Effort level when this skill is active. Overrides the session effort level. Options: `low`, `medium`, `high`, `max` (Opus 4.6 only). |
| `context` | No | string | `inline` | Set to `fork` to run the skill in an isolated subagent context. The skill content becomes the subagent's task prompt. |
| `agent` | No | string | `general-purpose` | Which subagent type to use when `context: fork` is set. Options: `Explore`, `Plan`, `general-purpose`, or any custom agent name from `.claude/agents/`. |
| `hooks` | No | object | — | Hooks scoped to this skill's lifecycle. Follows the same format as session-level hooks. |
| `paths` | No | string or list | — | Glob patterns that limit when this skill is activated automatically. When set, Claude loads the skill only when working with files matching the patterns. Example: `src/**/*.ts` or `["src/**", "tests/**"]`. |
| `shell` | No | string | `bash` | Shell to use for `` !`command` `` blocks. Accepts `bash` (default) or `powershell`. Setting `powershell` requires `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`. |

### Frontmatter example using multiple fields

```yaml
---
name: pr-review
description: Review pull request changes for correctness, security, and style. Use when asked to review a PR or check recent changes.
argument-hint: [pr-number]
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash(gh *)
model: claude-sonnet-4-6
effort: high
context: fork
agent: Explore
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
shell: bash
---

Review PR #$ARGUMENTS for the following:

1. Correctness and logic errors
2. Security vulnerabilities
3. Performance implications
4. Code style and conventions

Current PR diff:
!`gh pr diff $ARGUMENTS`
```

---

## 6. String Substitution Variables

Skills support string substitution for dynamic values. Substitution happens before the skill content is sent to Claude.

| Variable | Description |
|:---------|:------------|
| `$ARGUMENTS` | All arguments passed when invoking the skill as a single string. If `$ARGUMENTS` is not present anywhere in the skill content, Claude Code appends `ARGUMENTS: <value>` to the end of the content so Claude still sees what was passed. |
| `$ARGUMENTS[N]` | Access a specific argument by 0-based index. `$ARGUMENTS[0]` is the first argument, `$ARGUMENTS[1]` is the second, and so on. |
| `$N` | Shorthand for `$ARGUMENTS[N]`. `$0` equals `$ARGUMENTS[0]`, `$1` equals `$ARGUMENTS[1]`, etc. |
| `${CLAUDE_SESSION_ID}` | The current session ID. Use for logging, creating session-specific files, or correlating skill output with sessions. |
| `${CLAUDE_SKILL_DIR}` | The absolute path to the directory containing the skill's `SKILL.md`. For plugin skills, this points to the skill's subdirectory within the plugin. Use this to reference scripts or templates bundled with the skill regardless of the current working directory. |

### Substitution examples

**Using `$ARGUMENTS` for a simple fix-issue workflow:**

```yaml
---
name: fix-issue
description: Fix a GitHub issue by number
disable-model-invocation: true
argument-hint: [issue-number]
---

Fix GitHub issue $ARGUMENTS following our coding standards.

1. Read the issue description with `gh issue view $ARGUMENTS`
2. Understand the requirements
3. Implement the fix
4. Write tests
5. Create a commit
```

Invocation: `/fix-issue 123` — Claude receives "Fix GitHub issue 123..."

**Using positional arguments `$0`, `$1`, `$2`:**

```yaml
---
name: migrate-component
description: Migrate a component from one framework to another
argument-hint: [component] [from-framework] [to-framework]
---

Migrate the $0 component from $1 to $2.
Preserve all existing behavior and tests.
```

Invocation: `/migrate-component SearchBar React Vue`
- `$0` → `SearchBar`
- `$1` → `React`
- `$2` → `Vue`

**Using `${CLAUDE_SESSION_ID}` for logging:**

```yaml
---
name: session-logger
description: Log session activity to a named file
---

Log the following activity to logs/${CLAUDE_SESSION_ID}.log:

$ARGUMENTS
```

**Using `${CLAUDE_SKILL_DIR}` to reference a bundled script:**

```yaml
---
name: codebase-visualizer
description: Generate an interactive HTML tree visualization of the codebase
allowed-tools: Bash(python *)
---

Run the visualization script:

```bash
python ${CLAUDE_SKILL_DIR}/scripts/visualize.py .
```

This creates `codebase-map.html` in the current directory.
```

---

## 7. Skill Directory Locations and Scope

Where a skill is stored determines who can use it and its priority when names conflict.

| Scope | Path | Applies to |
|:------|:-----|:-----------|
| Enterprise | See managed settings documentation | All users in the organization |
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` | All projects for the current user |
| Project | `.claude/skills/<skill-name>/SKILL.md` | The current project only |
| Plugin | `<plugin>/skills/<skill-name>/SKILL.md` | Where the plugin is enabled |

**Priority when names conflict**: Enterprise > Personal > Project.

Plugin skills use a `plugin-name:skill-name` namespace to avoid conflicts with other levels.

### Automatic discovery from nested directories

When working with files in subdirectories, Claude Code automatically discovers skills from nested `.claude/skills/` directories. For example, if editing a file in `packages/frontend/`, Claude Code also looks for skills in `packages/frontend/.claude/skills/`. This supports monorepo setups where packages have their own skills.

### Skills from additional directories

Skills defined in `.claude/skills/` within directories added via `--add-dir` are loaded automatically and picked up by live change detection. Skills can be edited during a session without restarting Claude Code.

> **Note**: CLAUDE.md files from `--add-dir` directories are not loaded by default. To load them, set `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`.

### Plugin skill path structure

Plugin skills are stored within the plugin cache. The extension's `SkillManager` traverses this structure:

```
~/.claude/plugins/cache/
└── <marketplace>/
    └── <plugin-name>/
        └── <version>/
            └── skills/
                └── <skill-name>/
                    └── SKILL.md
```

Plugin skills are always read-only — they cannot be enabled or disabled via the extension UI.

---

## 8. Bundled Skills

Bundled skills ship with Claude Code and are available in every session without any configuration. Unlike built-in commands (which execute fixed logic), bundled skills are prompt-based: they give Claude a detailed playbook and let it orchestrate the work using its tools. This means bundled skills can spawn parallel agents, read files, and adapt to the codebase.

Invoke them with `/` followed by the skill name. `<arg>` indicates a required argument; `[arg]` indicates an optional one.

| Skill | Invocation | Purpose |
|:------|:-----------|:--------|
| `/batch` | `/batch <instruction>` | Orchestrate large-scale changes across a codebase in parallel. Researches the codebase, decomposes the work into 5–30 independent units, and presents a plan. Once approved, spawns one background agent per unit in an isolated git worktree. Each agent implements its unit, runs tests, and opens a pull request. Requires a git repository. Example: `/batch migrate src/ from Solid to React` |
| `/claude-api` | `/claude-api` | Load Claude API reference material for the project's language (Python, TypeScript, Java, Go, Ruby, C#, PHP, or cURL) and Agent SDK reference for Python and TypeScript. Covers tool use, streaming, batches, structured outputs, and common pitfalls. Also activates automatically when code imports `anthropic`, `@anthropic-ai/sdk`, or `claude_agent_sdk`. |
| `/debug` | `/debug [description]` | Enable debug logging for the current session and troubleshoot issues by reading the session debug log. Debug logging is off by default unless `claude --debug` was used at startup, so running `/debug` mid-session starts capturing logs from that point forward. Optionally describe the issue to focus the analysis. |
| `/loop` | `/loop [interval] <prompt>` | Run a prompt repeatedly on an interval while the session stays open. Useful for polling a deployment, monitoring a PR, or periodically re-running another skill. Example: `/loop 5m check if the deploy finished` |
| `/simplify` | `/simplify [focus]` | Review recently changed files for code reuse, quality, and efficiency issues, then fix them. Spawns three review agents in parallel, aggregates their findings, and applies fixes. Pass text to focus on specific concerns: `/simplify focus on memory efficiency` |

---

## 9. Invocation Control Matrix

Two frontmatter fields jointly control who can invoke a skill:

- `disable-model-invocation: true` — prevents Claude from loading this skill automatically
- `user-invocable: false` — hides the skill from the `/` menu

| Frontmatter | User can invoke (`/name`) | Claude can invoke | When loaded into context |
|:------------|:--------------------------|:------------------|:-------------------------|
| (default — neither field set) | Yes | Yes | Description always in context; full content loads when invoked |
| `disable-model-invocation: true` | Yes | No | Description not in context; full content loads when user invokes |
| `user-invocable: false` | No | Yes | Description always in context; full content loads when invoked |
| Both fields set | Effectively disabled | No | Not in context |

### When to use `disable-model-invocation: true`

Use this for workflows with side effects or where you want explicit control over timing:

- `/commit` — commit decisions should be deliberate
- `/deploy` — deployments should never happen automatically
- `/send-slack-message` — messaging should be intentional

### When to use `user-invocable: false`

Use this for background knowledge that improves Claude's responses without being an actionable command:

- A `legacy-system-context` skill that explains how an old subsystem works
- An `api-conventions` skill that lists internal API naming rules
- A `team-style-guide` skill that captures formatting preferences

---

## 10. Dynamic Context Injection

The `` !`<command>` `` syntax executes shell commands before the skill content is sent to Claude. The command output replaces the placeholder in the skill text — Claude receives actual data, not the command string.

This is preprocessing that happens on the Claude Code side. Claude only sees the final rendered result.

**How it works:**

1. Claude Code parses the skill content looking for `` !`...` `` blocks
2. Each block is executed immediately as a shell command
3. The command's stdout replaces the `` !`...` `` placeholder
4. The fully rendered content is then sent to Claude

**Example — PR summary skill with live data:**

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`
- Recent commits: !`git log --oneline -10`

## Your task
Summarize this pull request. Describe what changed, why it changed, and any potential concerns.
```

When this skill runs, each `` !`...` `` command executes first, and Claude receives the actual PR data inline.

**Shell selection:** The shell used for `` !`...` `` blocks is controlled by the `shell` frontmatter field:

- `shell: bash` (default) — uses bash
- `shell: powershell` — uses PowerShell on Windows (requires `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`)

**Extended thinking:** To enable extended thinking in a skill, include the word `ultrathink` anywhere in the skill content.

---

## 11. Passing Arguments to Skills

Arguments are passed after the skill name when invoking:

```
/skill-name argument1 argument2 argument3
```

The complete argument string is available as `$ARGUMENTS`. Individual arguments are available by position using `$ARGUMENTS[N]` or `$N` (0-based index).

**Behavior when `$ARGUMENTS` is not in the skill content:**

If the user passes arguments but the skill does not include `$ARGUMENTS` anywhere in its content, Claude Code appends `ARGUMENTS: <value>` to the end of the skill content. Claude still receives the argument context even without an explicit placeholder.

**Argument processing by Claude vs. Claude Code:**

String substitution (`$ARGUMENTS`, `$0`, `$1`, etc.) is performed by Claude Code before sending content to Claude. Claude receives the already-substituted text. This means argument replacement is a textual substitution, not a runtime evaluation.

---

## 12. Supporting Files

Skills can bundle any number of files in their directory. The `SKILL.md` should reference them explicitly so Claude knows they exist and when to load them.

```
my-skill/
├── SKILL.md           # Overview and navigation (required)
├── reference.md       # Detailed API docs — loaded when needed
├── examples.md        # Usage examples — loaded when needed
└── scripts/
    └── helper.py      # Utility script — executed, not read into context
```

**Reference supporting files from SKILL.md:**

```markdown
## Additional resources

- For complete API details, see [reference.md](reference.md)
- For usage examples, see [examples.md](examples.md)
- To run validation, Claude can execute `${CLAUDE_SKILL_DIR}/scripts/helper.py`
```

This pattern allows large reference documents, API specifications, or example collections to stay out of context until specifically needed. The `${CLAUDE_SKILL_DIR}` variable ensures paths resolve correctly regardless of the current working directory.

---

## 13. Running Skills in a Subagent

Add `context: fork` to frontmatter to run a skill in isolation. The skill content becomes the prompt that drives the subagent. The subagent does not have access to the conversation history from the parent session.

```yaml
---
name: deep-research
description: Research a topic thoroughly across the codebase
context: fork
agent: Explore
---

Research $ARGUMENTS thoroughly:

1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references
```

When this skill runs:
1. A new isolated context is created
2. The subagent receives the skill content as its prompt
3. The `agent` field determines the execution environment (model, tools, permissions)
4. Results are summarized and returned to the main conversation

**`context: fork` is only meaningful for skills with actionable tasks.** If a skill contains guidelines like "use these API conventions" without a concrete task, the subagent receives the guidelines but has nothing to act on and returns without meaningful output.

### Skills vs. subagents with `context: fork`

| Approach | System prompt | Task | Also loads |
|:---------|:-------------|:-----|:-----------|
| Skill with `context: fork` | From agent type (`Explore`, `Plan`, etc.) | SKILL.md content | CLAUDE.md |
| Subagent with `skills` field | Subagent's markdown body | Claude's delegation message | Preloaded skills + CLAUDE.md |

The `agent` field accepts:
- Built-in agents: `Explore`, `Plan`, `general-purpose`
- Any custom agent name defined in `.claude/agents/`
- Omit the field to use `general-purpose`

---

## 14. Tool Access Restriction

The `allowed-tools` field limits which tools Claude can use when a skill is active. When a skill specifies `allowed-tools`, Claude can use those tools without per-use approval during skill execution. Your baseline permission settings govern all other tools.

**Read-only exploration skill:**

```yaml
---
name: safe-reader
description: Explore files without making changes
allowed-tools: Read, Grep, Glob
---

Explore the codebase and answer questions. Do not modify any files.
```

**Skill with specific bash command permissions:**

```yaml
---
name: git-status
description: Show git repository status
allowed-tools: Bash(git status), Bash(git log), Bash(git diff)
---

Show the current git repository status including:
- Working tree changes
- Recent commit history
- Staged vs unstaged changes
```

**Tool specification formats:**

- `Read` — allow the Read tool
- `Read, Grep, Glob` — comma-separated list
- `Bash(git *)` — allow Bash with commands matching `git *`
- `Bash(gh pr *)` — allow Bash with GitHub CLI PR commands only

---

## 15. Restricting Claude's Skill Access

By default, Claude can invoke any skill that does not have `disable-model-invocation: true` set. Three mechanisms exist to control this at the session or user level.

### Disable all skills

Add `Skill` to deny rules in `/permissions`:

```
# Add to deny rules:
Skill
```

### Allow or deny specific skills using permission rules

```
# Allow only specific skills
Skill(commit)
Skill(review-pr *)

# Deny specific skills
Skill(deploy *)
```

Permission syntax:
- `Skill(name)` — exact match
- `Skill(name *)` — prefix match with any arguments

### Hide individual skills

Add `disable-model-invocation: true` to a skill's frontmatter. This removes the skill from Claude's context entirely — the description is not loaded, and Claude cannot invoke it.

> **Note**: The `user-invocable` field only controls menu visibility, not Skill tool access. Use `disable-model-invocation: true` to block programmatic invocation.

---

## 16. Sharing Skills

Skills can be distributed at different scopes:

| Distribution method | How |
|:--------------------|:----|
| Project skills | Commit `.claude/skills/` to version control |
| Plugin skills | Create a `skills/` directory in your plugin package |
| Organization-wide | Deploy through managed settings |

---

## 17. SkillManager: Extension Implementation

This VS Code extension implements skill management through `src/services/SkillManager.ts`, a singleton service that discovers, caches, and manages skills from all three local scopes (workspace, user, plugin).

### Architecture

`SkillManager` uses the singleton pattern (`SkillManager.getInstance()`) so that the skill list is shared across all extension components without redundant filesystem reads. The cache is invalidated by calling `clearCache()` before a forced reload.

### Data structures

```typescript
// Scope types supported by the extension
type SkillScope = 'workspace' | 'user' | 'plugin';

interface InstalledSkill {
    name: string;            // Formatted display name (Title Case)
    rawName: string;         // Original directory name
    description?: string;    // From frontmatter
    scope: SkillScope;       // Where the skill lives
    pluginName?: string;     // Parent plugin name (plugin scope only)
    path: string;            // Absolute path to SKILL.md or SKILL.md.disabled
    enabled: boolean;        // true = SKILL.md, false = SKILL.md.disabled
    isOverridden?: boolean;  // True if a higher-priority scope has same name
    overriddenBy?: SkillScope; // Which scope overrides this skill
}
```

### Loading pipeline

`loadInstalledSkills()` runs three loaders in parallel, then merges and sorts the results:

```
loadInstalledSkills()
  ├── loadWorkspaceSkills()    → .claude/skills/ in workspace root
  ├── loadUserSkills()         → ~/.claude/skills/
  └── loadPluginSkills()       → ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/
       └── loadPluginSkillsFromDir() per plugin
  → detectOverrides()          → mark lower-priority duplicates
  → sort alphabetically
  → cache in this.cachedSkills
```

### Scope priority

When skills share the same `rawName` (directory name), the extension marks lower-priority ones as overridden:

| Scope | Priority |
|:------|:---------|
| workspace | 3 (highest) |
| user | 2 |
| plugin | 1 (lowest) |

### Frontmatter parsing

The extension parses only `name` and `description` from frontmatter using a lightweight regex parser (no YAML library dependency):

```typescript
// Matches content between opening and closing --- markers
const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
```

The full set of frontmatter fields (`allowed-tools`, `model`, `effort`, `context`, etc.) is passed through to the Claude CLI unchanged — the extension does not interpret those fields.

### Enable/disable mechanism

The extension toggles skills by renaming the entrypoint file:

```
Enable:   SKILL.md.disabled → SKILL.md
Disable:  SKILL.md          → SKILL.md.disabled
```

This approach is Claude CLI-native: the CLI discovers skills by looking for `SKILL.md` files. Renaming to `.disabled` makes the skill invisible to the CLI without deleting it.

Plugin skills cannot be toggled — they are always treated as read-only.

### Webview integration

`ClaudeChatProvider` handles three webview messages related to skills:

| Message type | Handler | Behavior |
|:-------------|:--------|:---------|
| `getInstalledSkills` | `_getInstalledSkills()` | Returns skills from cache (loads if empty) |
| `refreshSkills` | `_refreshSkills()` | Clears cache, force-reloads from filesystem |
| `toggleSkillState` | `_toggleSkillState(name, scope)` | Renames `SKILL.md` ↔ `SKILL.md.disabled` |

The webview receives an `installedSkillsUpdated` message with the skill array after each operation.

### Grouping for UI display

`groupSkillsByCategory()` organizes skills into three display categories:

```
Workspace   → .claude/skills/ (editable)
User Global → ~/.claude/skills/ (editable)
Plugin Skills → ~/.claude/plugins/cache/ (read-only)
```

---

## 18. Example SKILL.md Files

### Basic reference skill (no frontmatter)

This skill adds API conventions knowledge to Claude's context. Because there is no `disable-model-invocation`, Claude loads it automatically when relevant.

```markdown
When writing API endpoints for this project:

- Use RESTful naming conventions (nouns, not verbs)
- Return `{ data, error, meta }` envelope format
- Include request validation on all inputs
- Use HTTP 422 for validation errors, 404 for not found, 500 for server errors
- Log all errors with request ID for tracing
```

### Task skill with manual invocation only

```yaml
---
name: deploy
description: Deploy the application to the staging or production environment
disable-model-invocation: true
argument-hint: [staging|production]
allowed-tools: Bash(npm *), Bash(git *), Bash(kubectl *)
---

Deploy the application to $ARGUMENTS:

1. Run the full test suite: `npm test`
2. Build the application: `npm run build`
3. Tag the release in git: `git tag v$(date +%Y%m%d-%H%M%S)`
4. Push to the deployment target: `kubectl apply -f k8s/$ARGUMENTS/`
5. Wait for rollout: `kubectl rollout status deployment/app -n $ARGUMENTS`
6. Verify health check passes
7. Report deployment status
```

### Research skill running in an isolated subagent

```yaml
---
name: deep-research
description: Research a topic thoroughly across all project files. Use when you need comprehensive understanding of how something works.
context: fork
agent: Explore
---

Research "$ARGUMENTS" thoroughly:

1. Search for relevant files: use Grep and Glob broadly
2. Read and analyze every relevant file found
3. Map out the relationships between components
4. Summarize findings with:
   - Key files and their roles
   - Data flow diagram (ASCII)
   - Common patterns and conventions
   - Potential gotchas or non-obvious behaviors
```

### Dynamic context skill with shell injection

```yaml
---
name: pr-summary
description: Summarize the current pull request including diff, comments, and context
context: fork
agent: Explore
allowed-tools: Bash(gh *), Bash(git *)
---

## Pull request context

**PR info:**
!`gh pr view --json title,body,author,state`

**Changed files:**
!`gh pr diff --name-only`

**Full diff:**
!`gh pr diff`

**Review comments:**
!`gh pr view --comments`

**Recent related commits:**
!`git log --oneline -20`

## Task

Write a clear pull request summary that covers:
1. What changed and why
2. Key implementation decisions
3. Files most important to review
4. Potential concerns or risks
```

### Skill with path restriction (monorepo)

```yaml
---
name: frontend-conventions
description: Frontend coding conventions for the React components in this monorepo
user-invocable: false
paths:
  - "packages/frontend/**"
  - "apps/web/**"
---

When working on frontend React components in this project:

- Use functional components with hooks only (no class components)
- Follow the `ComponentName/index.tsx` file naming pattern
- Use the internal `useApiQuery` hook for all data fetching
- Apply Tailwind utility classes directly; avoid inline styles
- Prefer `React.memo` for components receiving stable prop references
```

---

## 19. Troubleshooting

### Skill not triggering automatically

If Claude does not load a skill when expected:

1. Check that the description contains keywords users would naturally say. The description is what Claude matches against.
2. Verify the skill appears when you ask "What skills are available?"
3. Try rephrasing your request to more closely match the description.
4. Invoke it directly with `/skill-name` if the skill is user-invocable.
5. Confirm the skill file is named `SKILL.md` (not `SKILL.md.disabled`).
6. Ensure `disable-model-invocation` is not set to `true` in the frontmatter.

### Skill triggers too often

1. Make the description more specific — add caveats about when not to use it.
2. Add `disable-model-invocation: true` to require manual invocation only.
3. Use `paths` to restrict automatic activation to specific file patterns.

### Skill description is cut short in the listing

Skill descriptions are loaded into context so Claude knows what is available. All skill names are always included, but if there are many skills, descriptions are shortened to fit a character budget. The budget scales dynamically at 1% of the context window, with a fallback of 8,000 characters. Each individual description is also capped at 250 characters regardless of budget.

To work around this:
- Front-load the most important keywords in the description
- Set the `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable to raise the limit
- Trim descriptions to under 250 characters

### Skill not visible in extension UI

The extension's SkillManager reads from three locations:

- Workspace: `<workspace>/.claude/skills/`
- User: `~/.claude/skills/`
- Plugin: `~/.claude/plugins/cache/`

If a skill does not appear:
1. Confirm the skill is in a directory (not a loose `.md` file) directly inside one of these locations
2. Confirm the directory contains `SKILL.md` or `SKILL.md.disabled`
3. Click the Refresh button in the Skills panel to force a reload (`refreshSkills` message)
4. Check the extension debug log for `SkillManager` errors

### Plugin skills not appearing

Plugin skills are discovered by traversing `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/`. If plugin skills are missing:

1. Confirm the plugin is installed and the cache directory exists
2. Confirm the plugin contains a `skills/` directory with skill subdirectories
3. Each subdirectory must contain `SKILL.md`
4. Plugin skills cannot be disabled — they always appear as enabled and read-only

### `context: fork` skill returns empty output

The subagent needs an actionable task in the skill content. If the skill contains only guidelines or reference material without a concrete instruction, the subagent receives context but has nothing to do and returns an empty result. Add an explicit task such as "Research X and return your findings" or "Implement the steps listed above."

---

## Related Documentation

- `/e/Github/Claude-code-ChatInWindows/docs/md/NewSDK/Subagents in the SDK.md` — Subagent architecture and integration
- `/e/Github/Claude-code-ChatInWindows/docs/md/NewSDK/Slash Commands in the SDK.md` — Built-in and custom slash commands
- `/e/Github/Claude-code-ChatInWindows/docs/md/NewSDK/Handling Permissions.md` — Tool permission model
- `/e/Github/Claude-code-ChatInWindows/docs/md/NewSDK/Custom Tools.md` — Custom tool definitions
- `/e/Github/Claude-code-ChatInWindows/src/services/SkillManager.ts` — Extension skill management implementation
- `/e/Github/Claude-code-ChatInWindows/src/providers/ClaudeChatProvider.ts` — Webview message handlers for skills
