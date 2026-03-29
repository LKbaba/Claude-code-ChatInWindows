# Hooks GUI Management Panel — 开发任务清单

## 概述

基于 `specs/updatePRDv1.md` Phase 1 (Hooks GUI Foundation) 的开发计划。本次实现 v4.0.2 的核心功能：在 VS Code 扩展中提供 Hooks 的 GUI 管理面板，让用户无需手动编辑 JSON 即可管理 Claude Code hooks。

**相关文档**：
- PRD：`specs/updatePRDv1.md`（第 5 章）
- 架构基线：`CLAUDE.md`
- 模板参考：Skills UI（`SkillManager.ts` + `getBodyContent.ts` + `ui-script.ts` + `ClaudeChatProvider.ts`）

**总任务数**：5 个（全部完成 ✅）
**版本目标**：v4.0.2
**完成日期**：2026-03-29

---

## 任务列表

### Task 1: 创建 HooksConfigManager 服务
**预计时间**: 1.5 小时
**依赖**: 无
**关联需求**: PRD 5.1 数据模型, PRD 5.2 HooksConfigManager Service, PRD 5.4 Quick Templates
**状态**: [x]

**上下文摘要**:
> 这是整个 Hooks GUI 的后端基础。需要创建一个 Singleton（单例）服务来管理三个 scope（global / project / project-local）的 hooks 配置。该服务负责读取、解析、写入 settings JSON 文件中的 `hooks` 字段，并提供预置模板。模式完全参照现有的 `SkillManager.ts`（622 行，Singleton + 三级 scope + 缓存）。

**AI 提示词**:

ultrathink

你是一位资深 VS Code 扩展开发专家，精通 TypeScript + Node.js + VS Code Extension API，擅长设计 Singleton（单例）服务和文件系统操作。

请在 `src/services/HooksConfigManager.ts` 创建一个新的 Hooks 配置管理服务。

## 背景

这是 Claude Code ChatUI VS Code 扩展（v4.0.2）的一部分。扩展通过 Claude Code CLI 与 AI 交互，CLI 支持 hooks（生命周期钩子）。hooks 配置存储在 JSON settings 文件中，有三个 scope 层级。

现有的 `src/services/SkillManager.ts` 是一个成熟的 Singleton（单例）服务模板，请严格参照其模式。

## 需求

### 1. 数据模型（接口定义）

```typescript
export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionStart' | 'UserPromptSubmit';
export type HookScope = 'global' | 'project' | 'project-local';

export interface ConfiguredHook {
  id: string;           // UUID (crypto.randomUUID())
  event: HookEvent;
  matcher: string;      // glob pattern for tool name, '' for match-all
  type: 'command';
  command: string;      // shell command to execute
  description: string;  // user-facing label
  scope: HookScope;
  enabled: boolean;
}

export interface HookTemplate {
  name: string;
  description: string;
  event: HookEvent;
  matcher: string;
  command: string;
}
```

### 2. Singleton（单例）模式

参照 SkillManager 的实现：
- `private static instance: HooksConfigManager`
- `private constructor()`
- `public static getInstance(): HooksConfigManager`

### 3. 核心公共方法

| 方法 | 签名 | 描述 |
|------|------|------|
| `getInstance` | `static getInstance(): HooksConfigManager` | 获取单例 |
| `setWorkspacePath` | `setWorkspacePath(path: string \| undefined): void` | 设置工作区路径 |
| `loadConfiguredHooks` | `loadConfiguredHooks(forceReload?: boolean): Promise<ConfiguredHook[]>` | 加载所有 scope 的 hooks |
| `getCachedHooks` | `getCachedHooks(): ConfiguredHook[]` | 获取缓存的 hooks |
| `addHook` | `addHook(hook: Omit<ConfiguredHook, 'id'>): Promise<ConfiguredHook>` | 添加 hook 到指定 scope 的 settings 文件 |
| `removeHook` | `removeHook(hookId: string): Promise<void>` | 从 settings 文件中删除 hook |
| `toggleHookState` | `toggleHookState(hookId: string): Promise<boolean>` | 切换 enabled 状态，返回新状态 |
| `updateHook` | `updateHook(hookId: string, changes: Partial<ConfiguredHook>): Promise<void>` | 更新 hook 配置 |
| `getTemplates` | `getTemplates(): HookTemplate[]` | 获取预置模板列表 |
| `clearCache` | `clearCache(): void` | 清除缓存 |

### 4. 三个 Settings 文件路径

```typescript
import * as os from 'os';
import * as path from 'path';

// Global: ~/.claude/settings.json
const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

// Project: {workspacePath}/.claude/settings.json
const projectSettingsPath = path.join(this.workspacePath, '.claude', 'settings.json');

// Project-local: {workspacePath}/.claude/settings.local.json
const projectLocalSettingsPath = path.join(this.workspacePath, '.claude', 'settings.local.json');
```

