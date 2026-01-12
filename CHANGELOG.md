# Changelog

All notable changes to the Claude Code ChatUI extension will be documented in this file.

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
