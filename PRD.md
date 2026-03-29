# Claude Code ChatUI for Windows — Product Overview

## Product Identity

| Field | Value |
|-------|-------|
| Name | `claude-code-chatui` |
| Display Name | Claude-Code ChatUI for Windows |
| Publisher | lkbaba |
| Current Version | 3.1.9 |
| VS Code Engine | `>=1.94.0` |
| License | MIT |

## What It Is

A VS Code extension that provides a native webview chat interface for the [Claude Code CLI](https://www.npmjs.com/package/@anthropic-ai/claude-code) on Windows — no WSL (Windows Subsystem for Linux) required. It wraps the CLI's `stream-json` protocol (JSON messages over stdin/stdout) in a rich panel UI and adds Windows-specific process management, undo/redo, MCP (Model Context Protocol) tool integration, conversation persistence, and token/cost tracking.

Based on the original [claude-code-chat](https://github.com/andrepimenta/claude-code-chat) by Andre Pimenta.

## Target Users

- Windows developers who want Claude Code's agentic capabilities without setting up WSL
- Teams that need a GUI layer over the Claude Code CLI with conversation history, cost tracking, and undo/redo safety nets

## Core Capabilities

### Chat Interface
- Webview-based chat panel with dark gradient theme
- Markdown rendering, code block highlighting, image display
- Streaming responses with thinking mode visualization
- Multi-language response support (zh, es, ar, fr, de, ja, ko)

### Claude CLI Integration
- Spawns `claude` CLI with `--input-format stream-json --output-format stream-json`
- Discovers executable across: native installer, npm global, Bun, Homebrew (Mac), nvm paths
- Git Bash as POSIX shell on Windows
- Custom API endpoint support (key, baseUrl, cliCommand)

### Operation Tracking & Undo/Redo
- Tracks file operations performed by Claude (create, edit, multi-edit, delete, rename, directory ops, bash commands)
- Strategy pattern per operation type with preview diffs
- Git-based backup repository for safe rollback

### MCP (Model Context Protocol) Integration
- Supports `stdio`, `http`, `sse` transports
- Workspace + user scope config merging
- Per-session temp config file generation
- Gemini API key injection for gemini-assistant MCP

### Conversation Management
- Session persistence to workspace state + disk
- Conversation index with cost, timestamps, message counts
- Resume / browse / delete conversations

### Windows Process Management
- Process tree termination via `taskkill /t /f`
- Orphan process cleanup on panel close and VS Code exit
- Temp file cleanup (`tmpclaude-*-cwd`)

### Statistics & Cost Tracking
- Token usage and cost per conversation
- Cached statistics with dual-timestamp invalidation (file mtime + cache expiry)
- Status bar cost display

### Other
- Custom user commands
- Skills management (workspace/user/plugin scopes)
- Plugin discovery from `~/.claude/plugins/`
- Debug logging with circular buffer and file rotation

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────┐
│  VS Code Extension Host                             │
│                                                     │
│  extension.ts                                       │
│    ├── ClaudeChatProvider (webview orchestrator)     │
│    │     ├── ClaudeProcessService (CLI lifecycle)    │
│    │     ├── MessageProcessor (JSON stream parser)   │
│    │     ├── ConfigurationManagerFacade              │
│    │     ├── ConversationManager                     │
│    │     ├── OperationTracker + UndoRedoManager      │
│    │     ├── WindowsCompatibility                    │
│    │     └── SecretService (API key storage)         │
│    └── ClaudeChatViewProvider (activity bar tree)    │
│                                                     │
│  UI (single-file webview)                           │
│    ├── index.ts        → full HTML assembly          │
│    ├── getBodyContent.ts → body markup               │
│    └── ui-script.ts    → frontend JS bundle          │
│                                                     │
│  Communication: postMessage ←→ webview               │
│  CLI protocol: stream-json over stdin/stdout         │
└─────────────────────────────────────────────────────┘
```

## Source Directory Map

```
src/
├── extension.ts                    # Entry point, command/subscription wiring
├── ui-loader.ts                    # Loads UI HTML from ui-v2
├── types/Operation.ts              # Operation type enums and classes
├── providers/
│   ├── ClaudeChatProvider.ts       # Main webview panel orchestrator
│   └── ClaudeChatViewProvider.ts   # Activity bar tree data provider
├── services/
│   ├── ClaudeProcessService.ts     # Claude CLI spawn/kill/cleanup
│   ├── MessageProcessor.ts         # JSON stream parsing & dispatch
│   ├── DebugLogger.ts              # Circular-buffer file logger
│   ├── OperationPreview.ts         # Undo/redo diff previews
│   ├── PluginManager.ts            # ~/.claude/plugins reader
│   ├── SkillManager.ts             # Skill discovery & enable/disable
│   ├── SecretService.ts            # VS Code SecretStorage wrapper
│   └── StatisticsCache.ts          # Token/cost cache with LRU eviction
├── managers/
│   ├── WindowsCompatibility.ts     # OS-specific shell & process mgmt
│   ├── ConversationManager.ts      # Session persistence & indexing
│   ├── OperationTracker.ts         # Operation map with dependency graph
│   ├── UndoRedoManager.ts          # Strategy-based undo/redo
│   ├── BackupManager.ts            # Git-based backup repository
│   ├── FileOperationsManager.ts    # Workspace file browsing
│   ├── CustomCommandsManager.ts    # User-defined commands CRUD
│   ├── config/
│   │   ├── ConfigurationManagerFacade.ts
│   │   ├── VsCodeConfigManager.ts
│   │   ├── McpConfigManager.ts
│   │   └── ApiConfigManager.ts
│   └── operations/
│       ├── IOperationStrategy.ts
│       ├── BaseOperationStrategy.ts
│       ├── OperationStrategyRegistry.ts
│       └── strategies/             # One strategy per operation type
├── ui-v2/
│   ├── index.ts                    # HTML template with CSP header
│   ├── getBodyContent.ts           # Body markup (settings, chat, footer)
│   └── ui-script.ts               # Complete frontend JS as template string
└── utils/
    ├── constants.ts                # Model list, pricing
    ├── utils.ts                    # General helpers
    ├── configUtils.ts              # Config variable expansion
    ├── mcpPrompts.ts               # MCP system prompt builder
    ├── npmFinder.ts                # npm prefix resolution
    └── EnvironmentChecker.ts       # Git Bash / shell validation
```

## Specs Directory Index

Planning and requirements documents live in `specs/`. Naming convention: `{topic}.md` for requirements, `{topic}-PLAN.md` for implementation plans.

| File | Description |
|------|-------------|
| [updatePRD-consolidated.md](specs/updatePRD-consolidated.md) | Consolidated PRD updates — all features from v3.0.6 through v3.1.9 |

Previous individual spec files (`updatePRDv1/v2`, `gemini-integration-PLAN`, `native-installer-support-PLAN`, `v3.0.6-bugfix-PLAN`) have been consolidated and removed. Access via `git log --diff-filter=D -- specs/`.

## Configuration Settings

All settings are under `claudeCodeChatUI.*`:

| Setting | Type | Description |
|---------|------|-------------|
| `windows.gitBashPath` | string | Custom path to git-bash.exe |
| `thinking.enabled` | boolean | Enable thinking mode |
| `thinking.intensity` | enum | `think` / `think-hard` / `think-harder` / `ultrathink` / `sequential-thinking` |
| `mcp.enabled` | boolean | Enable MCP integration |
| `mcp.servers` | object | MCP server definitions (stdio/http/sse) |
| `language.enabled` | boolean | Enable multi-language responses |
| `language.selected` | string | Language code (zh, es, ar, fr, de, ja, ko) |
| `api.useCustomAPI` | boolean | Use custom API endpoint |
| `api.key` | string | API key (legacy setting — now stored in VS Code SecretStorage via `SecretService`; the setting is read on first launch for migration, then cleared) |
| `api.baseUrl` | string | Custom API base URL |
| `api.cliCommand` | string | Custom CLI command |
| `geminiIntegrationEnabled` | boolean | Inject Gemini key into MCP |
| `debug.enabled` | boolean | Enable debug logging |
| `debug.maxLines` | number | Max debug log lines |

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.