### 5. Settings JSON 中 hooks 的格式

```json
{
  "permissions": { ... },
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

**重要**：
- 每个 event 类型下是一个 matcher 数组
- 每个 matcher 下又有一个 hooks 数组（支持同一 matcher 多个 hook）
- `matcher` 为空字符串 `""` 表示匹配所有
- 读取时需要将这个嵌套结构扁平化为 `ConfiguredHook[]`
- 写入时需要从 `ConfiguredHook[]` 重建嵌套结构

### 6. 读取策略

```typescript
private async loadHooksFromFile(filePath: string, scope: HookScope): Promise<ConfiguredHook[]> {
  // 1. Read file, parse JSON (handle file-not-found gracefully)
  // 2. Extract .hooks section
  // 3. Flatten nested structure into ConfiguredHook[]
  // 4. Generate UUID for each hook (id is transient, not persisted)
  // 5. Set scope tag on each hook
  // 6. enabled = true by default (CLI format has no enabled field)
}
```

**enabled 状态管理**：CLI 的 hooks 格式没有 `enabled` 字段。我们需要一种方式标记禁用的 hook。策略：在 settings 文件中维护一个额外的 `_disabledHooks` 数组，存储被禁用 hook 的特征（event + matcher + command），读取时用来判断 enabled 状态。

```json
{
  "hooks": { ... },
  "_disabledHooks": [
    { "event": "PreToolUse", "matcher": "Bash", "command": "bash /path/to/hook.sh" }
  ]
}
```

当 hook 被禁用时：从 `hooks` 中移除该条目，同时添加到 `_disabledHooks`。启用时反向操作。

### 7. 写入策略

```typescript
private async writeHooksToFile(filePath: string, scope: HookScope, hooks: ConfiguredHook[]): Promise<void> {
  // 1. Read existing file content (preserve other fields like permissions, plugins)
  // 2. Separate enabled and disabled hooks
  // 3. Rebuild nested hooks structure from enabled ConfiguredHook[]
  // 4. Update _disabledHooks array from disabled ConfiguredHook[]
  // 5. Write back with JSON.stringify(data, null, 2)
  // 6. Handle directory creation if needed (fs.mkdirSync recursive)
}
```

### 8. 预置模板

> **实际实现说明**：经过社区研究和用户反馈，最终只保留一个跨平台模板。模板命令根据 `process.platform` 动态生成。

```typescript
public getTemplates(): HookTemplate[] {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  let notifyCmd: string;
  if (isWin) {
    // PowerShell MessageBox notification
    notifyCmd = 'powershell -Command "cat | Out-Null; [System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\') | Out-Null; [System.Windows.Forms.MessageBox]::Show(\'Claude Code task completed\', \'Claude Code\', 0, 64) | Out-Null; echo \'{}\'"';
  } else if (isMac) {
    // macOS native notification
    notifyCmd = 'bash -c \'cat > /dev/null; osascript -e "display notification \\"Task completed\\" with title \\"Claude Code\\""; echo "{}"\'';
  } else {
    // Linux desktop notification
    notifyCmd = 'bash -c \'cat > /dev/null; notify-send "Claude Code" "Task completed"; echo "{}"\'';
  }

  return [{
    name: 'Completion Notification',
    description: 'Show a system notification when Claude finishes a task',
    event: 'Stop',
    matcher: '',
    command: notifyCmd
  }];
}
```

**设计决策**：早期版本包含 Tool Logger、Bash Guard、Session Timer 三个模板，但社区研究后发现：
- 复杂的嵌套 shell 引号在 JSON 序列化 → 文件写入 → CLI 读取链中容易损坏
- 用户更需要一个开箱即用的高价值模板，而不是多个需要调试的模板
- Completion Notification 是社区最受欢迎的 hook 用例之一

## 技术要求

- 文件位置：`src/services/HooksConfigManager.ts`
- 使用 `import { debugLog, debugError } from './DebugLogger';` 进行日志记录
- 使用 Node.js `fs/promises`（异步）进行文件操作
- 使用 `crypto.randomUUID()` 生成 hook ID
- 不引入任何新的 npm 依赖

## 约束条件

- 严格参照 `src/services/SkillManager.ts` 的 Singleton（单例）模式和代码风格
- **绝对不能**覆盖 settings 文件中的其他字段（permissions、enabledPlugins 等）
- 读取文件失败时优雅降级（返回空数组，不抛异常）
- 所有代码注释使用英文

## 参考

- `src/services/SkillManager.ts` — Singleton（单例）模式、三级 scope、缓存策略
- `specs/updatePRDv1.md` 第 4.3 节 — Hook 配置 JSON 格式
- `specs/updatePRDv1.md` 第 5.2 节 — HooksConfigManager 设计

**验收标准**:
- [x] 文件创建成功，TypeScript 编译无错误
- [x] 能正确读取 `~/.claude/settings.json` 中的 hooks 配置
- [x] 能正确读取项目级别的 `.claude/settings.local.json` 中的 hooks 配置
- [x] 写入操作不会破坏 settings 文件中的其他字段
- [x] 模板列表可正常获取

---

### Task 2: 注册 HooksConfigManager + 添加消息处理器
**预计时间**: 1 小时
**依赖**: Task 1
**关联需求**: PRD 5.5 文件修改列表, PRD 5.6 消息协议
**状态**: [x]

**上下文摘要**:
> Task 1 创建了 HooksConfigManager 服务。本任务需要在两个文件中完成接线：(1) `extension.ts` 中注册单例，(2) `ClaudeChatProvider.ts` 中添加 webview 消息处理器。模式严格遵循 PluginManager（注册）和 Skills 消息处理器（getInstalledSkills/toggleSkillState）的现有实现。

**AI 提示词**:

你是一位资深 VS Code 扩展开发专家，精通 TypeScript + VS Code Webview API，擅长消息传递架构和服务注册。

请在现有两个文件中添加 HooksConfigManager 的接线代码。

## 背景

Task 1 已创建 `src/services/HooksConfigManager.ts`（Singleton 服务）。现在需要：
1. 在 `extension.ts` 中初始化该单例
2. 在 `ClaudeChatProvider.ts` 中添加 webview 消息处理器

## 需求

### Part A: extension.ts 注册

在 `src/extension.ts` 中添加 HooksConfigManager 的初始化。

**插入位置**：在 PluginManager 初始化之后（约 line 83）、Provider 构造之前（约 line 85）。

**参照模式**（PluginManager，lines 76-83）：
```typescript
// Initialize PluginManager
try {
    const pluginManager = PluginManager.getInstance();
    await pluginManager.loadInstalledPlugins();
} catch (error) {
    // Non-blocking — extension works without plugins
}
```

**要添加的代码**：
```typescript
import { HooksConfigManager } from './services/HooksConfigManager';

