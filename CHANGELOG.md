# Changelog

All notable changes to the Claude Code ChatUI extension will be documented in this file.

## [3.1.8] - 2026-03-12

### Fixed
- **后台 Agent 任务导致 UI 状态撕裂 & 死锁**
  - 修复 `onFinalResult` 中过早发送 `setProcessing(false)` 的问题
  - 一次 CLI 进程可能产生多个 `type:"result"` 事件（后台 Agent 完成后触发新对话轮次），每次都会错误地将 UI 设为 Ready
  - 现在 `setProcessing(false)` 仅在 `process.on('close')` 时发送，确保 UI 状态与进程生命周期一致
  - 修复 Ready 状态下 Stop 按钮消失、用户无法停止残留进程的死锁问题

- **多个💰结算气泡重复显示**
  - 每个 `type:"result"` 都会插入一个💰气泡，导致一次对话出现 2~4 个结算信息
  - 现在中间的 `updateTotals` 只更新状态栏累计统计，不生成💰气泡
  - 最终💰气泡仅在进程关闭时显示一次，展示完整的费用和时长

- **Compact Mode 下的💰泄漏**
  - 修复 `onClose` 中 `_isCompactMode` 先被重置再被检查的逻辑顺序问题
  - 使用 `wasCompactMode` 提前捕获状态，防止 Compact Mode 下错误显示💰气泡

### Changed
- **默认模型更新为 Sonnet 4.6**
  - 属性初始值、workspaceState fallback、前端默认值统一改为 `claude-sonnet-4-6`
  - 仅影响首次使用的用户，已保存偏好的用户不受影响

### Added
- **Grok Assistant MCP 模板**
  - 新增 `grok-assistant` MCP 模板（`@lkbaba/grok-mcp`）
  - 支持实时 Web & X (Twitter) 搜索（`grok_agent_search`）和创意头脑风暴（`grok_brainstorm`）
  - Grok 工具调用显示 🛰️ 图标
  - 需要配置 `XAI_API_KEY`（从 console.x.ai 获取）

### Removed
- **移除 Basic Memory MCP 模板**
  - 移除模板定义、系统提示词、下拉菜单选项
- **移除 n8n MCP 模板**
  - 移除模板定义、系统提示词、下拉菜单选项
  - 移除 CLAUDE.md 自动注入的 ~120 行 n8n 使用指南及相关检测逻辑

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | 版本号更新至 3.1.8 |
| `src/providers/ClaudeChatProvider.ts` | 修复 setProcessing 时机、💰去重、Compact Mode 逻辑、默认模型改为 Sonnet 4.6 |
| `src/ui-v2/getBodyContent.ts` | 版本号更新；移除 Basic Memory/n8n 选项；添加 Grok Assistant 选项 |
| `src/ui-v2/ui-script.ts` | 默认模型改为 Sonnet 4.6；移除 Basic Memory/n8n 模板；添加 Grok Assistant 模板和 🛰️ 图标 |
| `src/utils/mcpPrompts.ts` | 移除 basic-memory/n8n 提示词；添加 grok-assistant 提示词 |
| `src/utils/utils.ts` | 移除 n8n CLAUDE.md 注入逻辑（n8nSection 变量、hasN8nInfo 检查、写入代码） |

## [3.1.7] - 2026-02-18

### Added
- **Claude Sonnet 4.6 模型支持**
  - 新增 `claude-sonnet-4-6` 到有效模型列表和定价配置（$3.00/$15.00 per M tokens）
  - 模型选择器 UI 新增 Sonnet 4.6 选项（Latest intelligent model）
  - 统计格式化逻辑支持 Sonnet 4.6/4.5 版本号判断

### Removed
- **移除 Opus 4.1 模型（UI 层面）**
  - 从模型选择器中移除 Opus 4.1 选项
  - 从 displayNames 和 radioId 映射中移除
  - 从 switch 语句中移除（MODEL_PRICING 保留用于历史数据计费）

### Changed
- Opus 4.5 描述更新为 "Previous flagship model, excellent for coding"
- Sonnet 4.5 标题更新为 "Previous intelligent model"
- **Compute Mode 升级**：MAX 模式和 Enhance Subagents 强制模型从 Sonnet 4.5 升级为 Sonnet 4.6
  - MAX 模式描述更新：`enforces Sonnet 4.6`
  - Enhance Subagents 描述更新：`Use Sonnet 4.6 for all subagent operations`
  - 后端 `_handleModeSelection` 和 `_handleSubagentEnhancement` 使用 `claude-sonnet-4-6`

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | 版本号更新至 3.1.7 |
| `src/providers/ClaudeChatProvider.ts` | 添加 Sonnet 4.6 定价/显示名称/switch，移除 Opus 4.1；Compute Mode 强制模型升级为 Sonnet 4.6 |
| `src/ui-v2/getBodyContent.ts` | 版本号、添加 Sonnet 4.6 选择器、移除 Opus 4.1 选择器；Compute Mode UI 描述更新 |
| `src/ui-v2/ui-script.ts` | displayNames/radioId 映射更新、统计格式化逻辑添加版本判断 |
| `src/utils/constants.ts` | 添加 `claude-sonnet-4-6`，移除 `claude-opus-4-1-20250805` |

## [3.1.6] - 2025-02-10

### Fixed
- **@ 文件引用功能 - 大小写不敏感搜索**
  - 搜索 `readme` 现在可以匹配 `README.md`、`Readme.md` 等
  - 通过将搜索词转换为大小写通配 glob 模式实现（如 `readme` → `[rR][eE][aA][dD][mM][eE]`）

