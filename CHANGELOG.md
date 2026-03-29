# Changelog

All notable changes to the Claude Code ChatUI extension will be documented in this file.

## [3.1.9] - 2026-03-29

### Security
- **Webview CSP Policy**
  - Added Content-Security-Policy meta tag: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'`
  - Blocks loading of external resources, fonts, and unauthorized content
  - Note: Uses `unsafe-inline` instead of nonce due to 119 inline event handlers in the codebase

- **XSS Injection Fixes**
  - Custom command display fields (name/description/command/icon) now escaped via `escapeHtml()`
  - `cmd.id`/`cmd.command` in onclick attributes use `escapeForOnclick()` double-escaping (JS + HTML)
  - MCP thinking tool results now pass through `escapeHtml()` before `parseSimpleMarkdown()`

### Fixed
- **Windows Orphan Process Cleanup**
  - `provider` and `treeDisposable` added to `context.subscriptions` to ensure dispose fires on VS Code exit
  - `killProcess()` Windows branch `cp.exec` properly wrapped in Promise so `await` actually waits
  - `dispose()` now uses `killProcess(pid)` to kill the entire process tree via `taskkill /t /f`

- **configChanged Message Parameter Order**
  - `addMessage('system', event.data)` → `addMessage(message.data, 'system')`

- **Duplicate settingsData Message Handling**
  - Removed ~150 lines of duplicate `addEventListener('message', ...)` block
  - settingsData, geminiIntegrationConfig, platformInfo now handled only by the main handler

- **Duplicate textarea input Event Binding**
  - Removed duplicate `addEventListener('input', ...)` binding

- **StatisticsCache Expiry Logic**
  - Split `CachedFileData` interface into `fileTimestamp` (file modification time) and `cachedAt` (cache creation time)
  - `needsUpdate()` uses `fileTimestamp` for file change detection, `cachedAt` for cache expiry
  - Before fix: all caches for files older than 5 minutes were perpetually treated as expired

- **getWindowsConfig Missing gitBashPath**
  - `ApiConfigManager.getWindowsConfig()` now correctly returns the `gitBashPath` setting

### Removed
- **Removed unused docx dependency** — `"docx": "^9.5.1"` in `package.json` had no code references, saving ~27 KB in VSIX