// Initialize HooksConfigManager (after PluginManager block)
try {
    const hooksConfigManager = HooksConfigManager.getInstance();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    hooksConfigManager.setWorkspacePath(workspaceFolder?.uri.fsPath);
} catch (error) {
    // Non-blocking — extension works without hooks management
}
```

不需要 push 到 `context.subscriptions`（Singleton 无 dispose）。

### Part B: ClaudeChatProvider.ts 消息处理器

在 `src/providers/ClaudeChatProvider.ts` 中添加 5 个新的消息处理分支。

**Step 1**：添加 import（文件顶部）：
```typescript
import { HooksConfigManager } from '../services/HooksConfigManager';
```

**Step 2**：在 `show()` 方法的 switch 语句中添加 5 个 case（在 Skills 相关 case 之后）：

```typescript
case 'getConfiguredHooks':
    this._getConfiguredHooks();
    return;
case 'refreshHooks':
    this._refreshHooks();
    return;
case 'addHook':
    await this._addHook(message.hook);
    return;
case 'removeHook':
    await this._removeHook(message.hookId);
    return;
case 'toggleHookState':
    await this._toggleHookState(message.hookId);
    return;
case 'updateHook':
    await this._updateHook(message.hookId, message.changes);
    return;
```

**Step 3**：添加 6 个 private 方法（在 Skills 方法之后）：

参照 `_getInstalledSkills()` 的模式（line 2258）：
```typescript
private async _getConfiguredHooks(): Promise<void> {
    try {
        const hooksManager = HooksConfigManager.getInstance();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        hooksManager.setWorkspacePath(workspaceFolder?.uri.fsPath);
        const hooks = await hooksManager.loadConfiguredHooks();
        this._panel?.webview.postMessage({ type: 'configuredHooksUpdated', hooks });
        debugLog('HooksManager', `Sent ${hooks.length} hook(s) to webview`);
    } catch (error: any) {
        debugError('HooksManager', 'Failed to load hooks', error);
        this._panel?.webview.postMessage({ type: 'configuredHooksUpdated', hooks: [], error: 'Failed to load hooks' });
    }
}
```

参照 `_refreshSkills()` 的模式（line 2288）：
```typescript
private async _refreshHooks(): Promise<void> {
    try {
        const hooksManager = HooksConfigManager.getInstance();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        hooksManager.setWorkspacePath(workspaceFolder?.uri.fsPath);
        hooksManager.clearCache();
        const hooks = await hooksManager.loadConfiguredHooks(true);
        this._panel?.webview.postMessage({ type: 'configuredHooksUpdated', hooks });
    } catch (error: any) {
        debugError('HooksManager', 'Failed to refresh hooks', error);
        this._panel?.webview.postMessage({ type: 'configuredHooksUpdated', hooks: [], error: 'Failed to refresh hooks' });
    }
}
```

同理实现 `_addHook`、`_removeHook`、`_toggleHookState`、`_updateHook`：
- 每个方法获取 singleton → 调用对应方法 → postMessage 结果
- `_addHook` 成功后 postMessage `{ type: 'hookAdded', hook }`
- `_removeHook` 成功后 postMessage `{ type: 'hookRemoved', hookId }`
- `_toggleHookState` 成功后 postMessage `{ type: 'hookStateChanged', hookId, enabled }`
- `_updateHook` 成功后 postMessage `{ type: 'hookUpdated', hookId }`
- 所有方法都包裹在 try/catch 中，错误时 postMessage `{ type: 'hookError', message: error.message }`

## 技术要求

- 使用 `debugLog` 和 `debugError` 进行日志记录（已有 import）
- 遵循现有的 switch/case + return 模式（不用 break）
- 所有方法都是 async 并返回 Promise<void>

## 约束条件

- 不修改现有的 Skills / Plugins 消息处理代码
- 不修改 switch 的 default 行为（无 default case）
- 代码注释使用英文

## 参考

- `src/extension.ts` lines 76-83 — PluginManager 注册模式
- `src/providers/ClaudeChatProvider.ts` lines 273-284 — Skills 消息路由
- `src/providers/ClaudeChatProvider.ts` lines 2258-2348 — Skills 处理器实现

**验收标准**:
- [x] `npm run compile` 编译成功
- [x] extension.ts 中 HooksConfigManager 初始化无报错
- [x] ClaudeChatProvider 中 6 个新 case 和 6 个新方法已添加
- [x] 消息类型与 PRD 5.6 协议一致

---

### Task 3: Hooks 按钮 + Modal HTML
**预计时间**: 1 小时
**依赖**: 无（可与 Task 1-2 并行）
**关联需求**: PRD 5.3 GUI Layout
**状态**: [x]

**上下文摘要**:
> 在 webview 的底部控制栏添加 Hooks 按钮，并创建 Hooks 管理弹窗的 HTML 结构。完全参照现有的 Skills 按钮（line 103-108）和 Skills Modal（lines 293-315）的 HTML 模式。

**AI 提示词**:

你是一位资深 VS Code Webview UI 开发专家，精通 HTML + CSS + TypeScript 模板字符串，擅长在已有 UI 架构中增量添加组件。

请在 `src/ui-v2/getBodyContent.ts` 中添加 Hooks 按钮和 Hooks 管理弹窗的 HTML。

## 背景

这是 Claude Code ChatUI VS Code 扩展的 webview UI 文件。整个 UI 是一个 TypeScript 模板字符串，生成完整的 HTML body。当前文件中已有多个 modal（Tools、Plugins、Skills），我们需要添加一个新的 Hooks Modal。

**关键约束**：
- CSP 策略使用 `'unsafe-inline'`，所以 `onclick` 内联事件处理器是可以的
- 不能使用 nonce 或外部脚本（会冻结 UI）
- 所有样式通过 CSS 类或内联 style

## 需求

### Part A: Hooks 按钮

在 Skills 按钮之后（约 line 108 之后）、`.left-controls` 闭合 `</div>` 之前，插入：

```html
<button class="plugins-btn" id="hooks-button" onclick="showHooksModal()" title="Manage hooks">
    Hooks
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
        <path d="M1 2.5l3 3 3-3"></path>
    </svg>
