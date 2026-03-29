# Claude Code ChatUI v4.0.1 — Hooks Integration & Agent Orchestration PRD

> **Version**: v1.0
> **Date**: 2026-03-28
> **Status**: Research complete, pending implementation
> **Target Release**: v4.0.1
> **Author**: Maintained by solo developer + Claude Code

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Background & Motivation](#2-background--motivation)
3. [Current Architecture Baseline](#3-current-architecture-baseline)
4. [Research Findings](#4-research-findings)
5. [Feature 1: Hooks GUI Management Panel](#5-feature-1-hooks-gui-management-panel)
6. [Feature 2: tmux-Style Mid-Task Intervention](#6-feature-2-tmux-style-mid-task-intervention)
7. [Feature 3: Ralph Loop (Auto-Iterative Development)](#7-feature-3-ralph-loop-auto-iterative-development)
8. [Architecture Decisions](#8-architecture-decisions)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Risk & Mitigation](#10-risk--mitigation)

---

## 1. Executive Summary

v4.0.1 introduces Claude Code hooks integration into the VS Code extension, giving users GUI-based control over hook lifecycle events without manual JSON editing. This is the foundation for two advanced features planned for subsequent releases: tmux-style mid-task intervention (redirecting Claude while it's working) and Ralph Loop (auto-iterative development using Stop hooks).

### Core deliverables (v4.0.1)

| Feature | Priority | Architecture Change |
|---------|----------|-------------------|
| Hooks GUI Management Panel | P0 | New service + UI modal |
| Project-level hook injection | P0 | Writes to `.claude/settings.local.json` |
| Quick hook templates | P1 | Bundled hook scripts |

### Future deliverables (v4.1+)

| Feature | Priority | Architecture Change |
|---------|----------|-------------------|
| Ralph Loop via Stop hook | P1 | New hook script + UI toggle |
| Message Inbox via PreToolUse hook | P2 | New hook script + inbox file + UI |
| Control Protocol (non -p mode) | P3 | Major refactor of ClaudeProcessService |

---

## 2. Background & Motivation

### 2.1 Claude Code Hooks (CLI v2.1.85+)

Claude Code CLI supports **hooks** — user-defined shell commands that execute at specific lifecycle events during a conversation. Hooks are configured in settings JSON files and receive context via stdin, returning control signals via stdout.

The extension currently does NOT expose any hooks functionality to users. Users must manually edit `~/.claude/settings.json` to configure hooks. This is error-prone and doesn't provide visibility into what hooks are active.

### 2.2 Agent Swarm / OpenClaw Pattern

Elvis (@elvissun) documented a "one-person dev team" pattern using OpenClaw as an orchestration layer:

- **Architecture**: Orchestrator (Zoe) spawns coding agents in isolated git worktrees + tmux sessions
- **Mid-task intervention**: `tmux send-keys -t session "new instruction" Enter` redirects agents mid-task without killing them
- **Monitoring**: Cron job every 10 minutes checks tmux session health, PR status, CI results
- **Ralph Loop V2**: When an agent fails, the orchestrator re-prompts with added context (customer history, meeting notes, past failures) instead of replaying the same prompt
- **Scale**: 94 commits/day, 7 PRs in 30 minutes, ~$190/month (Claude + Codex)

This pattern inspires two future features: mid-task intervention and Ralph Loop.

### 2.3 User's Core Needs

1. **Hooks GUI**: Manage hooks from the extension UI, not by hand-editing JSON
2. **Mid-task redirection**: Tell Claude "stop that, do this instead" while it's working (tmux-like)
3. **Auto-iteration**: Claude keeps working until a task passes defined criteria (Ralph Loop)
4. **No protocol breakage**: Keep `-p` mode and `--dangerously-skip-permissions` — the current architecture works

---

## 3. Current Architecture Baseline

### 3.1 CLI Communication

```
User input → Webview postMessage → ClaudeChatProvider
  → ClaudeProcessService (stdin JSON) → Claude CLI (-p mode)
  → stdout JSON stream → MessageProcessor → postMessage → Webview
```

**Key parameters** (`ClaudeProcessService.ts`):
```
claude -p --output-format stream-json --input-format stream-json --verbose --dangerously-skip-permissions
```

**stdin flow**:
1. `stdin.write(JSON.stringify(userMessage) + '\n')` — send the message
2. `stdin.end()` — **mandatory** in `-p` mode; CLI waits for EOF before processing

> **Critical**: `stdin.end()` is NOT optional. The CLI blocks until it receives EOF. This means once a message is sent, the stdin pipe is closed and cannot be written to again. This is a fundamental constraint of `-p` mode.

### 3.2 Permission Model

- `--dangerously-skip-permissions` bypasses all permission prompts
- NOT deprecated as of v2.1.85, but has known bugs in v2.1.77+ (some tools still prompt)
- Auto mode is the new official alternative, but extension uses bypass mode for non-interactive operation

### 3.3 Settings File Hierarchy

| File | Scope | Example Path |
|------|-------|-------------|
| Global | User-wide | `~/.claude/settings.json` |
| Project | Per-repo, shared | `.claude/settings.json` |
| Project-local | Per-repo, gitignored | `.claude/settings.local.json` |

All three files can contain a `"hooks"` section. Claude CLI merges them with project-local taking highest priority.

### 3.4 Skills UI Architecture (Template for Hooks UI)

The existing Skills management panel serves as the direct template:

| Component | File | Role |
|-----------|------|------|
| SkillManager | `src/services/SkillManager.ts` | Singleton, 3-scope loading, filesystem-based state |
| Modal HTML | `src/ui-v2/getBodyContent.ts` | `<div id="skillsModal">` with header, status, list |
| Frontend JS | `src/ui-v2/ui-script.ts` | `showSkillsModal()`, `updateSkillsList()`, message handlers |
| Message router | `src/providers/ClaudeChatProvider.ts` | `getInstalledSkills`, `toggleSkillState`, etc. |

**Data flow pattern**:
```
User clicks button → showModal() → postMessage({type: 'getHooks'})
  → Provider receives → HooksConfigManager.loadHooks()
  → postMessage({type: 'hooksUpdated', hooks}) → frontend renders list
```

---

## 4. Research Findings

### 4.1 Hooks Work in `-p` Mode (Verified)

**Test date**: 2026-03-28
**CLI version**: v2.1.85
**Test method**: Created hook scripts, configured in `~/.claude/settings.json`, ran CLI in `-p` mode

**Test scripts** (in `test-hooks/`):
- `test-hook.sh` — PreToolUse hook that logs every tool invocation to `~/hook-test.log`
- `stop-hook.sh` — Stop hook that logs when Claude finishes and returns `{"continue": false}`

**Results**:

| Hook Event | Fires in `-p` mode? | Notes |
|------------|---------------------|-------|
| PreToolUse | YES | Fires before every tool call (Read, Edit, Bash, etc.) |
| PostToolUse | YES | Fires after tool execution completes |
| Stop | YES | Fires when Claude finishes; `{"continue": true}` restarts |
| SessionStart | YES | Fires once at session beginning |
| UserPromptSubmit | YES | Fires when user prompt is received |
| PermissionRequest | NO | Does not fire in `-p` mode (permissions are bypassed) |

**Log output example**:
```
2026-03-28 04:00:00 HOOK_FIRED "tool_name":"Read"
2026-03-28 04:00:02 HOOK_FIRED "tool_name":"Edit"
2026-03-28 04:00:05 STOP_HOOK_FIRED
Input: {"session_id":"...","transcript":[...]}
```

**Conclusion**: All hooks except PermissionRequest function correctly in `-p --dangerously-skip-permissions` mode. No architecture changes are needed to support hooks.

### 4.2 Hook Data Format

**PreToolUse hook stdin** (JSON):
```json
{
  "session_id": "abc123",
  "tool_name": "Read",
  "tool_input": {
    "file_path": "/path/to/file"
  }
}
```

**PreToolUse hook stdout** (JSON):
```json
{}                                          // passthrough — allow tool
{"decision": "block", "reason": "..."}      // block tool execution
{"decision": "allow"}                       // explicitly allow
```

**Stop hook stdin** (JSON):
```json
{
  "session_id": "abc123",
  "transcript": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

**Stop hook stdout** (JSON):
```json
{"continue": false}     // let Claude exit (normal behavior)
{"continue": true}      // restart Claude with new context
```

### 4.3 Hook Configuration Format

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/hook.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/stop-hook.sh"
          }
        ]
      }
    ]
  }
}
```

- `matcher`: glob pattern for tool names (PreToolUse/PostToolUse only), `""` or `"*"` for match-all
- Multiple hooks per event are supported
- Multiple matchers per event are supported

### 4.4 Three Approaches for Mid-Task Intervention

| Approach | Mechanism | Architecture Change | Latency | Complexity |
|----------|-----------|-------------------|---------|------------|
| A. Ralph Loop | Stop hook returns `{"continue": true}` | None | End-of-turn only | Low |
| B. Message Inbox | PreToolUse hook checks a file for instructions | None | Before each tool call | Medium |
| C. Control Protocol | Remove `-p` mode, keep stdin open | Major refactor | Real-time | High |

**Approach A — Ralph Loop (recommended first)**:
- Stop hook fires when Claude finishes a turn
- Hook checks if work is complete; if not, returns `{"continue": true}` with updated instructions
- Zero architecture changes — just a hook script and UI toggle
- Limitation: can only intervene between turns, not mid-task

**Approach B — Message Inbox (recommended second)**:
- PreToolUse hook checks a "mailbox" file (e.g., `.claude/inbox.txt`) before each tool call
- If file has content, hook injects instructions; user writes to file via UI
- Zero architecture changes — just a hook script and file watcher
- Limitation: only fires before tool calls, not during long computations

**Approach C — Control Protocol (future consideration)**:
- Remove `-p` flag, keep stdin pipe open, send messages as NDJSON lines
- True real-time intervention like tmux
- Requires major refactor of `ClaudeProcessService.ts`
- Risk: undocumented protocol, may break on CLI updates
- Benefit: matches tmux `send-keys` pattern exactly

---

## 5. Feature 1: Hooks GUI Management Panel

### 5.1 Data Model

```typescript
interface ConfiguredHook {
  id: string;           // UUID
  event: HookEvent;     // 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionStart' | 'UserPromptSubmit'
  matcher: string;      // glob pattern for tool name, '' for all
  type: 'command';      // currently only 'command' is supported
  command: string;      // shell command to execute
  description: string;  // user-facing label
  scope: 'global' | 'project' | 'project-local';
  enabled: boolean;     // toggle without deleting
}

type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionStart' | 'UserPromptSubmit';
```

### 5.2 HooksConfigManager Service

**New file**: `src/services/HooksConfigManager.ts`

**Pattern**: Singleton (same as SkillManager)

**Responsibilities**:
1. Load hooks from all three settings files (global, project, project-local)
2. Parse raw JSON into `ConfiguredHook[]` with generated IDs
3. Write hooks back to the appropriate settings file
4. Enable/disable hooks (toggle `enabled` flag, rewrite JSON)
5. Add/remove hooks
6. Provide hook templates (pre-built useful hooks)

**File paths**:
```typescript
const SETTINGS_PATHS = {
  global: path.join(os.homedir(), '.claude', 'settings.json'),
  project: path.join(workspaceRoot, '.claude', 'settings.json'),
  'project-local': path.join(workspaceRoot, '.claude', 'settings.local.json')
};
```

**Read strategy**: Parse JSON, extract `hooks` section, flatten into `ConfiguredHook[]` with scope tags.

**Write strategy**: Read full settings file → modify only the `hooks` section → write back. Never clobber other settings (permissions, plugins, etc.).

### 5.3 GUI Layout

```
┌─────────────────────────────────────────┐
│  Hooks Management                    ✕  │
├─────────────────────────────────────────┤
│  [+ Add Hook]  [Templates ▾]           │
│                                         │
│  ── Global (~/.claude/settings.json) ── │
│  ☑ PreToolUse: Log all tool calls       │
│    matcher: *  cmd: bash ~/hooks/log.sh │
│    [Edit] [Delete]                      │
│                                         │
│  ── Project-Local ──────────────────── │
│  ☑ Stop: Ralph Loop                    │
│    matcher:   cmd: bash .claude/ralph.sh│
│    [Edit] [Delete]                      │
│                                         │
│  ☐ PreToolUse: Block dangerous writes   │
│    matcher: Edit  cmd: bash ~/guard.sh  │
│    [Edit] [Delete]                      │
│                                         │
│  ── No project-level hooks ──────────  │
│                                         │
├─────────────────────────────────────────┤
│  Active: 2  Disabled: 1  Total: 3      │
└─────────────────────────────────────────┘
```

**Key interactions**:
- **Checkbox**: Toggle enabled/disabled (rewrites settings JSON)
- **[+ Add Hook]**: Opens inline form (event dropdown, matcher, command, scope)
- **[Templates]**: Dropdown with pre-built hooks (logging, Ralph Loop, guard rails)
- **[Edit]**: Opens inline form pre-filled with hook data
- **[Delete]**: Confirmation → removes from settings JSON
- **Scope grouping**: Visual separation by global / project / project-local

### 5.4 Quick Templates

| Template | Event | Matcher | Description |
|----------|-------|---------|-------------|
| Tool Logger | PreToolUse | `*` | Logs all tool calls to `~/hook-test.log` |
| Bash Guard | PreToolUse | `Bash` | Blocks dangerous Bash commands (rm -rf, etc.) |
| Ralph Loop | Stop | `` | Continues iteration until criteria met |
| Message Inbox | PreToolUse | `*` | Checks `.claude/inbox.txt` for user instructions |
| Session Timer | SessionStart | `` | Logs session start time |

### 5.5 Files to Modify/Create

| File | Action | Changes |
|------|--------|---------|
| `src/services/HooksConfigManager.ts` | CREATE | Singleton service, CRUD operations, template definitions |
| `src/ui-v2/getBodyContent.ts` | MODIFY | Add Hooks button + modal HTML |
| `src/ui-v2/ui-script.ts` | MODIFY | Add `showHooksModal()`, `renderHooksList()`, form handling |
| `src/providers/ClaudeChatProvider.ts` | MODIFY | Add message handlers: `getHooks`, `addHook`, `removeHook`, `toggleHook` |
| `src/extension.ts` | MODIFY | Register HooksConfigManager in activation |

### 5.6 Message Protocol

**Webview → Extension**:
```typescript
{ type: 'getConfiguredHooks' }
{ type: 'addHook', hook: Partial<ConfiguredHook> }
{ type: 'removeHook', hookId: string }
{ type: 'toggleHookState', hookId: string }
{ type: 'updateHook', hookId: string, changes: Partial<ConfiguredHook> }
```

**Extension → Webview**:
```typescript
{ type: 'configuredHooksUpdated', hooks: ConfiguredHook[] }
{ type: 'hookStateChanged', hookId: string, enabled: boolean }
{ type: 'hookError', message: string }
```

---

## 6. Feature 2: tmux-Style Mid-Task Intervention

### 6.1 Problem Statement

In the current architecture, once a message is sent to Claude CLI (`stdin.write()` + `stdin.end()`), there is no way to send additional instructions until Claude finishes and a new process is spawned. The user must wait for the turn to complete or kill the process entirely.

The tmux pattern (from the Agent Swarm approach) allows `send-keys` to inject text into a running terminal session:
```bash
tmux send-keys -t session "Stop. Focus on the API layer first." Enter
```

This is NOT possible with `-p` mode because stdin is closed after the initial message.

### 6.2 Approach A — Ralph Loop (Stop Hook)

**How it works**:
1. Configure a Stop hook that checks a "task file" for completion criteria
2. When Claude finishes a turn, the hook evaluates the result
3. If criteria are not met, return `{"continue": true}` — Claude restarts with context
4. If criteria are met, return `{"continue": false}` — Claude exits normally

**User interaction**:
- Toggle "Ralph Loop" on/off from the UI
- Set task criteria (free text or structured checklist)
- View iteration count and status
- Override: force-stop at any time (kill process)

**Limitations**:
- Can only intervene between turns (not mid-tool-call)
- Each iteration starts a new turn with full transcript context
- Context window grows with each iteration

### 6.3 Approach B — Message Inbox (PreToolUse Hook)

**How it works**:
1. Configure a PreToolUse hook that checks `.claude/inbox.txt` before each tool call
2. User writes instructions to the inbox file via the UI
3. Hook reads the file; if non-empty, it modifies tool behavior or blocks the tool
4. Hook clears the file after reading

**User interaction**:
- Text input field in UI: "Send instruction to Claude" (always visible during active session)
- Message appears in Claude's context before the next tool call
- Indicator: "Instruction queued" → "Instruction delivered"

**Limitations**:
- Only fires before tool calls, not during long computations
- Hook must be carefully written to inject messages without breaking tool flow
- Timing is unpredictable — depends on when the next tool call happens

### 6.4 Approach C — Control Protocol (Future)

**How it works**:
1. Remove `-p` flag from CLI spawn
2. Keep stdin pipe open (no `stdin.end()`)
3. Send messages as NDJSON lines: `{"type": "user", "message": {...}}\n`
4. Claude processes each message as a new turn in the same session

**What this enables**:
- True real-time intervention (like tmux `send-keys`)
- Multi-turn conversation in a single process
- Session resume without respawning

**What this requires**:
- Major refactor of `ClaudeProcessService.ts` (remove stdin.end(), change message flow)
- New state machine for conversation turns (pending → processing → complete)
- Protocol compatibility testing with each CLI update
- Fallback handling if CLI doesn't support this mode

**Current assessment**: Deferred. The protocol is undocumented and risky to depend on. Approaches A and B provide 80% of the value with 0% architecture change.

---

## 7. Feature 3: Ralph Loop (Auto-Iterative Development)

### 7.1 Concept

Based on the Ralph Loop V2 pattern from the Agent Swarm article:

> "When an agent fails, the orchestrator doesn't just respawn with the same prompt. It looks at the failure with full context and figures out how to unblock it."

In our context: the Stop hook evaluates whether the task is complete. If not, it provides feedback for the next iteration.

### 7.2 Mechanism

```
User sends task → Claude works → Claude finishes (Stop event fires)
  → Stop hook evaluates transcript
  → If complete: {"continue": false} → done
  → If incomplete: {"continue": true} → Claude restarts with transcript + feedback
  → Repeat until complete or max iterations
```

### 7.3 Evaluation Strategies

| Strategy | Complexity | Description |
|----------|-----------|-------------|
| Simple counter | Low | Run N iterations then stop |
| File-based check | Medium | Check if specific files exist or contain expected content |
| Test runner | Medium | Run tests; continue if any fail |
| LLM evaluation | High | Use a second LLM to evaluate the transcript |

### 7.4 Hook Script Design

```bash
#!/bin/bash
# ralph-loop.sh — Stop hook for iterative development
input=$(cat)
iteration=$(cat .claude/ralph-iteration 2>/dev/null || echo "0")
max_iterations=$(cat .claude/ralph-max 2>/dev/null || echo "5")
task=$(cat .claude/ralph-task 2>/dev/null || echo "")

iteration=$((iteration + 1))
echo "$iteration" > .claude/ralph-iteration

if [ "$iteration" -ge "$max_iterations" ]; then
  echo '{"continue": false}'
  exit 0
fi

# Run tests or other evaluation
if npm test 2>&1 | tail -1 | grep -q "passed"; then
  echo '{"continue": false}'
else
  echo '{"continue": true}'
fi
```

### 7.5 UI Integration

- **Toggle**: "Enable Ralph Loop" checkbox in hooks panel or dedicated section
- **Config**: Max iterations (default 5), evaluation command (default: `npm test`)
- **Status**: "Iteration 3/5 — tests failing: 2 remaining"
- **Override**: "Force Stop" button kills process regardless of hook state

---

## 8. Architecture Decisions

### 8.1 Keep `-p` Mode

**Decision**: Keep `-p` (print) mode as the primary CLI communication method.

**Rationale**:
- Hooks work correctly in `-p` mode (verified)
- The one-shot pattern (stdin write → stdin end → stdout stream → process exit) is simple and reliable
- Removing `-p` mode to enable control protocol is a major refactor with undocumented protocol risks
- Ralph Loop and Message Inbox provide mid-task intervention without protocol changes

### 8.2 Keep `--dangerously-skip-permissions`

**Decision**: Continue using `--dangerously-skip-permissions` for non-interactive operation.

**Rationale**:
- Auto mode is the new official alternative, but it requires interactive terminal for some decisions
- The extension operates in non-interactive mode (stdin is piped, not a TTY)
- Despite known bugs in v2.1.77+, bypass mode is the most reliable for automated operation

### 8.3 Project-Local Hooks (Not Project Hooks)

**Decision**: Extension-managed hooks go into `.claude/settings.local.json`, not `.claude/settings.json`.

**Rationale**:
- `.claude/settings.local.json` is typically gitignored — no risk of committing user-specific hook paths
- Project-level `.claude/settings.json` may be shared across team members
- Users can still manually add shared hooks to `.claude/settings.json` if desired

### 8.4 Hook Scripts Stored in Project

**Decision**: Hook scripts managed by the extension are stored in `.claude/hooks/` within the workspace.

**Rationale**:
- Co-located with the project for portability
- `.claude/` directory is typically gitignored
- Global hooks stay in `~/.claude/hooks/` for cross-project use

---

## 9. Implementation Roadmap

### Phase 1: Hooks GUI Foundation (v4.0.1)

| Step | Task | Files | Effort |
|------|------|-------|--------|
| 1 | Create `HooksConfigManager.ts` | New file | Medium |
| 2 | Add Hooks button to header bar | `getBodyContent.ts` | Small |
| 3 | Add Hooks modal HTML | `getBodyContent.ts` | Medium |
| 4 | Add frontend JS (show/render/CRUD) | `ui-script.ts` | Large |
| 5 | Add message handlers | `ClaudeChatProvider.ts` | Medium |
| 6 | Add quick templates | `HooksConfigManager.ts` | Small |

**Estimated scope**: ~800-1200 lines of new/modified code across 5 files.

### Phase 2: Ralph Loop (v4.1)

| Step | Task | Files | Effort |
|------|------|-------|--------|
| 1 | Create `ralph-loop.sh` template | `.claude/hooks/` | Small |
| 2 | Add Ralph Loop toggle to UI | `getBodyContent.ts`, `ui-script.ts` | Medium |
| 3 | Add iteration tracking display | `ui-script.ts` | Medium |
| 4 | Add force-stop override | `ClaudeChatProvider.ts` | Small |

### Phase 3: Message Inbox (v4.2)

| Step | Task | Files | Effort |
|------|------|-------|--------|
| 1 | Create `inbox-hook.sh` template | `.claude/hooks/` | Small |
| 2 | Add "Send Instruction" input to chat UI | `getBodyContent.ts`, `ui-script.ts` | Medium |
| 3 | File watcher for inbox delivery confirmation | `ClaudeChatProvider.ts` | Medium |
| 4 | Hook auto-configuration on enable | `HooksConfigManager.ts` | Small |

### Phase 4: Control Protocol (v5.0 — conditional)

Only proceed if:
- Claude CLI officially documents the non `-p` NDJSON protocol
- Approaches A and B prove insufficient for user needs
- The protocol stabilizes across CLI versions

---

## 10. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| CLI update breaks hook behavior | High | Pin minimum CLI version, add version check warning |
| Hook scripts fail silently | Medium | Add hook health check (test-fire on enable), log to output channel |
| Settings JSON corruption | High | Read-modify-write with JSON validation, backup before write |
| Ralph Loop infinite iteration | Medium | Hard cap on iterations (default 5, max 20), force-stop button |
| Message Inbox race condition | Low | Hook reads + clears atomically, use temp file swap |
| CSP conflict with new modal | Low | New modal uses same inline event handler pattern (no CSP change needed) |
| `--dangerously-skip-permissions` deprecated | Medium | Monitor CLI changelogs, prepare Auto mode fallback path |

---

## Appendix A: Test Artifacts

Test scripts are in `test-hooks/` (not shipped in VSIX):

- `test-hook.sh` — PreToolUse logger (verified working 2026-03-28)
- `stop-hook.sh` — Stop hook with `{"continue": false}` (verified working 2026-03-28)
- `README-hooks-test.md` — Manual test procedure

## Appendix B: Agent Swarm Reference

Source: Elvis (@elvissun), "OpenClaw + Codex/ClaudeCode Agent Swarm: The One-Person Dev Team", 2026-02-23

Key patterns applicable to this project:

1. **tmux session per agent**: `tmux new-session -d -s "agent-name" -c "/path/to/worktree" "claude -p ..."`
2. **Mid-task intervention**: `tmux send-keys -t session "redirect instruction" Enter`
3. **Task registry**: `.clawdbot/active-tasks.json` tracks agent state, branch, PR
4. **Cron monitoring**: Script every 10 min checks tmux health, CI status, auto-respawns
5. **Ralph Loop V2**: Orchestrator evaluates failures with full business context, rewrites prompt for retry
6. **Multi-model routing**: Codex for backend/reasoning, Claude Code for frontend/git, Gemini for design

## Appendix C: Claude Code CLI Version Notes

| Version | Relevant Changes |
|---------|-----------------|
| v2.1.85 | Current version used for testing. Hooks confirmed working in -p mode. |
| v2.1.77+ | Known bugs with `--dangerously-skip-permissions` (some tools still prompt) |
| — | Auto mode introduced as official alternative to bypass mode |
| — | `PermissionRequest` hook event does NOT fire in -p mode (as expected) |