### Changed
- `.vscodeignore` added `specs/**` exclusion rule, VSIX no longer includes planning documents

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | Version bumped to 3.1.9; removed docx dependency |
| `src/ui-v2/index.ts` | Added CSP meta tag |
| `src/ui-v2/ui-script.ts` | XSS fixes (escapeForOnclick); configChanged parameter fix; removed duplicate handlers and listeners |
| `src/ui-v2/getBodyContent.ts` | Version display updated to v3.1.9 |
| `src/extension.ts` | provider and treeDisposable added to subscriptions |
| `src/managers/WindowsCompatibility.ts` | killProcess Promise wrapping |
| `src/services/ClaudeProcessService.ts` | dispose uses killProcess for process tree kill |
| `src/services/StatisticsCache.ts` | fileTimestamp + cachedAt dual-field separation |
| `src/managers/config/ApiConfigManager.ts` | Added missing gitBashPath |
| `.vscodeignore` | Added specs/** exclusion |

## [3.1.8] - 2026-03-12

### Fixed
- **Background Agent UI State Tearing & Deadlock**
  - Fixed `onFinalResult` prematurely sending `setProcessing(false)`
  - A single CLI process can emit multiple `type:"result"` events (background Agent completion triggers new conversation turns), each incorrectly setting UI to Ready
  - `setProcessing(false)` now only sent on `process.on('close')`, ensuring UI state aligns with process lifecycle
  - Fixed deadlock where Stop button disappeared in Ready state while residual process was still running

- **Duplicate Cost Bubble Display**
  - Each `type:"result"` was inserting a cost bubble, causing 2~4 cost messages per conversation
  - Intermediate `updateTotals` now only updates status bar cumulative stats without generating cost bubbles
  - Final cost bubble shown only once on process close, displaying complete cost and duration

- **Compact Mode Cost Bubble Leak**
  - Fixed logic order issue in `onClose` where `_isCompactMode` was reset before being checked
  - Uses `wasCompactMode` to capture state early, preventing cost bubble display during Compact Mode

### Changed
- **Default Model Updated to Sonnet 4.6**
  - Property initial values, workspaceState fallback, and frontend defaults unified to `claude-sonnet-4-6`
  - Only affects first-time users; existing saved preferences are unchanged

### Added
- **Grok Assistant MCP Template**
  - Added `grok-assistant` MCP template (`@lkbaba/grok-mcp`)
  - Supports real-time Web & X (Twitter) search (`grok_agent_search`) and creative brainstorming (`grok_brainstorm`)
  - Grok tool calls display a satellite dish icon
  - Requires `XAI_API_KEY` configuration (from console.x.ai)

### Removed
- **Removed Basic Memory MCP Template**
  - Removed template definition, system prompt, and dropdown option
- **Removed n8n MCP Template**
  - Removed template definition, system prompt, and dropdown option
  - Removed ~120 lines of n8n guide auto-injection into CLAUDE.md and related detection logic

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | Version bumped to 3.1.8 |
| `src/providers/ClaudeChatProvider.ts` | Fixed setProcessing timing, cost dedup, Compact Mode logic; default model changed to Sonnet 4.6 |
| `src/ui-v2/getBodyContent.ts` | Version update; removed Basic Memory/n8n options; added Grok Assistant option |
| `src/ui-v2/ui-script.ts` | Default model changed to Sonnet 4.6; removed Basic Memory/n8n templates; added Grok Assistant template and icon |
| `src/utils/mcpPrompts.ts` | Removed basic-memory/n8n prompts; added grok-assistant prompt |
| `src/utils/utils.ts` | Removed n8n CLAUDE.md injection logic (n8nSection variable, hasN8nInfo check, write code) |

## [3.1.7] - 2026-02-18

### Added
- **Claude Sonnet 4.6 Model Support**
  - Added `claude-sonnet-4-6` to valid model list and pricing config ($3.00/$15.00 per M tokens)
  - Model selector UI now includes Sonnet 4.6 option (Latest intelligent model)
  - Statistics formatting logic supports Sonnet 4.6/4.5 version detection

### Removed
- **Removed Opus 4.1 Model (UI layer)**
  - Removed Opus 4.1 option from model selector
  - Removed from displayNames and radioId mappings
  - Removed from switch statements (MODEL_PRICING retained for historical billing)

### Changed
- Opus 4.5 description updated to "Previous flagship model, excellent for coding"
- Sonnet 4.5 title updated to "Previous intelligent model"
- **Compute Mode Upgrade**: MAX mode and Enhance Subagents now enforce Sonnet 4.6 (upgraded from Sonnet 4.5)
  - MAX mode description updated: `enforces Sonnet 4.6`
  - Enhance Subagents description updated: `Use Sonnet 4.6 for all subagent operations`
  - Backend `_handleModeSelection` and `_handleSubagentEnhancement` use `claude-sonnet-4-6`

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | Version bumped to 3.1.7 |
| `src/providers/ClaudeChatProvider.ts` | Added Sonnet 4.6 pricing/display name/switch, removed Opus 4.1; Compute Mode forced model upgrade to Sonnet 4.6 |
| `src/ui-v2/getBodyContent.ts` | Version update; added Sonnet 4.6 selector, removed Opus 4.1 selector; Compute Mode UI description update |
| `src/ui-v2/ui-script.ts` | displayNames/radioId mapping updates; statistics formatting version detection |
| `src/utils/constants.ts` | Added `claude-sonnet-4-6`, removed `claude-opus-4-1-20250805` |

## [3.1.6] - 2025-02-10

### Fixed
- **@ File Reference — Case-Insensitive Search**
  - Searching `readme` now matches `README.md`, `Readme.md`, etc.
  - Implemented by converting search terms to case-insensitive glob patterns (e.g., `readme` → `[rR][eE][aA][dD][mM][eE]`)

- **@ File Reference — Race Condition Fix**
  - Fixed race condition caused by initial file list request lacking `requestId`
  - Fast typing no longer causes stale full file list to overwrite filtered results

- **@ File Reference — Keyboard Navigation Scroll**
  - Selected item auto-scrolls into view when navigating with ArrowUp/ArrowDown

- **@ File Reference — Cursor Position Fix**
  - Fixed incorrect insertion position after file selection
  - Cursor position now saved before opening file picker to prevent focus-switch displacement

- **@ File Reference — Selection Index Reset Timing**
  - Selection index now resets immediately on user input instead of waiting for 150ms debounce

### Files Modified
| File | Changes |
|------|---------|
| `src/managers/FileOperationsManager.ts` | Added case-insensitive glob pattern builder |
| `src/ui-v2/ui-script.ts` | Fixed race condition, cursor position, keyboard nav scroll, selection index reset |

## [3.1.5] - 2025-02-10

### Added
- **Claude Opus 4.6 Model Support**
  - Added `claude-opus-4-6` to valid model list
  - Added pricing config ($5.00/$25.00 per M tokens)
  - Model selector UI now includes Opus 4.6 option
  - Updated model descriptions: 4.6 Latest, 4.5 Previous, 4.1 Classic

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | Version bumped to 3.1.5 |
| `src/providers/ClaudeChatProvider.ts` | Added Opus 4.6 pricing and display name mapping |
| `src/ui-v2/getBodyContent.ts` | Added Opus 4.6 model selector option and description |
| `src/ui-v2/ui-script.ts` | Added Opus 4.6 radio ID mapping and statistics formatting |
| `src/utils/constants.ts` | Added `claude-opus-4-6` to VALID_MODELS |

## [3.1.4] - 2025-01-29

### Added
- **macOS Platform Support**
  - Extension now runs on macOS
  - Supports three Claude CLI installation methods: native installer, Homebrew, npm
  - Supports nvm-installed Node.js/npm environments

### Changed
- **Platform Compatibility Refactoring**
  - `package.json` added `darwin` platform support
  - `EnvironmentChecker.ts` added Mac environment checks (Git Bash not required)
  - `WindowsCompatibility.ts` added Mac execution environment config
  - `utils.ts` function renamed: `updateClaudeMdWithWindowsInfo` → `updateClaudeMdWithPlatformInfo`
  - `ClaudeChatProvider.ts` updated calls for cross-platform support

- **CLAUDE.md Platform Info**
  - Mac: displays macOS version and current shell
  - Windows: retains existing Windows + Git Bash info

- **CLI Path Discovery Improvements**
  - Mac: supports `~/.local/bin`, Homebrew, nvm paths
  - Mac: only searches for extensionless executables (skips .cmd/.exe)

- **npm Discovery Improvements**
  - Mac: supports Homebrew and nvm-installed npm
  - Missing npm no longer shows error dialog (downgraded to console.warn)

### Fixed
- **Restored Debug Auto-Compilation**
  - `launch.json` restored `preLaunchTask` for automatic TypeScript compilation before F5 debug
- **Package Size Optimization**
  - `.vscodeignore` excludes `*.vsix` and `*.zip` files to prevent old build artifacts from being included in VSIX

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | Added `darwin` to `os` field |
| `src/extension.ts` | `~/.claude` directory creation made cross-platform |
| `src/utils/EnvironmentChecker.ts` | Added Mac CLI checks + nvm support |
| `src/utils/utils.ts` | Platform info function refactoring |
| `src/utils/npmFinder.ts` | Added Mac npm paths + nvm support |
| `src/managers/WindowsCompatibility.ts` | Added Mac execution environment, error messages, PATH setup |
| `src/providers/ClaudeChatProvider.ts` | Updated function calls and variable names |
| `.vscode/launch.json` | Restored `preLaunchTask` auto-compilation |
| `.vscodeignore` | Excluded `*.vsix`, `*.zip` build artifacts |

### Notes
- Windows functionality unchanged (backward compatible)
- Optional changes (class renaming, Mac shell config setting) deferred

## [3.1.3] - 2025-01-23

### Added
- **Native Installer Path Support**
  - Added `~/.local/bin/` search path (official PowerShell/WinGet installation location)
  - Added `~/.claude/bin/` fallback search path
  - Search priority: native installer > npm > Bun

### Changed
- **npm Dependency Now Optional**
  - No longer errors when npm is not installed; continues checking other paths
  - Supports Claude Code installed via native installer without Node.js
- **Updated Error Messages**
  - Recommends official native installation method
  - Notes that npm installation method is deprecated

### Files Modified
| File | Changes |
|------|---------|
| `src/managers/WindowsCompatibility.ts` | Added native path search, PATH injection, updated error messages |
| `src/utils/EnvironmentChecker.ts` | npm made optional; expanded search paths; updated install prompts |

### Background
Anthropic deprecated the npm installation method after Claude Code 2.1.15, recommending native installers:
- PowerShell: `irm https://claude.ai/install.ps1 | iex`
- WinGet: `winget install Anthropic.ClaudeCode`

## [3.1.2] - 2025-01-17

### Fixed
- **Claude Output Angle Brackets Display**
  - Fixed `<example>`, `<tag>` and other angle bracket content in Claude's output being treated as HTML tags and disappearing
  - Added `escapeHtml()` processing for Claude output, compact summary, and thinking mode content
  - Now matches the same escaping behavior as user input messages

### Changed
- **Playwright MCP Browser Guide Updated**
  - Updated browser version fix instructions for Playwright MCP v1.0.12+
  - New fix command: `npx playwright@latest install chromium`
  - Added version info: Playwright 1.57.0 requires chromium-1200 with `chrome-win64/` structure
  - Updated in: `CLAUDE.md`, `utils.ts` (auto-inject template), `mcpPrompts.ts`

### Files Modified
| File | Changes |
|------|---------|
| `src/ui-v2/ui-script.ts` | Added escapeHtml() for Claude output (line 2559), compact summary (line 2625), thinking mode (line 2736) |
| `src/utils/utils.ts` | Updated playwrightSection template with new browser fix instructions |
| `src/utils/mcpPrompts.ts` | Updated Playwright prompt with browser fix command and device presets info |
| `CLAUDE.md` | Updated Playwright MCP Guide section |

## [3.1.0] - 2025-01-13

### Added
- **Skills Panel Enhancement**
  - **Copy to Clipboard**: Click on any skill item to copy `Use skills: {skill-name}` to clipboard
  - **Copy Button**: Dedicated copy button on the right side of each skill item with visual feedback (checkmark animation)
  - **Enable/Disable Toggle**: Workspace and User Global skills can be enabled/disabled via status button
    - Green "Enabled" button = skill is active
    - Red "Disabled" button = skill is disabled
  - **True Skill Disabling**: Disabled skills are renamed from `SKILL.md` to `SKILL.md.disabled`, making them invisible to Claude CLI
  - **Plugin Skills Protection**: Plugin skills display a blue "Plugin" badge and cannot be toggled (read-only)
  - **Visual Feedback**: Disabled skills show reduced opacity and red "Disabled" status

### Changed
- **SkillManager Refactored**
  - Removed config file-based state management in favor of file renaming approach
  - Skills now detect enabled/disabled state from filename suffix
  - Simplified `toggleSkillState()` method to use file system operations
  - Removed unused methods: `loadDisabledSkills()`, `saveDisabledSkills()`, `getConfigPath()`, `getSkillId()`, `isSkillDisabled()`, `setSkillEnabled()`

### Fixed
- **Template String Escaping Bug**
  - Fixed JavaScript syntax error caused by incorrect single quote escaping in template strings
  - Changed `\'` to `\\'` for proper escaping in backtick strings

### Files Modified
| File | Changes |
|------|---------|
| `src/ui-v2/index.ts` | Added CSS styles for copy-button, skill-status-btn, is-disabled states |
| `src/ui-v2/ui-script.ts` | Added handleCopySkill(), showCopyFeedback(), handleSkillCopy(), handleSkillToggle() functions; redesigned renderSkillItems() |
| `src/services/SkillManager.ts` | Added toggleSkillState() with file renaming; modified loadWorkspaceSkills() and loadUserSkills() to detect .disabled files |
| `src/providers/ClaudeChatProvider.ts` | Added toggleSkillState message handler and _toggleSkillState() method |

## [3.0.9] - 2025-01-13

### Fixed
- **Skills Path Bug Fix**
  - Fixed SkillManager reading from wrong directory (`.claude/commands/` → `.claude/skills/`)
  - Workspace and User skills now correctly load from `.claude/skills/` directory
  - Skills are properly recognized as directories containing `SKILL.md` files
  - Updated UI path display to show correct `.claude/skills/` paths

## [3.0.8] - 2025-01-13

### Changed
- **Tool Icons & Colors Redesign**
  - Updated tool icons for better visual representation:
    - `AskUserQuestion`: 🤷‍♂️ → 🤔 (Thinking face)
    - `KillShell`: 🛑 → 💀 (Skull - "kill process")
    - `Skill`: ⚡ → 🛠️ (Tools)
  - Implemented dynamic color bar for tool messages (left border gradient)
  - Each tool now has its own unique color scheme:
    - `AskUserQuestion`: Dark pink (#be185d → #9d174d)
    - `Task`: Muted violet (#a855f7 → #7c3aed)
    - `EnterPlanMode`: Darker blue (#0284c7 → #1d4ed8)
    - `ExitPlanMode`: Darker gray (#64748b → #475569)
    - `KillShell`: Darker gray (#64748b → #475569)
    - `TaskOutput`: Darker green (#059669 → #047857)
    - `Skill`: Industrial orange (#ea580c → #c2410c)
    - Default: Muted purple (#6366f1 → #4f46e5)
  - Colors are intentionally darker/muted for better dark mode compatibility

### Fixed
- **Claude CLI Temp Files Cleanup**
  - Added automatic cleanup of `tmpclaude-*-cwd` temporary files
  - Cleanup runs on extension activate, deactivate, and after Claude process ends
  - Prevents workspace pollution from leftover temp files

## [3.0.7] - 2025-01-13

### Added
- **Skills Modal Feature**
  - New "Skills: All" button next to "Plugins: All" button
  - Skills modal displays all available Claude Code skills organized by scope
  - Three-tier skill hierarchy: Workspace, User Global, and Plugin Skills
  - Workspace skills: Project-specific skills from `./.claude/commands/`
  - User skills: Global user skills from `~/.claude/commands/`
  - Plugin skills: Read-only skills bundled with installed plugins
  - Collapsible accordion UI with scope-specific border colors
  - Plugin badge displayed on right side for plugin skills
  - Refresh button to reload skills from all sources
  - Skill override detection (higher priority scopes override lower ones)

### New Files
- `src/services/SkillManager.ts` - Skill discovery and management service
  - Singleton pattern with in-memory caching
  - Parses YAML frontmatter from SKILL.md files
  - Supports workspace, user, and plugin skill scopes

## [3.0.6] - 2025-01-12

### Added
- **Language Mode Enhancement: "Only communicate" option**
  - New checkbox in Language selection modal (next to title)
  - When checked: Communication in selected language, code comments remain in English
  - When unchecked: Both communication and code comments use selected language
  - Dynamic description text updates based on selection
  - Setting persists across sessions

### Fixed
- **Plan Mode State Sync**
  - Fixed Plan First switch not resetting when Claude exits Plan Mode
  - Prevents "ENTER PLAN MODE" prompt from being incorrectly added on next message

- **Angle Bracket Display**
  - Fixed user messages containing `<tag>` being incorrectly parsed as HTML
  - Added `escapeHtml()` function to properly display angle brackets in chat
  - Example: `<div>` now displays correctly instead of disappearing

- **Copy Content Line Breaks**
  - Optimized copy function to clean up excessive line breaks
  - Replaces 3+ consecutive newlines with 2 for cleaner clipboard content

### Changed
- Language setting now uses prompt injection instead of official `settings.json`
  - More reliable: works immediately without requiring new session
  - Works with `--resume` sessions (official config doesn't reload on resume)

### Removed
- Removed `ClaudeConfigService.ts` (no longer needed)
  - Language setting via `~/.claude/settings.json` replaced with prompt-based approach

## [3.0.5] - 2025-01-12

### Added
- **Custom CLI Command Name Support**
  - Added "CLI Command Name" field in "API Configuration" section
  - Compatible with relay service subscription clients (e.g. `sssclaude`)
  - Default value is `claude`, relay service users can change to `sssclaude`

### Changed
- Optimized environment check logic to detect based on configured command name
- Updated error messages to guide users in configuring relay services correctly

## [3.0.4]

### Added
- **Plan Mode Status Light**
  - Status light turns purple when Claude enters Plan Mode (via EnterPlanMode tool)
  - Text changes from "Processing" to "Planning" with purple indicator
  - Includes pulse breathing animation same as Processing state
  - Status automatically syncs when Claude calls EnterPlanMode/ExitPlanMode tools
  - Plan First switch and input border also sync with Plan Mode state

### Changed
- **Code Comments Internationalization**
  - Converted all Chinese comments to English for international developers
  - Affected files: `index.ts`, `ui-script.ts`, `MessageProcessor.ts`, `ClaudeChatProvider.ts`

### Fixed
- **ExitPlanMode Error Display**
  - Hidden CLI auto-returned error message for ExitPlanMode tool
  - Same handling as AskUserQuestion to prevent confusing error display

## [3.0.3]

### Fixed
- **Context Window display issues**
  - Fixed Context Window not resetting to 100% after Compact operation
- **Compact button UX improvements**
  - Fixed race condition causing "Compacting conversation..." message to disappear prematurely
  - Fixed intermediate state showing cost statistics before summary appears
  - Now transitions directly from loading state to summary display
- **Compact mode processing state**
  - Fixed `_isCompactMode` flag being reset too early (before process completion)
  - Filtered out `current*` fields from `updateTotals` messages during compact mode
- **Ready state delay**
  - Fixed ~0.5s delay between showing cost info and "Ready" status
  - Now sends `setProcessing: false` in `onFinalResult` callback instead of waiting for `onClose`
- **AskUserQuestion error display**
  - Hidden CLI auto-returned error message `"Error: Answer questions?"`
  - Claude will re-display questions in plain text format

### Changed
- Changed Compact icon from 🗜️ to ⚡ for better visual representation
- Changed Compact summary messages to English for international users:
  - "⚡ Conversation Summary" instead of "⚓️ 对话总结"
  - "This is a summary of the previous conversation. Starting a new conversation now."
- Simplified AskUserQuestion handling (due to CLI `-p` mode architectural limitation)
  - Removed interactive modal UI code (~580 lines of CSS/JS)
  - Questions now answered through normal chat flow

### Added
- Added note in Usage Statistics that subagent usage is excluded from calculations
- Added `dispose()` method to `ClaudeProcessService` for proper process cleanup
- Added `--input-format=stream-json` parameter for consistent JSON messaging
- Added `_buildUserMessage()` method for structured message construction

## [3.0.2]

### Fixed
- Fixed Context Window calculation formula by adding missing `cacheCreationTokens`
  - Previous: Calculation only included `input + cache_read`, causing inaccurate percentage display
  - Fixed: Correct formula is `input + cache_creation + cache_read` (excluding output)
  - Context Window display now matches official Claude Code CLI

## [3.0.1]

### Added
- Added debug logging system with log rotation backup
  - Log file: `debug_log.txt`, backup file: `debug_log.bak`
  - Configurable via `claude-code-chatui.debug.maxLines` setting
- Added Playwright MCP template

### Fixed
- Fixed multiple MCP-related issues
- Fixed Windows path compatibility issues

### Changed
- Optimized token statistics and price calculation accuracy
- Improved status bar display

## [2.1.3]

### Fixed
- Fixed MCP args corruption issue where letter 's' was incorrectly removed from arguments
  - Root cause: Template string escaping issue (`\s` was interpreted as `s` instead of whitespace)
  - Solution: Changed `/\s+/` to `/\\s+/` in template string context
- Fixed global MCP servers not being tested when clicking the Test button
  - Root cause: `testMcpConnection` only read workspace config, ignoring global config
  - Solution: Now uses `getMergedMcpServers()` to get both global and workspace servers
- Fixed global MCP servers not being merged when only global config exists
  - Root cause: Merge logic only triggered when workspace/folder servers existed
  - Solution: Removed conditional check, now always merges all config levels

### Changed
- Improved English localization for console logs and user messages
- Removed debug logging statements for cleaner production output

## [2.1.2]

### Added
- Added Warmup message filtering in usage statistics
  - Excludes warmup conversations from token usage calculations
  - Supports chain filtering for multi-round warmup dialogs
- Added MCP workspace-level configuration isolation
  - User (Global) and Workspace configurations are now displayed separately
  - Each scope has its own "Add MCP Server" and "Add from template" buttons
- Added new MCP templates: n8n, shadcn/ui

### Fixed
- Fixed MCP configuration scope issues where workspace configs could leak to global
- Fixed MCP server deletion not persisting correctly

### Changed
- Redesigned MCP settings UI with split-panel layout (User Global vs Workspace sections)
- Improved button styling with complete text labels and larger Test button

## [2.1.1]

### Added
- Added Gemini Integration feature for AI-assisted responses
- Added secure API key storage using VS Code SecretStorage

### Fixed
- Fixed Windows compatibility issues with npx commands

## [2.1.0]

### Added
- Added MCP (Model Context Protocol) support
- Added HTTP/SSE MCP server type support
- Added MCP server templates for quick setup
- Added Gemini API key auto-injection for gemini-assistant MCP server

### Changed
- Improved configuration management with multi-level support (global/workspace/folder)

## [2.0.0]

### Added
- Complete UI redesign with modern interface
- Added usage statistics dashboard
- Added operation history with undo functionality
- Added thinking intensity control (think/ultrathink modes)
- Added custom API endpoint support

### Changed
- Migrated to new UI architecture (ui-v2)
- Improved Windows native support (no WSL required)