</button>
```

使用现有的 `plugins-btn` CSS 类（与 Skills 按钮一致）。

### Part B: Hooks Modal HTML

在 Skills Modal 之后（约 line 315 之后），插入完整的 Hooks Modal：

```html
<!-- Hooks management modal -->
<div id="hooksModal" class="tools-modal" style="display: none;">
    <div class="tools-modal-content hooks-modal-content">
        <div class="tools-modal-header">
            <span>Hooks Management</span>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button class="btn outlined" id="add-hook-btn"
                        onclick="showAddHookForm()"
                        title="Add a new hook"
                        style="font-size: 11px; padding: 2px 8px;">
                    + Add
                </button>
                <button class="btn outlined" id="hook-templates-btn"
                        onclick="showHookTemplates()"
                        title="Quick templates"
                        style="font-size: 11px; padding: 2px 8px;">
                    Templates
                </button>
                <button class="btn outlined" id="refresh-hooks-btn"
                        onclick="handleRefreshHooks()"
                        title="Refresh hook list"
                        style="font-size: 11px; padding: 2px 8px;">
                    Refresh
                </button>
                <button class="tools-close-btn" onclick="hideHooksModal()">x</button>
            </div>
        </div>

        <!-- Add/Edit hook form (hidden by default) -->
        <div id="hookFormContainer" style="display: none; padding: 12px; border-bottom: 1px solid var(--vscode-panel-border);">
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; gap: 8px;">
                    <select id="hookEventSelect" style="flex: 1; padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px;">
                        <option value="PreToolUse">PreToolUse</option>
                        <option value="PostToolUse">PostToolUse</option>
                        <option value="Stop">Stop</option>
                        <option value="SessionStart">SessionStart</option>
                        <option value="UserPromptSubmit">UserPromptSubmit</option>
                    </select>
                    <select id="hookScopeSelect" style="flex: 1; padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px;">
                        <option value="project-local">Project Local</option>
                        <option value="global">Global</option>
                        <option value="project">Project</option>
                    </select>
                </div>
                <input id="hookMatcherInput" type="text" placeholder="Matcher (e.g., Bash, *, or empty for all)"
                       style="padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px;" />
                <input id="hookCommandInput" type="text" placeholder="Command (e.g., bash /path/to/hook.sh)"
                       style="padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px;" />
                <input id="hookDescriptionInput" type="text" placeholder="Description (optional)"
                       style="padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px;" />
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="btn outlined" onclick="cancelHookForm()" style="font-size: 11px; padding: 2px 12px;">Cancel</button>
                    <button class="btn primary" id="hookFormSubmitBtn" onclick="submitHookForm()" style="font-size: 11px; padding: 2px 12px;">Add Hook</button>
                </div>
            </div>
        </div>

        <!-- Templates dropdown (hidden by default) -->
        <div id="hookTemplatesContainer" style="display: none; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border);">
            <div id="hookTemplatesList" style="display: flex; flex-direction: column; gap: 4px;">
                <!-- Templates will be dynamically populated -->
            </div>
        </div>

        <div class="hooks-status" id="hooks-status">
            Loading hooks...
        </div>
        <div id="hooksList" class="skills-list">
            <!-- Hooks will be dynamically populated -->
        </div>
    </div>
