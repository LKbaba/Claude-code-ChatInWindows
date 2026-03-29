# Claude Code ChatUI v4.0.2 — Hooks 集成与 Agent 编排 PRD

> **版本**: v1.2
> **日期**: 2026-03-29
> **状态**: Phase 1 已完成，Phase 1.1（UI 打磨）进行中，Phase 2-4 待定
> **目标版本**: v4.0.2（Phase 1）、v4.0.3（Phase 1.1 UI 打磨）、v4.1+（Phase 2-4）
> **维护者**: 独立开发者 + Claude Code

---

## 目录

1. [概要](#1-概要)
2. [背景与动机](#2-背景与动机)
3. [当前架构基线](#3-当前架构基线)
4. [调研发现](#4-调研发现)
5. [功能1：Hooks GUI 管理面板](#5-功能1hooks-gui-管理面板)
6. [功能2：tmux 风格中途干预](#6-功能2tmux-风格中途干预)
7. [功能3：Ralph Loop（自动迭代开发）](#7-功能3ralph-loop自动迭代开发)
8. [架构决策](#8-架构决策)
9. [实施路线图](#9-实施路线图)
10. [风险与缓解](#10-风险与缓解)

---

## 1. 概要

v4.0.2 将 Claude Code hooks 集成到 VS Code 扩展中，让用户通过 GUI 控制 hook 生命周期事件，无需手动编辑 JSON。这是后续两个高级功能的基础：tmux 风格中途干预（在 Claude 工作期间重定向指令）和 Ralph Loop（使用 Stop hook 的自动迭代开发）。

### 核心交付物（v4.0.2 — 已完成）

| 功能 | 优先级 | 状态 | 架构变更 |
|------|--------|------|---------|
| Hooks GUI 管理面板 | P0 | ✅ 已完成 | 新增服务 + UI 弹窗 |
| 项目级 hook 注入 | P0 | ✅ 已完成 | 写入 `.claude/settings.local.json` |
| 快速 hook 模板 | P1 | ✅ 已完成 | 内置跨平台任务完成通知模板 |

### Phase 1.1 交付物（v4.0.3 — UI 打磨）

| 功能 | 优先级 | 状态 | 架构变更 |
|------|--------|------|---------|
| Hooks 按钮带计数显示 | P0 | 待开发 | 按钮文本："Hooks" → "Hooks: All" / "Hooks: N" |
| Hook 项目启用/禁用药丸标签 | P0 | 待开发 | checkbox 替换为 `.skill-state-btn` 药丸标签 |
| Scope 分组 CSS class 对齐 | P1 | 待开发 | inline style 替换为 `skill-category*` class |
| `.hooks-status` CSS 规则 | P1 | 待开发 | 补充缺失的 CSS（与 `.skills-status` 一致） |
| Hook 项目布局优化 | P1 | 待开发 | 对齐 Skills 项目结构（名称 + 标签 + 描述） |
| 模板区域视觉升级 | P2 | 待开发 | 与 scope 分组样式保持一致 |

### 未来交付物（v4.1+）

| 功能 | 优先级 | 架构变更 |
|------|--------|---------|
| 通过 Stop hook 实现 Ralph Loop | P1 | 新 hook 脚本 + UI 开关 |
| 通过 PreToolUse hook 实现 Message Inbox | P2 | 新 hook 脚本 + inbox 文件 + UI |
| Control Protocol（非 -p 模式） | P3 | ClaudeProcessService 大规模重构 |

---

## 2. 背景与动机

### 2.1 Claude Code Hooks（CLI v2.1.85+）

Claude Code CLI 支持 **hooks** —— 用户定义的 shell 命令，在对话的特定生命周期事件中执行。Hooks 配置在 settings JSON 文件中，通过 stdin 接收上下文，通过 stdout 返回控制信号。

扩展当前**未向用户暴露任何 hooks 功能**。用户必须手动编辑 `~/.claude/settings.json` 来配置 hooks，容易出错且无法看到哪些 hooks 处于活跃状态。

### 2.2 Agent Swarm / OpenClaw 模式

Elvis (@elvissun) 记录了一种使用 OpenClaw 作为编排层的"一人开发团队"模式：

- **架构**：编排器（Zoe）在隔离的 git worktree + tmux 会话中生成编码 agent
- **中途干预**：`tmux send-keys -t session "new instruction" Enter` 可在任务执行期间重定向 agent
- **监控**：每 10 分钟的 cron 任务检查 tmux 会话健康状态、PR 状态、CI 结果
- **Ralph Loop V2**：当 agent 失败时，编排器使用额外上下文（客户历史、会议记录、过往失败）重新提示，而非重放相同的 prompt
- **规模**：94 次提交/天、30 分钟内 7 个 PR、约 $190/月（Claude + Codex）

这个模式启发了两个未来功能：中途干预和 Ralph Loop。

### 2.3 用户核心需求

1. **Hooks GUI**：从扩展 UI 管理 hooks，而非手动编辑 JSON
2. **中途重定向**：在 Claude 工作时告诉它"停下来，改做这个"（类 tmux 模式）
3. **自动迭代**：Claude 持续工作直到任务满足指定标准（Ralph Loop）
4. **不破坏协议**：保持 `-p` 模式和 `--dangerously-skip-permissions` —— 当前架构运行正常

---

## 3. 当前架构基线

### 3.1 CLI 通信

```
User input → Webview postMessage → ClaudeChatProvider
  → ClaudeProcessService (stdin JSON) → Claude CLI (-p mode)
  → stdout JSON stream → MessageProcessor → postMessage → Webview
```

**关键参数**（`ClaudeProcessService.ts`）：
```
claude -p --output-format stream-json --input-format stream-json --verbose --dangerously-skip-permissions
```

**stdin 流程**：
1. `stdin.write(JSON.stringify(userMessage) + '\n')` — 发送消息
2. `stdin.end()` — 在 `-p` 模式下**必须调用**；CLI 等待 EOF 后才开始处理

> **关键约束**：`stdin.end()` 不是可选的。CLI 在收到 EOF 之前会一直阻塞。这意味着一旦发送消息，stdin 管道就关闭了，无法再次写入。这是 `-p` 模式的基本限制。

### 3.2 权限模型

- `--dangerously-skip-permissions` 跳过所有权限提示
- 截至 v2.1.85 **未被弃用**，但 v2.1.77+ 有已知 bug（某些工具仍会弹出提示）
- Auto 模式是新的官方替代方案，但扩展使用绕过模式以实现非交互式操作

### 3.3 Settings 文件层级

| 文件 | 范围 | 示例路径 |
|------|------|---------|
| Global | 全局用户级 | `~/.claude/settings.json` |
| Project | 按仓库，共享 | `.claude/settings.json` |
| Project-local | 按仓库，gitignore | `.claude/settings.local.json` |

三个文件都可以包含 `"hooks"` 字段。Claude CLI 合并时 project-local 优先级最高。

### 3.4 Skills UI 架构（作为 Hooks UI 的模板）

现有的 Skills 管理面板是 Hooks 的直接参考模板：

| 组件 | 文件 | 职责 |
|------|------|------|
| SkillManager | `src/services/SkillManager.ts` | 单例，三级 scope 加载，基于文件系统的状态管理 |
| Modal HTML | `src/ui-v2/getBodyContent.ts` | `<div id="skillsModal">`，包含 header、status、list |
| 前端 JS | `src/ui-v2/ui-script.ts` | `showSkillsModal()`、`updateSkillsList()`、消息处理器 |
| 消息路由 | `src/providers/ClaudeChatProvider.ts` | `getInstalledSkills`、`toggleSkillState` 等 |

**数据流模式**：
```
用户点击按钮 → showModal() → postMessage({type: 'getHooks'})
  → Provider 接收 → HooksConfigManager.loadHooks()
  → postMessage({type: 'hooksUpdated', hooks}) → 前端渲染列表
```

---

## 4. 调研发现

### 4.1 Hooks 在 `-p` 模式下正常工作（已验证）

**测试日期**：2026-03-28
**CLI 版本**：v2.1.85
**测试方法**：创建 hook 脚本，在 `~/.claude/settings.json` 中配置，在 `-p` 模式下运行 CLI

**测试脚本**（在 `test-hooks/` 中）：
- `test-hook.sh` — PreToolUse hook，将每次工具调用记录到 `~/hook-test.log`
- `stop-hook.sh` — Stop hook，在 Claude 完成时记录日志并返回 `{"continue": false}`

**结果**：

| Hook 事件 | 在 `-p` 模式下触发？ | 备注 |
|-----------|---------------------|------|
| PreToolUse | 是 | 在每次工具调用前触发（Read、Edit、Bash 等） |
| PostToolUse | 是 | 在工具执行完成后触发 |
| Stop | 是 | 在 Claude 完成时触发；`{"continue": true}` 可重启 |
| SessionStart | 是 | 在会话开始时触发一次 |
| UserPromptSubmit | 是 | 在收到用户 prompt 时触发 |
| PermissionRequest | 否 | 在 `-p` 模式下不触发（权限已被绕过） |

**日志输出示例**：
```
2026-03-28 04:00:00 HOOK_FIRED "tool_name":"Read"
2026-03-28 04:00:02 HOOK_FIRED "tool_name":"Edit"
2026-03-28 04:00:05 STOP_HOOK_FIRED
Input: {"session_id":"...","transcript":[...]}
```

**结论**：除 PermissionRequest 外，所有 hooks 在 `-p --dangerously-skip-permissions` 模式下均正常工作。无需架构变更即可支持 hooks。

### 4.2 Hook 数据格式

**PreToolUse hook stdin**（JSON）：
```json
{
  "session_id": "abc123",
  "tool_name": "Read",
  "tool_input": {
    "file_path": "/path/to/file"
  }
}
```

**PreToolUse hook stdout**（JSON）：
```json
{}                                          // 透传 — 允许工具执行
{"decision": "block", "reason": "..."}      // 阻止工具执行
{"decision": "allow"}                       // 明确允许
```

**Stop hook stdin**（JSON）：
```json
{
  "session_id": "abc123",
  "transcript": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

**Stop hook stdout**（JSON）：
```json
{"continue": false}     // 让 Claude 正常退出
{"continue": true}      // 让 Claude 带着上下文重新启动
```

### 4.3 Hook 配置格式

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

- `matcher`：工具名的 glob 匹配模式（仅 PreToolUse/PostToolUse），`""` 或 `"*"` 表示匹配所有
- 每个事件支持多个 hooks
- 每个事件支持多个 matcher

### 4.4 三种中途干预方案

| 方案 | 机制 | 架构变更 | 延迟 | 复杂度 |
|------|------|---------|------|--------|
| A. Ralph Loop | Stop hook 返回 `{"continue": true}` | 无 | 仅回合结束时 | 低 |
| B. Message Inbox | PreToolUse hook 检查文件中的指令 | 无 | 每次工具调用前 | 中 |
| C. Control Protocol | 移除 `-p` 模式，保持 stdin 打开 | 大规模重构 | 实时 | 高 |

**方案 A — Ralph Loop（推荐优先实施）**：
- Stop hook 在 Claude 完成一个回合时触发
- Hook 检查任务是否完成；如未完成，返回 `{"continue": true}` 并附带更新的指令
- 零架构变更 — 只需一个 hook 脚本和 UI 开关
- 限制：只能在回合之间干预，无法在任务执行中途干预

**方案 B — Message Inbox（推荐第二步实施）**：
- PreToolUse hook 在每次工具调用前检查"邮箱"文件（如 `.claude/inbox.txt`）
- 如果文件有内容，hook 注入指令；用户通过 UI 写入文件
- 零架构变更 — 只需一个 hook 脚本和文件监听器
- 限制：仅在工具调用前触发，长时间计算期间无法干预

**方案 C — Control Protocol（未来考虑）**：
- 移除 `-p` 标志，保持 stdin 管道打开，以 NDJSON 行发送消息
- 真正的实时干预，类似 tmux
- 需要 `ClaudeProcessService.ts` 的大规模重构
- 风险：未文档化的协议，CLI 更新可能破坏兼容性
- 好处：完全匹配 tmux `send-keys` 模式

---

## 5. 功能1：Hooks GUI 管理面板

### 5.1 数据模型

```typescript
interface ConfiguredHook {
  id: string;           // UUID
  event: HookEvent;     // 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionStart' | 'UserPromptSubmit'
  matcher: string;      // 工具名的 glob 匹配模式，'' 表示匹配所有
  type: 'command';      // 当前仅支持 'command' 类型
  command: string;      // 要执行的 shell 命令
  description: string;  // 用户可见的标签
  scope: 'global' | 'project' | 'project-local';
  enabled: boolean;     // 启用/禁用开关（不删除）
}

type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionStart' | 'UserPromptSubmit';
```

### 5.2 HooksConfigManager 服务

**新文件**：`src/services/HooksConfigManager.ts`

**模式**：Singleton（单例），与 SkillManager 相同

**职责**：
1. 从三个 settings 文件（global、project、project-local）加载 hooks
2. 将原始 JSON 解析为带生成 ID 的 `ConfiguredHook[]`
3. 将 hooks 写回对应的 settings 文件
4. 启用/禁用 hooks（切换 `enabled` 标志，重写 JSON）
5. 添加/删除 hooks
6. 提供 hook 模板（预置的实用 hooks）

**文件路径**：
```typescript
const SETTINGS_PATHS = {
  global: path.join(os.homedir(), '.claude', 'settings.json'),
  project: path.join(workspaceRoot, '.claude', 'settings.json'),
  'project-local': path.join(workspaceRoot, '.claude', 'settings.local.json')
};
```

**读取策略**：解析 JSON，提取 `hooks` 字段，展平为带 scope 标记的 `ConfiguredHook[]`。

**写入策略**：读取完整 settings 文件 → 仅修改 `hooks` 字段 → 写回。绝不覆盖其他设置（permissions、plugins 等）。

### 5.3 GUI 布局

#### 工具栏按钮（底部栏）

格式必须与 Plugins 和 Skills 按钮一致：`"Hooks ▼"` 带动态计数。

| 状态 | 按钮文本 |
|------|---------|
| 未配置 hooks | `Hooks ▼` |
| 所有 hooks 已启用 | `Hooks: All ▼` |
| 部分启用（5 个中 3 个启用） | `Hooks: 3 ▼` |

> **说明**：Skills 和 Plugins 按钮当前显示静态的 "Skills: All" / "Plugins: All"，没有动态更新。Hooks 按钮应遵循同样的格式以保持视觉一致性，并为未来的动态计数更新做准备。

#### 弹窗布局（目标 — v4.0.3 打磨后）

```
┌─────────────────────────────────────────────┐
│  Hooks Management          [+ Add] [Templates] [Refresh] ✕ │
├─────────────────────────────────────────────┤
│  已加载 3 个 hook，跨 2 个 scope            │  ← .hooks-status（带样式）
│                                             │
│  ▼ Global (~/.claude/settings.json) (1)     │  ← <details class="skill-category">
│  ┌─────────────────────────────────────┐    │
│  │  PreToolUse: 记录所有工具调用       │    │  ← .skill-name-text
│  │  [Enabled]                    📋    │    │  ← .skill-state-btn.is-enabled（绿色药丸）
│  │  matcher: * | cmd: bash ~/log.sh    │    │  ← .skill-description
│  │                      [Edit] [Delete]│    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ▼ Project Local (.claude/settings.local)   │
│  ┌─────────────────────────────────────┐    │
│  │  Stop: 任务完成通知                 │    │
│  │  [Enabled]                    📋    │    │
│  │  matcher: (all) | cmd: powershell...│    │
│  │                      [Edit] [Delete]│    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  PreToolUse: 阻止危险写入           │    │
│  │  [Disabled]                   📋    │    │  ← .skill-state-btn.is-disabled（红色药丸）
│  │  matcher: Edit | cmd: bash ~/gua... │    │
│  │                      [Edit] [Delete]│    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ► Project (.claude/settings.json) (0)      │  ← 折叠，无内容
└─────────────────────────────────────────────┘
```

**关键交互**：
- **启用/禁用药丸标签**：点击切换状态（重写 settings JSON）— 使用 `.skill-state-btn` 绿/红药丸，与 Skills 面板一致
- **[+ Add]**：打开内联表单（事件下拉、matcher、命令、scope）
- **[Templates]**：展开模板区域，显示预置 hooks
- **[Edit]**：打开预填充数据的内联表单
- **[Delete]**：直接删除（无确认弹窗 — VS Code webview 的 `confirm()` 不可靠）
- **Scope 分组**：使用 `<details class="skill-category">` + `skill-category-header` 子类，与 Skills 面板一致

### 5.4 快速模板

模板基于用户平台（`process.platform`）动态生成。

| 模板 | 事件 | Matcher | 说明 | 平台 |
|------|------|---------|------|------|
| Completion Notification | Stop | _（空）_ | Claude 完成任务时弹出系统通知 | 跨平台 |

**各平台通知命令**：
- **Windows**：通过 `System.Windows.Forms` 的 PowerShell `MessageBox`
- **macOS**：`osascript` + `display notification`
- **Linux**：`notify-send` 桌面通知

> **设计决策**：早期版本包含 Tool Logger、Bash Guard、Session Timer 和 Ralph Loop 模板。经过社区调研和用户反馈后移除 — 一个高价值的跨平台模板优于多个需要平台调试的小众模板。

### 5.5 需要修改/创建的文件

| 文件 | 操作 | 变更内容 |
|------|------|---------|
| `src/services/HooksConfigManager.ts` | 新建 | 单例服务、CRUD 操作、模板定义 |
| `src/ui-v2/getBodyContent.ts` | 修改 | 添加 Hooks 按钮 + 弹窗 HTML |
| `src/ui-v2/ui-script.ts` | 修改 | 添加 `showHooksModal()`、`renderHooksList()`、表单处理 |
| `src/providers/ClaudeChatProvider.ts` | 修改 | 添加消息处理器：`getHooks`、`addHook`、`removeHook`、`toggleHook` |
| `src/extension.ts` | 修改 | 在激活时注册 HooksConfigManager |

### 5.6 消息协议

**Webview → Extension**：
```typescript
{ type: 'getConfiguredHooks' }
{ type: 'addHook', hook: Partial<ConfiguredHook> }
{ type: 'removeHook', hookId: string }
{ type: 'toggleHookState', hookId: string }
{ type: 'updateHook', hookId: string, changes: Partial<ConfiguredHook> }
```

**Extension → Webview**：
```typescript
{ type: 'configuredHooksUpdated', hooks: ConfiguredHook[] }
{ type: 'hookStateChanged', hookId: string, enabled: boolean }
{ type: 'hookError', message: string }
```

### 5.7 UI 一致性升级（Phase 1.1 — v4.0.3）

Phase 1 的 Hooks GUI 功能完整，但视觉风格与现有 Skills / MCP 面板存在明显差距。Phase 1.1 专注于 UI 打磨，不增加新功能。

#### 5.7.1 Hooks 按钮文本（底部工具栏）

**现状**：按钮显示 `Hooks ▼`，无状态计数。
**目标**：显示 `Hooks: All ▼`（全部启用时）或 `Hooks: N ▼`（部分启用时），与 `Plugins: All ▼` / `Skills: All ▼` 格式一致。

**实现方式**：
- 在 `updateHooksList()` 中，渲染列表后同时更新按钮文本
- 按钮 ID 已存在：`#hooks-button`
- 逻辑：`enabledCount === totalCount ? "Hooks: All" : "Hooks: " + enabledCount`
- 无 hooks 时显示 `Hooks ▼`（不带冒号）

#### 5.7.2 Hook 项目布局（对齐 Skills 项目结构）

**现状**：Hook 项目使用 `<input type="checkbox">` + 纯文本 + inline style，布局松散。
**目标**：采用与 Skills 一致的 `.skill-item` → `.skill-content` → `.skill-header-row` 结构。

**对照表**：

| 元素 | Skills 当前实现 | Hooks 当前实现 | Hooks 目标 |
|------|----------------|---------------|-----------|
| 容器 | `div.skill-item` | `div.skill-item`（已复用） | 保持 |
| 启用/禁用 | `.skill-state-btn.is-enabled/is-disabled` 绿/红药丸 | `<input type="checkbox">` | 改为 `.skill-state-btn` 药丸 |
| 名称 | `.skill-name-text`（粗体） | `div style="font-weight:500"` | 改为 `.skill-name-text` |
| 描述 | `.skill-description`（浅色） | `div style="font-size:11px; opacity:0.7"` | 改为 `.skill-description` |
| 操作按钮 | 无（Skills 没有 Edit/Delete） | `btn outlined` Edit + Delete | 保持，放入 `.skill-header-right` |
| 名称格式 | `{skill-name}` | `{event}: {description \|\| command}` | `{event}: {description}`（命令移到描述行） |

**Hook item 目标 HTML 结构**：
```html
<div class="skill-item [is-disabled]" data-hook-id="{id}">
  <div class="skill-content">
    <div class="skill-header-row">
      <div class="skill-header-left">
        <span class="skill-name-text">{event}: {displayName}</span>
        <button class="skill-state-btn [is-enabled|is-disabled]"
                onclick="handleHookToggle(event, '{id}')">
          Enabled / Disabled
        </button>
      </div>
      <div class="skill-header-right">
        <button class="btn outlined" onclick="editHook('{id}')"
                style="font-size: 10px; padding: 1px 6px;">Edit</button>
        <button class="btn outlined" onclick="deleteHook('{id}')"
                style="font-size: 10px; padding: 1px 6px; color: var(--vscode-errorForeground);">Delete</button>
      </div>
    </div>
    <div class="skill-description">
      matcher: {matcher || '(all)'}  |  cmd: {command}
    </div>
  </div>
</div>
```

#### 5.7.3 Scope 分组（对齐 Skills 分组样式）

**现状**：`<details style="margin: 4px 8px;">` + `<summary style="...">` — 全部 inline style。
**目标**：使用 Skills 已有的 CSS class 体系。

**对照表**：

| 元素 | Skills 实现 | Hooks 目标 |
|------|-----------|-----------|
| 容器 | `<details class="skill-category" open>` | 同左 |
| 标题 | `<summary class="skill-category-header [scope]">` | 同左 |
| 折叠指示 | `<span class="collapse-indicator">▶</span>` | 同左 |
| 类别名 | `<span class="category-title">User Global</span>` | `<span class="category-title">Global</span>` |
| 路径说明 | `<span class="category-path">all projects</span>` | `<span class="category-path">~/.claude/settings.json</span>` |

**Scope 到 CSS class 映射**：

| Hook scope | CSS class | category-title | category-path |
|-----------|-----------|---------------|---------------|
| `global` | `skill-category-header user` | Global | `~/.claude/settings.json` |
| `project` | `skill-category-header workspace` | Project | `.claude/settings.json` |
| `project-local` | `skill-category-header workspace` | Project Local | `.claude/settings.local.json` |

#### 5.7.4 Status 栏样式

**现状**：`<div class="hooks-status">` 存在于 HTML 中，但 CSS 中无 `.hooks-status` 规则，文本无样式。
**目标**：添加 `.hooks-status` CSS 规则，与 `.skills-status` 完全一致。

```css
.hooks-status {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
}
```

**Status 文本格式**：从 `Active: 2  Disabled: 1  Total: 3` 改为 `Loaded 3 hook(s) across 2 scope(s)`，与 Skills 状态栏格式一致。

#### 5.7.5 Templates 区域优化

**现状**：模板以纯文本列表显示，样式简陋。
**目标**：模板卡片使用 `.skill-item` 容器样式，名称用 `.skill-name-text`，描述用 `.skill-description`，"Use" 按钮样式与 Skills 的 copy 按钮区域对齐。

#### 5.7.6 涉及文件

| 文件 | 变更内容 |
|------|---------|
| `src/ui-v2/getBodyContent.ts` | 更新 Hooks 按钮默认文本；重构 Modal 中 scope group HTML |
| `src/ui-v2/ui-script.ts` | 重构 `renderHookItem()`、`renderHooksScopeGroup()`；新增按钮文本更新逻辑 |
| `src/ui-v2/index.ts` | 添加 `.hooks-status` CSS 规则 |

> **约束**：不修改任何 Skills / Plugins 的现有代码或样式。Hooks 复用现有 CSS class，不新增 hook-specific class。

---

## 6. 功能2：tmux 风格中途干预

### 6.1 问题陈述

在当前架构下，一旦消息发送给 Claude CLI（`stdin.write()` + `stdin.end()`），在 Claude 完成并重新生成进程之前，无法发送额外指令。用户必须等待当前回合完成或直接终止进程。

tmux 模式（来自 Agent Swarm 方案）允许 `send-keys` 向运行中的终端会话注入文本：
```bash
tmux send-keys -t session "Stop. Focus on the API layer first." Enter
```

在 `-p` 模式下这是**不可能的**，因为 stdin 在发送初始消息后已关闭。

### 6.2 方案 A — Ralph Loop（Stop Hook）

**工作原理**：
1. 配置一个 Stop hook 来检查"任务文件"中的完成标准
2. 当 Claude 完成一个回合时，hook 评估结果
3. 如未满足标准，返回 `{"continue": true}` — Claude 带着上下文重启
4. 如已满足标准，返回 `{"continue": false}` — Claude 正常退出

**用户交互**：
- 从 UI 开启/关闭 "Ralph Loop"
- 设置任务标准（自由文本或结构化清单）
- 查看迭代次数和状态
- 覆盖操作：随时强制停止（终止进程）

**限制**：
- 只能在回合之间干预（不能在工具调用中途）
- 每次迭代以完整对话记录上下文开始新回合
- 上下文窗口随每次迭代增长

### 6.3 方案 B — Message Inbox（PreToolUse Hook）

**工作原理**：
1. 配置一个 PreToolUse hook，在每次工具调用前检查 `.claude/inbox.txt`
2. 用户通过 UI 向 inbox 文件写入指令
3. Hook 读取文件；如果非空，修改工具行为或阻止工具
4. Hook 读取后清空文件

**用户交互**：
- UI 中的文本输入框："发送指令给 Claude"（活跃会话期间始终可见）
- 消息在下一次工具调用前出现在 Claude 的上下文中
- 状态指示："指令已排队" → "指令已投递"

**限制**：
- 仅在工具调用前触发，长时间计算期间无法干预
- Hook 必须精心编写，注入消息时不能破坏工具流程
- 时机不可预测 — 取决于下一次工具调用发生的时间

### 6.4 方案 C — Control Protocol（未来）

**工作原理**：
1. 移除 CLI spawn 中的 `-p` 标志
2. 保持 stdin 管道打开（不调用 `stdin.end()`）
3. 以 NDJSON 行发送消息：`{"type": "user", "message": {...}}\n`
4. Claude 将每条消息作为同一会话中的新回合处理

**这能实现什么**：
- 真正的实时干预（类似 tmux `send-keys`）
- 单进程中的多轮对话
- 无需重新生成进程即可恢复会话

**这需要什么**：
- `ClaudeProcessService.ts` 的大规模重构（移除 stdin.end()、改变消息流）
- 对话回合的新状态机（pending → processing → complete）
- 每次 CLI 更新都需要协议兼容性测试
- CLI 不支持此模式时的降级处理

**当前评估**：推迟。该协议未文档化，依赖它有风险。方案 A 和 B 以零架构变更提供了 80% 的价值。

---

## 7. 功能3：Ralph Loop（自动迭代开发）

### 7.1 概念

基于 Agent Swarm 文章中的 Ralph Loop V2 模式：

> "当 agent 失败时，编排器不会简单地用相同的 prompt 重新生成。它会带着完整上下文审视失败并找出解决方法。"

在我们的场景中：Stop hook 评估任务是否完成。如未完成，为下一次迭代提供反馈。

### 7.2 机制

```
用户发送任务 → Claude 工作 → Claude 完成（Stop 事件触发）
  → Stop hook 评估对话记录
  → 如果完成：{"continue": false} → 结束
  → 如果未完成：{"continue": true} → Claude 带着对话记录 + 反馈重启
  → 重复直到完成或达到最大迭代次数
```

### 7.3 评估策略

| 策略 | 复杂度 | 说明 |
|------|--------|------|
| 简单计数器 | 低 | 运行 N 次迭代后停止 |
| 基于文件检查 | 中 | 检查特定文件是否存在或包含预期内容 |
| 测试运行器 | 中 | 运行测试；如有失败则继续 |
| LLM 评估 | 高 | 使用第二个 LLM 评估对话记录 |

### 7.4 Hook 脚本设计

```bash
#!/bin/bash
# ralph-loop.sh — 用于迭代开发的 Stop hook
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

# 运行测试或其他评估
if npm test 2>&1 | tail -1 | grep -q "passed"; then
  echo '{"continue": false}'
else
  echo '{"continue": true}'
fi
```

### 7.5 UI 集成

- **开关**：Hooks 面板或专用区域中的 "Enable Ralph Loop" 复选框
- **配置**：最大迭代次数（默认 5）、评估命令（默认：`npm test`）
- **状态**："迭代 3/5 — 测试失败：剩余 2 个"
- **覆盖操作**："强制停止" 按钮，无论 hook 状态如何都终止进程

---

## 8. 架构决策

### 8.1 保持 `-p` 模式

**决策**：保持 `-p`（print）模式作为主要 CLI 通信方式。

**理由**：
- Hooks 在 `-p` 模式下正常工作（已验证）
- 单次模式（stdin 写入 → stdin 结束 → stdout 流 → 进程退出）简单且可靠
- 移除 `-p` 模式以启用 control protocol 是一次大规模重构，且协议风险未知
- Ralph Loop 和 Message Inbox 无需协议变更即可提供中途干预能力

### 8.2 保持 `--dangerously-skip-permissions`

**决策**：继续使用 `--dangerously-skip-permissions` 进行非交互式操作。

**理由**：
- Auto 模式是新的官方替代方案，但某些决策需要交互式终端
- 扩展以非交互模式运行（stdin 是管道，不是 TTY）
- 尽管 v2.1.77+ 有已知 bug，绕过模式仍然是自动化操作最可靠的选择

### 8.3 使用 Project-Local Hooks（非 Project Hooks）

**决策**：扩展管理的 hooks 写入 `.claude/settings.local.json`，而非 `.claude/settings.json`。

**理由**：
- `.claude/settings.local.json` 通常被 gitignore — 不会意外提交用户特定的 hook 路径
- 项目级 `.claude/settings.json` 可能在团队成员之间共享
- 用户如需共享 hooks，仍可手动添加到 `.claude/settings.json`

### 8.4 Hook 脚本存储在项目中

**决策**：扩展管理的 hook 脚本存储在工作区的 `.claude/hooks/` 中。

**理由**：
- 与项目共置，便于移植
- `.claude/` 目录通常被 gitignore
- 全局 hooks 保存在 `~/.claude/hooks/` 中供跨项目使用

---

## 9. 实施路线图

### Phase 1：Hooks GUI 基础（v4.0.2）— ✅ 已完成

| 步骤 | 任务 | 文件 | 状态 |
|------|------|------|------|
| 1 | 创建 `HooksConfigManager.ts` | 新文件（~400 行） | ✅ 已完成 |
| 2 | 在 header 栏添加 Hooks 按钮 | `getBodyContent.ts` | ✅ 已完成 |
| 3 | 添加 Hooks 弹窗 HTML | `getBodyContent.ts`（~70 行） | ✅ 已完成 |
| 4 | 添加前端 JS（显示/渲染/CRUD） | `ui-script.ts`（~200 行） | ✅ 已完成 |
| 5 | 添加消息处理器 | `ClaudeChatProvider.ts`（8 个 case + 8 个方法） | ✅ 已完成 |
| 6 | 添加快速模板 | `HooksConfigManager.ts`（1 个跨平台模板） | ✅ 已完成 |

**实际范围**：跨 6 个文件约 700 行新增/修改代码。

### Phase 1.1：Hooks UI 打磨（v4.0.3）

| 步骤 | 任务 | 文件 | 工作量 |
|------|------|------|--------|
| 1 | Hooks 按钮文本：`Hooks ▼` → `Hooks: All ▼` / `Hooks: N ▼` | `getBodyContent.ts`、`ui-script.ts` | 小 |
| 2 | Hook 项目：checkbox → `.skill-state-btn` 绿/红药丸 | `ui-script.ts` | 中 |
| 3 | Hook 项目布局：采用 `.skill-content` → `.skill-header-row` 结构 | `ui-script.ts` | 中 |
| 4 | Scope 分组：inline style → `skill-category*` CSS class | `ui-script.ts` | 小 |
| 5 | 添加 `.hooks-status` CSS 规则 + 更新 status 文本格式 | `index.ts`、`ui-script.ts` | 小 |
| 6 | Templates 区域样式对齐 | `ui-script.ts` | 小 |

### Phase 2：Ralph Loop（v4.1）

| 步骤 | 任务 | 文件 | 工作量 |
|------|------|------|--------|
| 1 | 创建 `ralph-loop.sh` 模板 | `.claude/hooks/` | 小 |
| 2 | 在 UI 添加 Ralph Loop 开关 | `getBodyContent.ts`、`ui-script.ts` | 中 |
| 3 | 添加迭代追踪显示 | `ui-script.ts` | 中 |
| 4 | 添加强制停止覆盖 | `ClaudeChatProvider.ts` | 小 |

### Phase 3：Message Inbox（v4.2）

| 步骤 | 任务 | 文件 | 工作量 |
|------|------|------|--------|
| 1 | 创建 `inbox-hook.sh` 模板 | `.claude/hooks/` | 小 |
| 2 | 在聊天 UI 添加"发送指令"输入框 | `getBodyContent.ts`、`ui-script.ts` | 中 |
| 3 | 文件监听器确认 inbox 投递 | `ClaudeChatProvider.ts` | 中 |
| 4 | 启用时自动配置 hook | `HooksConfigManager.ts` | 小 |

### Phase 4：Control Protocol（v5.0 — 有条件）

仅在以下条件满足时推进：
- Claude CLI 官方文档化非 `-p` NDJSON 协议
- 方案 A 和 B 被证明无法满足用户需求
- 协议在各 CLI 版本间保持稳定

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| CLI 更新破坏 hook 行为 | 高 | 锁定最低 CLI 版本，添加版本检查警告 |
| Hook 脚本静默失败 | 中 | 添加 hook 健康检查（启用时试运行），记录到输出通道 |
| Settings JSON 损坏 | 高 | 读取-修改-写回 + JSON 验证，写入前备份 |
| Ralph Loop 无限迭代 | 中 | 硬性上限（默认 5 次，最大 20 次）+ 强制停止按钮 |
| Message Inbox 竞态条件 | 低 | Hook 原子性读取 + 清空，使用临时文件交换 |
| CSP 与新弹窗冲突 | 低 | 新弹窗使用相同的 inline 事件处理器模式（无需修改 CSP） |
| `--dangerously-skip-permissions` 被弃用 | 中 | 监控 CLI 变更日志，准备 Auto 模式降级方案 |

---

## 附录 A：测试制品

测试脚本在 `test-hooks/` 中（不包含在 VSIX 中）：

- `test-hook.sh` — PreToolUse 日志记录器（2026-03-28 验证通过）
- `stop-hook.sh` — 返回 `{"continue": false}` 的 Stop hook（2026-03-28 验证通过）
- `README-hooks-test.md` — 手动测试流程

## 附录 B：Agent Swarm 参考

来源：Elvis (@elvissun)，"OpenClaw + Codex/ClaudeCode Agent Swarm: The One-Person Dev Team"，2026-02-23

适用于本项目的关键模式：

1. **每个 agent 一个 tmux 会话**：`tmux new-session -d -s "agent-name" -c "/path/to/worktree" "claude -p ..."`
2. **中途干预**：`tmux send-keys -t session "redirect instruction" Enter`
3. **任务注册表**：`.clawdbot/active-tasks.json` 追踪 agent 状态、分支、PR
4. **Cron 监控**：每 10 分钟脚本检查 tmux 健康状态、CI 状态、自动重生
5. **Ralph Loop V2**：失败时编排器用额外上下文（客户历史、会议记录）重新提示，而非重放相同 prompt