- **@ 文件引用功能 - 竞态条件修复**
  - 修复初始文件列表请求无 `requestId` 导致的竞态条件
  - 快速输入搜索词时，旧的全量文件列表不再覆盖过滤结果

- **@ 文件引用功能 - 键盘导航滚动**
  - 使用 ArrowUp/ArrowDown 导航时，选中项自动滚动到可视区域

- **@ 文件引用功能 - 光标位置修复**
  - 修复文件选择后插入位置不正确的问题
  - 在打开文件选择器前保存光标位置，避免焦点切换导致位置丢失

- **@ 文件引用功能 - 选择索引重置时机**
  - 用户输入搜索词时立即重置选择索引，不再等待 150ms debounce

### Files Modified
| File | Changes |
|------|---------|
| `src/managers/FileOperationsManager.ts` | 添加大小写不敏感 glob 模式构建 |
| `src/ui-v2/ui-script.ts` | 修复竞态条件、光标位置、键盘导航滚动、选择索引重置 |

## [3.1.5] - 2025-02-10

### Added
- **Claude Opus 4.6 模型支持**
  - 新增 `claude-opus-4-6` 到有效模型列表
  - 添加定价配置（$5.00/$25.00 per M tokens）
  - 模型选择器 UI 新增 Opus 4.6 选项
  - 更新模型描述：4.6 Latest、4.5 Previous、4.1 Classic

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | 版本号更新至 3.1.5 |
| `src/providers/ClaudeChatProvider.ts` | 添加 Opus 4.6 定价和显示名称映射 |
| `src/ui-v2/getBodyContent.ts` | 添加 Opus 4.6 模型选择器选项和描述 |
| `src/ui-v2/ui-script.ts` | 添加 Opus 4.6 radio ID 映射和统计格式化 |
| `src/utils/constants.ts` | 添加 `claude-opus-4-6` 到 VALID_MODELS |

## [3.1.4] - 2025-01-29

### Added
- **macOS 平台支持** 🎉
  - 扩展现在可以在 macOS 上运行
  - 支持三种 Claude CLI 安装方式：官方安装器、Homebrew、npm
  - 支持 nvm 安装的 Node.js/npm 环境

### Changed
- **平台兼容性重构**
  - `package.json` 添加 `darwin` 平台支持
  - `EnvironmentChecker.ts` 添加 Mac 环境检查（不检查 Git Bash）
  - `WindowsCompatibility.ts` 添加 Mac 执行环境配置
  - `utils.ts` 函数重命名：`updateClaudeMdWithWindowsInfo` → `updateClaudeMdWithPlatformInfo`
  - `ClaudeChatProvider.ts` 更新调用以支持跨平台

- **CLAUDE.md 平台信息**
  - Mac: 显示 macOS 版本和当前 shell
  - Windows: 保持原有 Windows + Git Bash 信息

- **CLI 路径查找优化**
  - Mac: 支持 `~/.local/bin`、Homebrew、nvm 路径
  - Mac: 只查找无扩展名可执行文件（不查找 .cmd/.exe）

- **npm 查找优化**
  - Mac: 支持 Homebrew 和 nvm 安装的 npm
  - 找不到 npm 时不再弹窗报错（改为 console.warn）

### Fixed
- **恢复调试自动编译**
  - `launch.json` 恢复 `preLaunchTask`，F5 调试前自动编译 TypeScript
- **打包体积优化**
  - `.vscodeignore` 排除 `*.vsix` 和 `*.zip` 文件，避免旧版本打包产物被混入 VSIX

### Files Modified
| File | Changes |
|------|---------|
| `package.json` | 添加 `darwin` 到 `os` 字段 |
| `src/extension.ts` | `~/.claude` 目录创建改为跨平台 |
| `src/utils/EnvironmentChecker.ts` | 添加 Mac CLI 检查 + nvm 支持 |
| `src/utils/utils.ts` | 平台信息函数重构 |
| `src/utils/npmFinder.ts` | 添加 Mac npm 路径 + nvm 支持 |
| `src/managers/WindowsCompatibility.ts` | 添加 Mac 执行环境、错误提示、PATH 设置 |
| `src/providers/ClaudeChatProvider.ts` | 更新函数调用和变量名 |
| `.vscode/launch.json` | 恢复 `preLaunchTask` 自动编译 |
| `.vscodeignore` | 排除 `*.vsix`、`*.zip` 打包产物 |

### Notes
- Windows 功能保持不变（回归兼容）
- 可选修改（类名重命名、Mac shell 配置项）未实现

## [3.1.3] - 2025-01-23

### Added
- **支持 Claude Code 原生安装器路径**
  - 新增 `~/.local/bin/` 搜索路径（官方 PowerShell/WinGet 安装位置）
  - 新增 `~/.claude/bin/` 备用搜索路径
  - 搜索优先级：原生安装器 > npm > Bun

### Changed
- **npm 依赖改为可选**
  - 未安装 npm 时不再报错，继续检查其他安装路径
  - 支持无 Node.js 环境使用原生安装器安装的 Claude Code
- **错误提示更新为中文**
  - 推荐使用官方原生安装方式
  - 标注 npm 安装方式已弃用

### Files Modified
| File | Changes |
|------|---------|
| `src/managers/WindowsCompatibility.ts` | 添加原生路径搜索、PATH 注入、更新错误提示 |
| `src/utils/EnvironmentChecker.ts` | npm 改为可选、扩展搜索路径、更新安装提示 |

### Background
Anthropic 官方在 Claude Code 2.1.15 版本后弃用了 npm 安装方式，推荐使用原生安装器：
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