</div>
```

### Part C: hooks-modal-content 样式

在 `src/ui-v2/index.ts` 的 `<style>` 块中，如果需要额外样式（检查 `.skills-modal-content` 是否有特殊样式）。多数情况下，复用 `.tools-modal-content` 和 `.skills-list` 已有样式即可。如果 `.hooks-modal-content` 需要特别调整（例如更宽一些来显示命令），添加：

```css
.hooks-modal-content {
    max-width: 600px;
}
```

## 技术要求

- 文件位置：`src/ui-v2/getBodyContent.ts`
- 遵循现有的 HTML 模式（inline onclick、CSS 类复用）
- 使用 VS Code 主题变量（`var(--vscode-*)`）
- 所有用户可见文本使用英文（按钮标签、placeholder）

## 约束条件

- 不修改已有的 Skills / Plugins / Tools modal 代码
- 不修改 CSP 策略
- 保持与现有按钮的视觉一致性（使用 `plugins-btn` 类）
- 代码注释使用英文
- 不要为版本号做任何修改（版本号更新在 Task 5）

## 参考

- Skills 按钮：`getBodyContent.ts` lines 103-108
- Skills Modal：`getBodyContent.ts` lines 293-315
- PRD 5.3 GUI Layout 示意图

**验收标准**:
- [x] Hooks 按钮出现在 Skills 按钮右侧
- [x] 点击 Hooks 按钮能打开 Hooks Modal
- [x] Modal 包含 Add / Templates / Refresh / Close 按钮
- [x] Add Hook 表单包含 Event、Scope、Matcher、Command、Description 字段
- [x] 视觉风格与 Skills Modal 一致

---

### Task 4: 前端 JavaScript 逻辑
**预计时间**: 2 小时
**依赖**: Task 2, Task 3
**关联需求**: PRD 5.3 GUI 交互, PRD 5.6 消息协议
**状态**: [x]

**上下文摘要**:
> Task 3 添加了 Hooks Modal 的 HTML 骨架，Task 2 添加了后端消息处理器。本任务在 `ui-script.ts` 中实现所有前端交互逻辑：modal 显示/隐藏、hooks 列表渲染（按 scope 分组）、添加/编辑/删除/启禁操作、模板应用、消息监听。这是最大的一个任务，参照 Skills 前端 JS（`showSkillsModal()` 到 `handleSkillToggle()` 约 300 行）。

**AI 提示词**:

ultrathink

你是一位资深前端开发专家，精通 JavaScript + VS Code Webview API + 模板字符串编程，擅长在大型单文件 JS 模块中增量添加功能。

请在 `src/ui-v2/ui-script.ts` 中添加 Hooks 管理面板的全部前端逻辑。

## 背景

`ui-script.ts` 是一个特殊文件——它导出一个 TypeScript 函数，该函数返回一个巨大的模板字符串，内容是完整的浏览器端 JavaScript 代码。这意味着：

1. **双层转义**：源码中的 `\\\\` → JS 输出 `\\` → 运行时 `\`
2. **模板字面量（Template Literal）**：代码中的反引号需要转义为 `` \` ``
3. **所有函数都是全局函数**（没有模块系统）
4. **通过 `vscode.postMessage()` 与扩展通信**

已有的 Skills 功能（lines 1647-1960）是完美的参考模板。

## 需求

### 1. Modal 显示/隐藏函数

参照 `showSkillsModal()` (line 1653) 和 `hideSkillsModal()` (line 1670)：

```javascript
function showHooksModal() {
    var modal = document.getElementById('hooksModal');
    if (modal) { modal.style.display = 'flex'; }
    var status = document.getElementById('hooks-status');
    if (status) { status.textContent = 'Loading hooks...'; }
    vscode.postMessage({ type: 'getConfiguredHooks' });
}

