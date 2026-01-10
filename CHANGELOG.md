# Changelog

All notable changes to the Claude Code ChatUI extension will be documented in this file.

## [3.0.2]

### Fixed
- 修复 Context Window 计算公式，添加遗漏的 `cacheCreationTokens`
  - 原问题：计算只包含 `input + cache_read`，导致百分比显示不准确
  - 修复后：正确公式为 `input + cache_creation + cache_read`（不含 output）
  - 现在 Context Window 显示与官方 Claude Code CLI 一致

## [3.0.1]

### Added
- 新增调试日志系统，支持日志滚动备份
  - 日志文件：`debug_log.txt`，备份文件：`debug_log.bak`
  - 可通过设置 `claude-code-chatui.debug.maxLines` 控制日志行数上限
- 新增 Playwright MCP 模板

### Fixed
- 修复多个 MCP 相关问题
- 修复 Windows 路径兼容性问题

### Changed
- 优化 Token 统计和价格计算的准确性
- 改进状态栏显示

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