function hideHooksModal() {
    var modal = document.getElementById('hooksModal');
    if (modal) { modal.style.display = 'none'; }
    cancelHookForm();
}
```

### 2. Hooks 列表渲染

参照 `updateSkillsList()` (line 1697) + `renderSkillsList()` (line 1740) + `renderSkillItems()` (line 1831)：

```javascript
function updateHooksList(hooks) {
    hooks = hooks || [];
    // Group by scope
    var globalHooks = hooks.filter(function(h) { return h.scope === 'global'; });
    var projectHooks = hooks.filter(function(h) { return h.scope === 'project'; });
    var projectLocalHooks = hooks.filter(function(h) { return h.scope === 'project-local'; });

    // Update status
    var enabledCount = hooks.filter(function(h) { return h.enabled; }).length;
    var disabledCount = hooks.length - enabledCount;
    var statusEl = document.getElementById('hooks-status');
    if (statusEl) {
        statusEl.textContent = 'Active: ' + enabledCount + '  Disabled: ' + disabledCount + '  Total: ' + hooks.length;
    }

    // Render list
    var listEl = document.getElementById('hooksList');
    if (listEl) {
        listEl.innerHTML = renderHooksList(globalHooks, projectHooks, projectLocalHooks);
    }
}
```

`renderHooksList()` 应生成三个 `<details>` 分组（Global / Project / Project-Local），每个分组内调用 `renderHookItems(hooks)` 生成单个 hook 的 HTML。

每个 hook item 的 HTML 结构：
```html
<div class="skill-item" data-hook-id="{id}" data-hook-scope="{scope}">
    <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
        <input type="checkbox" {checked} onchange="handleHookToggle(event, '{id}')" title="Enable/disable" />
        <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500;">{event}: {description || command}</div>
            <div style="font-size: 11px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                matcher: {matcher || '(all)'}  |  cmd: {command}
            </div>
        </div>
        <button class="btn outlined" onclick="editHook('{id}')" style="font-size: 10px; padding: 1px 6px;">Edit</button>
        <button class="btn outlined" onclick="deleteHook('{id}')" style="font-size: 10px; padding: 1px 6px; color: var(--vscode-errorForeground);">Delete</button>
    </div>
</div>
```

**重要**：所有用户内容（description、command、matcher）必须用 `escapeHtml()` 转义后再插入 HTML。在 onclick 属性中的值必须用 `escapeForOnclick()` 转义。

### 3. CRUD 操作处理器

```javascript
// Toggle hook enabled/disabled
function handleHookToggle(event, hookId) {
    event.stopPropagation();
    vscode.postMessage({ type: 'toggleHookState', hookId: hookId });
}

// Delete hook (no confirm — VS Code webview confirm() is unreliable)
function deleteHook(hookId) {
    vscode.postMessage({ type: 'removeHook', hookId: hookId });
}

// Edit hook - populate form with existing data
function editHook(hookId) {
    // Find hook in current data (store hooks in a module-level variable)
    var hook = currentHooks.find(function(h) { return h.id === hookId; });
    if (!hook) return;
    // Populate form fields
    document.getElementById('hookEventSelect').value = hook.event;
    document.getElementById('hookScopeSelect').value = hook.scope;
    document.getElementById('hookMatcherInput').value = hook.matcher;
    document.getElementById('hookCommandInput').value = hook.command;
    document.getElementById('hookDescriptionInput').value = hook.description || '';
    // Change form mode to edit
    editingHookId = hookId;
    document.getElementById('hookFormSubmitBtn').textContent = 'Update Hook';
    document.getElementById('hookFormContainer').style.display = 'block';
}
```

### 4. Add/Edit 表单逻辑

```javascript
var editingHookId = null;   // null = add mode, string = edit mode
var currentHooks = [];       // cached hooks for edit lookup

function showAddHookForm() {
    editingHookId = null;
    // Reset form
    document.getElementById('hookEventSelect').value = 'PreToolUse';
    document.getElementById('hookScopeSelect').value = 'project-local';
    document.getElementById('hookMatcherInput').value = '';
    document.getElementById('hookCommandInput').value = '';
    document.getElementById('hookDescriptionInput').value = '';
    document.getElementById('hookFormSubmitBtn').textContent = 'Add Hook';
    document.getElementById('hookFormContainer').style.display = 'block';
    document.getElementById('hookTemplatesContainer').style.display = 'none';
}

function cancelHookForm() {
    document.getElementById('hookFormContainer').style.display = 'none';
    editingHookId = null;
}

function submitHookForm() {
    var event = document.getElementById('hookEventSelect').value;
    var scope = document.getElementById('hookScopeSelect').value;
    var matcher = document.getElementById('hookMatcherInput').value.trim();
    var command = document.getElementById('hookCommandInput').value.trim();
    var description = document.getElementById('hookDescriptionInput').value.trim();

    if (!command) {
        alert('Command is required');
        return;
    }

    if (editingHookId) {
        vscode.postMessage({
            type: 'updateHook',
            hookId: editingHookId,
            changes: { event: event, scope: scope, matcher: matcher, command: command, description: description }
        });
    } else {
        vscode.postMessage({
            type: 'addHook',
            hook: { event: event, scope: scope, matcher: matcher, type: 'command', command: command, description: description, enabled: true }
        });
    }
    cancelHookForm();
}
```

### 5. Templates 逻辑

```javascript
function showHookTemplates() {
    var container = document.getElementById('hookTemplatesContainer');
    var isVisible = container.style.display !== 'none';
    container.style.display = isVisible ? 'none' : 'block';
    document.getElementById('hookFormContainer').style.display = 'none';

    if (!isVisible) {
        // Request templates from extension (or hardcode in frontend)
        vscode.postMessage({ type: 'getHookTemplates' });
    }
}

function updateHookTemplates(templates) {
    var listEl = document.getElementById('hookTemplatesList');
    if (!listEl) return;
    listEl.innerHTML = templates.map(function(t) {
        return '<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">' +
            '<div><strong>' + escapeHtml(t.name) + '</strong> <span style="opacity: 0.7; font-size: 11px;">(' + escapeHtml(t.event) + ')</span><br/>' +
            '<span style="font-size: 11px; opacity: 0.7;">' + escapeHtml(t.description) + '</span></div>' +
            '<button class="btn outlined" onclick="applyHookTemplate(' + "'" + escapeForOnclick(t.name) + "'" + ')" style="font-size: 10px; padding: 1px 8px;">Use</button>' +
            '</div>';
    }).join('');
}

function applyHookTemplate(templateName) {
    vscode.postMessage({ type: 'applyHookTemplate', templateName: templateName });
}
```

### 6. 消息监听器

在已有的 `window.addEventListener('message', ...)` switch 中添加（参照 `installedSkillsUpdated` 和 `skillStateChanged` 的位置，约 line 2996）：

```javascript
case 'configuredHooksUpdated':
    currentHooks = message.hooks || [];
    updateHooksList(currentHooks);
    break;

case 'hookStateChanged':
case 'hookAdded':
case 'hookRemoved':
case 'hookUpdated':
    // Re-fetch full list after any mutation
    vscode.postMessage({ type: 'getConfiguredHooks' });
    break;

case 'hookTemplatesUpdated':
    updateHookTemplates(message.templates || []);
    break;

case 'hookError':
    alert('Hook error: ' + (message.message || 'Unknown error'));
    break;
```

### 7. Backdrop 点击关闭

参照 Skills Modal 的 backdrop 注册（line 1958-1963），在同一区域添加：

```javascript
document.getElementById('hooksModal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('hooksModal')) {
        hideHooksModal();
    }
});
```

### 8. Refresh 按钮处理

```javascript
function handleRefreshHooks() {
    var btn = document.getElementById('refresh-hooks-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Refreshing...'; }
    vscode.postMessage({ type: 'refreshHooks' });
}
```

在 `updateHooksList` 最后恢复按钮状态。

## 技术要求

- 文件位置：`src/ui-v2/ui-script.ts`
- **所有 HTML 字符串中的用户数据必须用 `escapeHtml()` 转义**
- **onclick 属性中的值必须用 `escapeForOnclick()` 转义**
- 使用 `var` 而非 `let/const`（保持文件一致性）
- 所有函数都是全局函数（不用 IIFE 或模块）
- 注意双层转义：这是 TypeScript 模板字符串中的 JS 代码

## 约束条件

- 不修改已有的 Skills / Plugins / Tools 相关 JS 代码
- 保持文件现有的代码风格和缩进
- 函数命名遵循现有模式（`show*Modal`, `hide*Modal`, `update*List`, `handle*Toggle`）
- 代码注释使用英文

## 参考

- Skills JS 函数：`ui-script.ts` lines 1647-1960
- `escapeHtml()` 和 `escapeForOnclick()` 函数（文件中已存在）
- 消息监听器：`ui-script.ts` line 2546+（switch/case 结构）
- PRD 5.3 GUI Layout + 5.6 消息协议

**验收标准**:
- [x] 点击 Hooks 按钮能打开 Modal 并加载 hooks 列表
- [x] Hooks 按 scope 分组显示（Global / Project / Project-Local）
- [x] checkbox 切换能正确启用/禁用 hook
- [x] Add 表单能正确创建新 hook
- [x] Edit 能预填充表单并更新
- [x] Delete 直接删除（VS Code webview 中 confirm() 不可靠，已移除确认弹窗）
- [x] Templates 能显示并应用
- [x] 点击 backdrop 或 x 能关闭 Modal
- [x] 无 XSS 漏洞（所有用户数据已转义）

---

### Task 5: 版本号更新 + 编译验证 + 集成测试
**预计时间**: 0.5 小时
**依赖**: Task 1, 2, 3, 4
**关联需求**: CLAUDE.md Version Release Checklist
**状态**: [x]

**上下文摘要**:
> 所有代码改动完成后，按照 CLAUDE.md 的版本发布清单更新版本号，编译项目，并进行手动集成测试。

**AI 提示词**:

你是一位资深 VS Code 扩展开发专家，精通 TypeScript 编译和 VSIX 打包流程。

请完成版本号更新和编译验证。

## 背景

Hooks GUI 的所有代码已经完成（Task 1-4）。现在需要按照 `CLAUDE.md` 的 Version Release Checklist 更新版本号并验证编译。

## 需求

### 1. 更新版本号（三个位置）

**位置 1**: `package.json` → `"version": "4.0.2"`

**位置 2**: `src/ui-v2/getBodyContent.ts` → 版本显示字符串
搜索 `v4.0.1`，替换为 `v4.0.2`

**位置 3**: `CHANGELOG.md` → 在文件顶部添加新版本 section
```markdown
## v4.0.2 (2026-03-28)

### New Features
- **Hooks GUI Management Panel**: Full GUI for managing Claude Code hooks
  - Add/edit/delete hooks with scope selection (global/project/project-local)
  - Enable/disable hooks via checkbox toggle
  - Cross-platform Completion Notification template (Windows/macOS/Linux)
  - Grouped display by scope with details/summary sections
- **HooksConfigManager service**: Singleton service for reading/writing hook configurations
  - Three-scope settings file support (~/.claude/settings.json, .claude/settings.json, .claude/settings.local.json)
  - Safe read-modify-write that preserves other settings fields
  - Disabled hook tracking via _disabledHooks array
```

### 2. 编译验证

```bash
npm run compile
```

确保无 TypeScript 编译错误。

### 3. 打包 VSIX（可选，用于验证）

```bash
cmd //c "npx @vscode/vsce package --no-dependencies"
```

验证输出文件名为 `claude-code-chatui-4.0.2.vsix`。

### 4. 手动测试清单

在 Extension Development Host (F5) 中验证：
- [x] Hooks 按钮出现在 Skills 按钮右侧
- [x] 点击 Hooks 按钮打开 Modal
- [x] 如果 `~/.claude/settings.json` 中有 hooks，能正确显示
- [x] Add Hook 表单能创建新 hook
- [x] Toggle checkbox 能启用/禁用 hook
- [x] Delete 能删除 hook
- [x] Templates 能显示预置模板
- [x] Refresh 按钮能重新加载
- [x] Modal 关闭方式正常（x 按钮、backdrop 点击）
- [x] 版本号显示为 v4.0.2

## 约束条件

- 打包必须使用 `cmd //c "..."` 包装（Git Bash 直接运行 vsce 会静默失败）
- 确保 `.vscodeignore` 中有 `specs/**` 和 `test-hooks/**`

**验收标准**:
- [x] 三个位置的版本号均更新为 4.0.2
- [x] `npm run compile` 零错误
- [x] VSIX 打包成功
- [x] Extension Development Host 中 Hooks 面板功能正常

---

## 验收检查点

完成以下任务后进行阶段验收：

- [x] **检查点 1**（Task 1-2 完成后）：后端服务验收
  - HooksConfigManager 能正确读取/写入 settings 文件 ✅
  - 消息处理器能正确响应 webview 消息 ✅
  - `npm run compile` 编译通过 ✅

- [x] **检查点 2**（Task 3-4 完成后）：前端 UI 验收
  - Hooks Modal 在 Extension Development Host 中正确显示 ✅
  - 所有交互（CRUD、toggle、templates）正常工作 ✅
  - 无 XSS 漏洞 ✅

- [x] **检查点 3**（Task 5 完成后）：集成测试验收
  - 完整流程测试：添加 hook → 查看 → 禁用 → 启用 → 删除 ✅
  - 版本号正确（v4.0.2） ✅
  - VSIX 打包成功（claude-code-chatui-4.0.2.vsix, 452.81 KB） ✅

> **实际实现备注**（2026-03-29 更新）：
> - `confirm()` 在 VS Code webview 中不可靠，delete 操作已改为直接删除
> - 模板从 5 个（Tool Logger, Bash Guard, Ralph Loop, Message Inbox, Session Timer）精简为 1 个跨平台 Completion Notification
> - 模板命令根据 `process.platform` 动态生成，支持 Windows/macOS/Linux
