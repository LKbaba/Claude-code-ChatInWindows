# updatePRDv3 — Hooks 系统升级

> 版本：v3.0 | 创建日期：2026-03-30 | 完成日期：2026-03-30 | 状态：**已完成 ✓**

## 1. 背景与动机

### 1.1 插件角色定位

插件是 Claude Code CLI 的 **settings.json 配置编辑器** — 它不执行 hooks，只读写 `~/.claude/settings.json`（及项目级的 `.claude/settings.json` / `.claude/settings.local.json`）。CLI 负责解析和执行 hooks。

因此，插件的目标是：**完整、无损地展示和编辑** CLI 支持的 hooks 配置，而非自己实现 hooks 执行引擎。

### 1.2 当前问题

**P0 — 数据丢失 bug**：

当前 `HooksConfigManager` 在写回 hook 条目时只保留 `{ type: 'command', command }` 两个字段（`HooksConfigManager.ts:193,294,380`）。如果用户在 settings.json 中手动添加了 `if`、`timeout`、`async`、`shell` 等字段，插件下次修改该 hook 组时会**永久删除**这些字段。

**P1 — 事件遗漏**：

`HookEvent` 类型只定义了 5 个事件（`HooksConfigManager.ts:11`），CLI 实际支持 26 个。用户手动配置的其他 21 个事件的 hooks 在 UI 中**完全不可见**。

**P2 — 类型遗漏**：

`ConfiguredHook.type` 硬编码为 `'command'`（`HooksConfigManager.ts:25`），CLI 实际支持 4 种类型（`command`/`http`/`prompt`/`agent`）。用户配置的非 command 类型 hooks 在 UI 中显示不正确，且编辑后会**被覆盖为 command 类型**。

### 1.3 官方 Hooks Schema（CLI 当前支持）

#### 26 个事件

| 分类 | 事件 | 说明 | 支持 matcher |
|------|------|------|-------------|
| **会话生命周期** | `SessionStart` | 会话启动或恢复 | ✅ |
| | `SessionEnd` | 会话终止 | ✅ |
| | `InstructionsLoaded` | CLAUDE.md 或 rules 文件加载 | ✅ |
| **提示与工具** | `UserPromptSubmit` | 用户提交 prompt（处理前） | ❌ |
| | `PreToolUse` | 工具调用执行前（可阻止） | ✅ |
| | `PermissionRequest` | 权限对话框弹出 | ✅ |
| | `PostToolUse` | 工具调用成功后 | ✅ |
| | `PostToolUseFailure` | 工具调用失败后 | ✅ |
| **通知与停止** | `Notification` | CLI 发出通知 | ✅ |
| | `Stop` | Claude 回复完成 | ❌ |
| | `StopFailure` | 因 API 错误结束 | ❌ |
| **子任务** | `SubagentStart` | 子 agent 启动 | ✅ |
| | `SubagentStop` | 子 agent 完成 | ✅ |
| | `TaskCreated` | TaskCreate 创建任务 | ❌ |
| | `TaskCompleted` | 任务标记完成 | ❌ |
| | `TeammateIdle` | 团队成员即将空闲 | ❌ |
| **配置与环境** | `ConfigChange` | 配置文件运行时变更 | ✅ |
| | `CwdChanged` | 工作目录切换 | ❌ |
| | `FileChanged` | 监听的文件变化 | ✅ |
| **Worktree** | `WorktreeCreate` | 创建 worktree | ❌ |
| | `WorktreeRemove` | 删除 worktree | ❌ |
| **Compaction** | `PreCompact` | 压缩上下文前 | ❌ |
| | `PostCompact` | 压缩完成后 | ❌ |
| **MCP Elicitation** | `Elicitation` | MCP 服务器请求用户输入 | ✅ |
| | `ElicitationResult` | 用户回复 elicitation 后 | ✅ |

> `matcher` 列标记 ❌ 的事件始终触发，设置 matcher 会被静默忽略。

#### 4 种 Hook 类型

| 类型 | 必需字段 | 特有可选字段 | 说明 |
|------|---------|------------|------|
| `command` | `command` | `async`, `shell` | 执行 shell 命令，stdin 传入事件 JSON |
| `http` | `url` | `headers`, `allowedEnvVars` | POST 事件 JSON 到 URL |
| `prompt` | `prompt` | `model` | 发给 Claude 模型单轮判断 |
| `agent` | `prompt` | `model` | 启动子 agent 多轮推理 |

#### Hook 条目完整字段

| 字段 | 适用类型 | 必需 | 说明 |
|------|---------|------|------|
| `type` | 全部 | ✅ | `command` / `http` / `prompt` / `agent` |
| `command` | command | ✅ | shell 命令 |
| `url` | http | ✅ | HTTP POST 目标 URL |
| `prompt` | prompt, agent | ✅ | prompt 文本（`$ARGUMENTS` 占位符） |
| `if` | 全部 | ❌ | 权限规则语法过滤（如 `"Bash(git *)"`, `"Edit(*.ts)"`）。仅在工具事件上生效 |
| `timeout` | 全部 | ❌ | 超时秒数（默认：command 600, prompt 30, agent 60） |
| `statusMessage` | 全部 | ❌ | 运行时自定义 spinner 消息 |
| `once` | 全部 | ❌ | `true` = 每会话只运行一次 |
| `async` | command | ❌ | `true` = 后台运行不阻塞 |
| `shell` | command | ❌ | `"bash"` 或 `"powershell"` |
| `model` | prompt, agent | ❌ | 使用的模型（默认快速模型） |
| `headers` | http | ❌ | HTTP 请求头键值对，支持 `$VAR` 环境变量 |
| `allowedEnvVars` | http | ❌ | 允许在 headers 中插值的环境变量名列表 |

---

## 2. 需求概述

### 2.1 P0 — 修复数据丢失（保留所有字段）

**目标**：插件读写 hooks 时不丢失任何字段。

**当前问题**：`RawHookEntry` 接口只定义了 `{ type: 'command', command: string }`，所有写入点（`addHook`、`toggleHookState`、`updateHook`）都只写这两个字段。

**解决方案**：将 `RawHookEntry` 改为宽松类型，保留完整的原始 JSON 对象。读取时记住每个 hook 条目的完整原始数据，写回时基于原始数据修改而非重建。

### 2.2 P1 — 扩展事件列表到 26 个

**目标**：UI 能展示所有 26 个事件类型的 hooks。

**当前问题**：`HookEvent` 类型只包含 5 个事件（`HooksConfigManager.ts:11`），`loadHooksFromFile` 遍历时只检查这 5 个（行 522-523），其他事件的 hooks 被静默跳过。

**解决方案**：
1. 扩展 `HookEvent` 类型联合到 26 个
2. `loadHooksFromFile` 改为遍历 `hooksSection` 的所有 key，而非硬编码列表

### 2.3 P2 — 支持 4 种 Hook 类型

**目标**：UI 能正确展示 command / http / prompt / agent 四种类型的 hooks，并在写回时不丢失类型信息。

**当前问题**：`ConfiguredHook.type` 字面量类型为 `'command'`，所有 hook 都按 command 渲染，写回时类型被覆盖。

**解决方案**：
1. `ConfiguredHook.type` 改为 `'command' | 'http' | 'prompt' | 'agent'`
2. 列表渲染根据类型显示对应的主字段（command 显示命令、http 显示 URL、prompt/agent 显示 prompt 文本）
3. 写入时根据类型构造正确的字段组合

### 2.4 P3 — 增加 Hook 模板

**目标**：提供实用的预置模板，降低 hooks 使用门槛。

**当前问题**：`getTemplates()` 只返回 1 个模板（Completion Notification）。

**解决方案**：基于已验证的实际用例增加模板。

---

## 3. 技术设计

### 3.1 数据结构重构

#### 3.1.1 RawHookEntry — 改为宽松类型

**Before：**
```typescript
interface RawHookEntry {
    type: 'command';
    command: string;
}
```

**After：**
```typescript
// Preserve all fields from the original JSON
interface RawHookEntry {
    type: HookType;
    // command type
    command?: string;
    async?: boolean;
    shell?: string;
    // http type
    url?: string;
    headers?: Record<string, string>;
    allowedEnvVars?: string[];
    // prompt / agent type
    prompt?: string;
    model?: string;
    // common optional fields
    if?: string;
    timeout?: number;
    statusMessage?: string;
    once?: boolean;
    // catch-all for future fields
    [key: string]: unknown;
}
```

#### 3.1.2 HookEvent — 扩展到 26 个

**Before：**
```typescript
export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SessionStart' | 'UserPromptSubmit';
```

**After：**
```typescript
export type HookEvent =
    // Session lifecycle
    | 'SessionStart' | 'SessionEnd' | 'InstructionsLoaded'
    // Prompt & tool
    | 'UserPromptSubmit' | 'PreToolUse' | 'PermissionRequest'
    | 'PostToolUse' | 'PostToolUseFailure'
    // Notifications & stops
    | 'Notification' | 'Stop' | 'StopFailure'
    // Subagents & tasks
    | 'SubagentStart' | 'SubagentStop'
    | 'TaskCreated' | 'TaskCompleted' | 'TeammateIdle'
    // Config & environment
    | 'ConfigChange' | 'CwdChanged' | 'FileChanged'
    // Worktrees
    | 'WorktreeCreate' | 'WorktreeRemove'
    // Compaction
    | 'PreCompact' | 'PostCompact'
    // MCP Elicitation
    | 'Elicitation' | 'ElicitationResult';
```

#### 3.1.3 HookType — 新增类型

```typescript
export type HookType = 'command' | 'http' | 'prompt' | 'agent';
```

#### 3.1.4 ConfiguredHook — 扩展字段

**Before：**
```typescript
export interface ConfiguredHook {
    id: string;
    event: HookEvent;
    matcher: string;
    type: 'command';
    command: string;
    description: string;
    scope: HookScope;
    enabled: boolean;
}
```

**After：**
```typescript
export interface ConfiguredHook {
    id: string;
    event: HookEvent;
    matcher: string;
    type: HookType;
    // type-specific primary field
    command?: string;      // command type
    url?: string;          // http type
    prompt?: string;       // prompt / agent type
    // common optional
    if?: string;
    timeout?: number;
    statusMessage?: string;
    once?: boolean;
    async?: boolean;       // command only
    shell?: string;        // command only
    model?: string;        // prompt / agent only
    headers?: Record<string, string>;  // http only
    // plugin-managed fields
    description: string;
    scope: HookScope;
    enabled: boolean;
    // preserve original raw entry for lossless round-trip
    _rawEntry?: Record<string, unknown>;
}
```

### 3.2 读取逻辑重构

**核心改动**：`loadHooksFromFile` 不再硬编码事件列表，改为动态遍历。

```typescript
// Before (line 522-523):
const eventTypes: HookEvent[] = ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'UserPromptSubmit'];
for (const event of eventTypes) { ... }

// After:
for (const event of Object.keys(hooksSection)) {
    const matcherGroups = hooksSection[event];
    if (!matcherGroups || !Array.isArray(matcherGroups)) continue;
    // ... process groups, preserving full hookEntry object
}
```

读取每个 hookEntry 时，保存完整原始对象到 `_rawEntry`：

```typescript
hooks.push({
    id: crypto.randomUUID(),
    event: event as HookEvent,
    matcher: group.matcher,
    type: hookEntry.type || 'command',
    command: hookEntry.command,
    url: hookEntry.url,
    prompt: hookEntry.prompt,
    if: hookEntry.if,
    timeout: hookEntry.timeout,
    statusMessage: hookEntry.statusMessage,
    once: hookEntry.once,
    async: hookEntry.async,
    shell: hookEntry.shell,
    model: hookEntry.model,
    headers: hookEntry.headers,
    description: findDescription(event, group.matcher, hookEntry.command || hookEntry.url || hookEntry.prompt || ''),
    scope,
    enabled: !isDisabled,
    _rawEntry: { ...hookEntry }  // lossless preservation
});
```

### 3.3 写入逻辑重构

**核心原则**：写入时基于 `_rawEntry` 修改，而非从零重建。

```typescript
// Before (line 193):
group.hooks.push({ type: 'command', command: newHook.command });

// After:
const entry: Record<string, unknown> = newHook._rawEntry
    ? { ...newHook._rawEntry }           // preserve all original fields
    : { type: newHook.type };             // new hook: start with type

// Set type-specific primary field
switch (newHook.type) {
    case 'command':
        entry.command = newHook.command;
        if (newHook.async !== undefined) entry.async = newHook.async;
        if (newHook.shell !== undefined) entry.shell = newHook.shell;
        break;
    case 'http':
        entry.url = newHook.url;
        if (newHook.headers) entry.headers = newHook.headers;
        break;
    case 'prompt':
    case 'agent':
        entry.prompt = newHook.prompt;
        if (newHook.model) entry.model = newHook.model;
        break;
}

// Set common optional fields (only if explicitly set)
if (newHook.if !== undefined) entry.if = newHook.if;
if (newHook.timeout !== undefined) entry.timeout = newHook.timeout;
if (newHook.statusMessage !== undefined) entry.statusMessage = newHook.statusMessage;
if (newHook.once !== undefined) entry.once = newHook.once;

group.hooks.push(entry as RawHookEntry);
```

所有写入点（`addHook:193`、`toggleHookState:294`、`updateHook:380`）都需要同步改为此逻辑。抽取为 `private buildRawEntry(hook: ConfiguredHook): RawHookEntry` 方法避免重复。

### 3.4 DisabledHook 标识符升级

当前用 `{ event, matcher, command }` 三元组标识 disabled hook。对于 http/prompt/agent 类型，`command` 字段不存在。

**解决方案**：改用 `{ event, matcher, type, identifier }` 四元组，`identifier` 根据类型取对应主字段：

```typescript
interface DisabledHookEntry {
    event: string;
    matcher: string;
    type?: HookType;              // new, optional for backward compat
    command?: string;             // command type identifier (backward compat)
    url?: string;                 // http type identifier
    prompt?: string;              // prompt/agent type identifier
}
```

匹配逻辑：优先用 type+对应字段匹配，回退到 command 匹配（兼容旧数据）。

### 3.5 UI 改动（最小化）

UI 保持当前布局不变（按 scope 分组列表 + Toggle/Delete + Templates），仅做以下适配：

#### 3.5.1 列表项渲染适配

当前格式：`Stop: bash "$HOME/.claude/hooks/notify-complete.sh"`

新格式根据类型显示对应主字段：

| 类型 | 列表项显示 |
|------|-----------|
| command | `[Stop] bash "$HOME/.claude/hooks/notify.sh"` |
| http | `[PostToolUse] http: https://api.example.com/hook` |
| prompt | `[PreToolUse] prompt: "Is this edit safe?"` |
| agent | `[Stop] agent: "Review all changes..."` |

matcher 行保持现有的 `matcher: (all) | cmd: ...` 格式，非 command 类型改为显示 `url:` 或 `prompt:`。

#### 3.5.2 模板事件选择

模板应用时，事件由模板预设定义，不需要用户手动选择事件。现有 Templates 弹窗流程不变。

#### 不做的 UI 改动

- 不新增事件分组下拉框（不需要手动创建 hook 的表单）
- 不新增类型选择器（模板预设类型；手动配置请编辑 JSON）
- 不新增高级字段编辑区（`if`/`timeout` 等由用户直接编辑 JSON）
- 不使用 emoji 图标（用文本标识 `http:`/`prompt:`/`agent:`）

### 3.6 模板扩展

从 1 个扩展到 5 个，都是实际验证过的用例：

| 模板名 | 事件 | 类型 | 说明 |
|--------|------|------|------|
| Completion Notification | `Stop` | command | 任务完成时系统通知（现有，需更新 command 为更可靠的版本） |
| Auto-Commit Guard | `Stop` | command | 检测未提交变更，阻止 Claude 停止 |
| Block Sensitive Files | `PreToolUse` | command | 阻止编辑 .env / credentials 等敏感文件 |
| Format on Save | `PostToolUse` | command | 编辑文件后自动格式化（matcher: `Edit`） |
| Log All Tool Calls | `PostToolUse` | command | 记录所有工具调用到日志文件（用于调试） |

---

## 4. 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/services/HooksConfigManager.ts` | **重构** | 核心：类型定义扩展、读写逻辑重构、保留所有字段、模板扩展 |
| `src/ui-v2/ui-script.ts` | 小改 | 列表项渲染适配多类型（显示 url/prompt 而非只有 command） |
| `src/providers/ClaudeChatProvider.ts` | 小改 | message handler 适配新字段（addHook 传递完整字段） |

**不需要改动的文件：**
- `src/ui-v2/getBodyContent.ts` — Hook modal HTML 结构不变
- `src/extension.ts` — hooks 初始化逻辑不变

### 4.1 预计改动量

| 文件 | 估计行数 |
|------|---------|
| HooksConfigManager.ts | ~180 行改动（接口+读写重构+模板） |
| ui-script.ts | ~30 行改动（列表渲染适配） |
| ClaudeChatProvider.ts | ~20 行改动（消息适配） |
| HooksConfigManager.test.ts | ~300 行新建（测试用例） |
| package.json | ~5 行（test script + ts-node） |
| **总计** | **~535 行**（其中功能代码 ~230 行，测试代码 ~300 行） |

---

## 5. 实施阶段

### Phase 1：P0 — 无损读写（最高优先级）

1. `RawHookEntry` 改为宽松类型，加 index signature
2. 读取时保存 `_rawEntry`
3. 所有写入点改用 `buildRawEntry()` 方法
4. `loadHooksFromFile` 改为动态遍历 `Object.keys(hooksSection)`
5. 验证：手动在 settings.json 加 `if`/`timeout`/`async` 字段 → 通过插件编辑其他 hook → 确认原字段不丢失

### Phase 2：P1 — 事件列表扩展

1. `HookEvent` 类型扩展到 26 个
2. 列表渲染适配新事件名
3. 验证：在 settings.json 配一个 `SubagentStop` hook → UI 能看到 → 能启禁

### Phase 3：P2 — 多类型支持

1. `HookType` 新增 + `ConfiguredHook` 字段扩展
2. 列表项根据类型显示对应主字段（command/url/prompt）
3. `DisabledHookEntry` 升级
4. 验证：在 settings.json 手动配 http/prompt/agent 类型 hook → UI 正确显示

### Phase 4：P3 — 模板扩展

1. 新增 4 个模板
2. 更新现有 Notification 模板
3. 模板的 `type` 字段适配（新模板仍全部为 command 类型）

### Phase 5：测试

1. 新增 `ts-node` devDependency + `test:hooks` script
2. 新建 `src/test/HooksConfigManager.test.ts`
3. 实现 T1-T5 全部测试用例（使用临时目录，不污染真实配置）
4. 确认全部测试通过
5. Mock `DebugLogger`（如果它依赖 `vscode` 模块）

---

## 6. 向后兼容

| 场景 | 处理方式 |
|------|---------|
| 旧 `_disabledHooks` 只有 `{ event, matcher, command }` | 匹配时 `type` 为 undefined → 回退到 command 匹配 |
| 旧 `_hookDescriptions` 只有 `{ event, matcher, command, description }` | 描述匹配逻辑改为：command 或 url 或 prompt 任一匹配即可 |
| 用户从未使用过新类型 | 所有现有 hooks 都是 command 类型，UI 和行为完全不变 |
| 用户降级到旧版本插件 | 旧版本只读 command 字段，非 command 类型 hooks 不显示但不会被删除（旧版本读取逻辑跳过未知事件，不修改 hooks section） |

---

## 7. 风险与约束

| 风险 | 影响 | 缓解 |
|------|------|------|
| `_rawEntry` 增加内存开销 | 微乎其微 — 每个 hook 多存一份浅拷贝对象 | 正常 hook 数量 < 50，完全可忽略 |
| `Object.keys()` 遍历可能读到非事件 key | settings.json 的 hooks 顶层只有事件名 | 加一个白名单验证：`isKnownEvent(key)` 过滤未知 key，同时加 `catch-all` 把未知事件也展示出来（标记为 "Unknown"） |
| http/prompt/agent 模板依赖外部服务或 API | 用户可能没有对应环境 | 初期模板全部为 command 类型；http/prompt/agent 类型只在 UI 展示能力 |

---

## 8. 测试方案

### 8.1 为什么可以做自动化测试

`HooksConfigManager` **不依赖 VS Code API** — 只用 Node.js 内置模块（`fs`、`path`、`os`、`crypto`）+ 内部的 `DebugLogger`。这意味着可以用纯 mocha 直接测试，不需要启动 Extension Development Host。

项目已有 `@types/mocha` + `@vscode/test-cli` 在 devDependencies 中，只缺实际测试文件。

### 8.2 测试框架

| 项目 | 选择 | 理由 |
|------|------|------|
| Runner | mocha（已有 `@types/mocha`） | 无需新增依赖 |
| Assertion | Node.js 内置 `assert` | 零依赖 |
| 文件位置 | `src/test/HooksConfigManager.test.ts` | 遵循 VS Code 扩展测试约定 |
| Mock | 用临时目录替代真实 `~/.claude/` | 避免污染用户配置 |

### 8.3 核心测试场景

#### T1 — 无损读写（round-trip，对应 P0）

```
输入：settings.json 包含带 if/timeout/async/shell/statusMessage/once 字段的 hook
操作：loadConfiguredHooks() → toggleHookState() → 再次读取文件
断言：所有原始字段完整保留，值未变
```

| 测试用例 | 输入 JSON 特征 | 验证点 |
|---------|---------------|--------|
| `if` 字段保留 | `{ type: "command", command: "...", if: "Bash(git *)" }` | toggle 后 `if` 仍在 |
| `timeout` 字段保留 | `{ type: "command", command: "...", timeout: 30 }` | toggle 后 `timeout` 仍在 |
| `async + shell` 组合 | `{ type: "command", command: "...", async: true, shell: "powershell" }` | 两个字段都保留 |
| 未知字段保留 | `{ type: "command", command: "...", futureField: "xyz" }` | index signature 兜底 |
| 多字段 hook 的 addHook | 通过模板添加带多字段的 hook | 写入的 JSON 包含所有字段 |
| 多字段 hook 的 removeHook | 删除 group 中一个 hook | 同组其他 hook 的字段不受影响 |

#### T2 — 26 事件读取（对应 P1）

```
输入：settings.json 的 hooks 包含所有 26 个事件 key，每个下有 1 个 hook
操作：loadConfiguredHooks()
断言：返回 26 个 ConfiguredHook，event 字段全部正确
```

| 测试用例 | 验证点 |
|---------|--------|
| 全部 26 事件可读 | `hooks.length === 26`，每个事件出现一次 |
| 未知事件不崩溃 | 加一个 `"FutureEvent"` key → 不抛错，可读为 unknown |
| 空事件数组 | `"Stop": []` → 跳过，不报错 |

#### T3 — 4 类型读写（对应 P2）

```
输入：settings.json 包含 command/http/prompt/agent 各一个 hook
操作：loadConfiguredHooks()
断言：4 个 hook 的 type 正确，各自主字段正确
```

| 测试用例 | 输入 | 验证点 |
|---------|------|--------|
| command 类型 | `{ type: "command", command: "echo hi" }` | `hook.type === 'command'`, `hook.command === 'echo hi'` |
| http 类型 | `{ type: "http", url: "https://x.com/hook" }` | `hook.type === 'http'`, `hook.url === 'https://x.com/hook'` |
| prompt 类型 | `{ type: "prompt", prompt: "Is this safe?" }` | `hook.type === 'prompt'`, `hook.prompt === 'Is this safe?'` |
| agent 类型 | `{ type: "agent", prompt: "Review changes", model: "claude-haiku-4-5-20251001" }` | `hook.type === 'agent'`, `hook.model` 保留 |
| 缺少 type 字段 | `{ command: "echo hi" }` | 默认 `hook.type === 'command'`（向后兼容） |
| toggle http 类型 | 禁用再启用 http hook | `url` 和 `headers` 字段保留 |

#### T4 — DisabledHook 兼容性（对应向后兼容）

| 测试用例 | 输入 | 验证点 |
|---------|------|--------|
| 旧格式 disabled | `_disabledHooks: [{ event, matcher, command }]` | 仍能正确匹配和恢复 |
| 新格式 disabled | `_disabledHooks: [{ event, matcher, type: "http", url: "..." }]` | http 类型正确恢复 |
| 混合新旧格式 | 两种格式共存 | 各自正确匹配 |

#### T5 — 模板（对应 P3）

| 测试用例 | 验证点 |
|---------|--------|
| 模板数量 | `getTemplates().length === 5` |
| 模板应用 | `addHook(template)` → 文件写入正确 |
| 平台适配 | Windows 模板用 powershell，Linux/Mac 用 bash |

### 8.4 测试辅助设施

```typescript
// Test helper: create a temp settings directory with given content
async function createTempSettings(content: Record<string, any>): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), `hooks-test-${Date.now()}`);
    await fsp.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
    await fsp.writeFile(
        path.join(tmpDir, '.claude', 'settings.json'),
        JSON.stringify(content, null, 2)
    );
    return tmpDir;
}

// Test helper: read back and parse the settings file
async function readBackSettings(tmpDir: string): Promise<Record<string, any>> {
    const content = await fsp.readFile(
        path.join(tmpDir, '.claude', 'settings.json'), 'utf-8'
    );
    return JSON.parse(content);
}
```

### 8.5 运行方式

```bash
# 在 package.json scripts 中新增：
"test:hooks": "mocha --require ts-node/register src/test/HooksConfigManager.test.ts"

# 或使用现有的 @vscode/test-cli：
"test": "vscode-test"
```

> 注意：由于 `HooksConfigManager` 不依赖 `vscode` 模块，可以用纯 mocha 直接跑，不需要 `@vscode/test-electron` 的 Extension Host 环境。但 `DebugLogger` 可能需要 mock（它内部可能引用 `vscode.window`）。如果是，测试文件开头 mock 一下即可。

### 8.6 新增依赖

| 包 | 用途 | 是否必需 |
|---|------|---------|
| `ts-node` | TypeScript 直接运行测试 | 需要新增到 devDependencies |
| `@types/mocha` | 类型定义 | 已有 |
| mocha | 测试运行器 | 已有（`@vscode/test-cli` 内含） |

### 8.7 涉及文件更新

| 文件 | 变更 |
|------|------|
| `src/test/HooksConfigManager.test.ts` | **新建** — 全部测试用例 |
| `package.json` | 新增 `test:hooks` script，新增 `ts-node` devDependency |
| `tsconfig.json` | 确认 `src/test/` 在编译范围内 |

---

## 9. 不做的事情

- **不执行 hooks** — 执行由 CLI 负责，插件只写配置
- **不做 hook 输出/日志查看** — 这需要解析 CLI 的 verbose 输出，复杂度高收益低
- **不做 hook 调试** — 用户应使用 `claude --verbose` 在终端调试
- **不做 `disableAllHooks` 全局开关** — 这是 settings.json 顶层字段，不在 hooks UI 范围内（可后续作为小改进加）
- **不做 hook 执行顺序排序** — CLI 按数组顺序执行，用户需要精细控制时应手动编辑 JSON
- **不做 UI 大改** — 不新增事件分组下拉框、类型选择器、高级字段编辑区；保持现有 UI 布局
- **不新增手动创建 hook 表单** — hook 创建通过模板或手动编辑 JSON 完成

---

## 10. 验收标准

### P0 — 无损读写
- [x] settings.json 中有 `if: "Bash(git *)"` 的 hook → 通过 UI 修改另一个 hook → `if` 字段仍然存在
- [x] settings.json 中有 `timeout: 30` + `async: true` 的 hook → 通过 UI toggle 该 hook → 字段不丢失
- [x] settings.json 中有 `shell: "powershell"` 的 hook → 通过 UI 修改 command → `shell` 字段保留

### P1 — 事件列表
- [x] 在 settings.json 手动添加 `SubagentStop` 事件的 hook → UI 列表可见
- [x] 在 settings.json 手动添加 `PreCompact` 事件的 hook → UI 可以 toggle 启禁
- [x] 所有 26 个事件类型的 hooks 都能在列表中正确显示

### P2 — 多类型支持
- [x] 在 settings.json 手动添加 `http` 类型 hook → UI 列表显示 `http: https://...`
- [x] 在 settings.json 手动添加 `prompt` 类型 hook → UI 列表显示 `prompt: "..."`
- [x] 在 settings.json 手动添加 `agent` 类型 hook → UI 列表显示 `agent: "..."`
- [x] toggle 非 command 类型 hook 时，类型和所有字段不丢失

### P3 — 模板
- [x] 模板列表有 5 个选项
- [x] 应用模板后 hook 正确添加到 settings.json
- [x] Auto-Commit Guard 模板包含 `stop_hook_active` 防循环逻辑

### 测试
- [x] `npm run test:hooks` 可运行
- [x] T1（无损读写）全部通过 — if/timeout/async/shell/未知字段 round-trip
- [x] T2（26 事件）全部通过 — 所有事件可读
- [x] T3（4 类型）全部通过 — command/http/prompt/agent 读写正确
- [x] T4（向后兼容）全部通过 — 旧格式 _disabledHooks 仍工作
- [x] T5（模板）全部通过 — 5 个模板、平台适配

---

## 11. 实施结果

> 完成日期：2026-03-30

### 实际改动量

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/services/HooksConfigManager.ts` | +310 / -78 行 | 类型定义重构、读写逻辑重构、`_rawEntry` 无损机制、5 个模板 |
| `src/ui-v2/ui-script.ts` | +15 / -6 行 | `renderHookItem` 多类型显示适配 |
| `src/providers/ClaudeChatProvider.ts` | +16 / -6 行 | `_applyHookTemplate` 多类型字段分发 |
| `src/test/HooksConfigManager.test.ts` | +600 行（新建） | 22 个测试用例，覆盖 T1-T5 全部场景 |
| `package.json` | +2 行 | `test:hooks` script + `ts-node` devDependency |
| **总计** | **+545 / -167 行** | 功能代码 ~340 行，测试代码 ~600 行 |

### 关键技术决策

1. **`_rawEntry` 保留机制**：在 `ConfiguredHook` 和 `DisabledHookEntry` 中都保存原始 JSON 对象的浅拷贝，确保 toggle 循环中任何字段都不丢失
2. **动态事件遍历**：`Object.keys(hooksSection)` 替代硬编码数组，自动支持 CLI 未来新增的事件
3. **`buildRawEntry()` 统一写入**：所有 5 个写入点（add/enable/disable/update-same-scope/update-cross-scope）共用一个方法，基于 `_rawEntry` 修改而非重建
4. **向后兼容**：旧格式 `_disabledHooks`（只有 command 字段）通过 `matchDisabledHook` 回退匹配仍然工作

### 手动验收结果

- Extension Development Host 中测试 5 种 hook（command+if/timeout、prompt、http+headers、SubagentStop+async、Stop+shell/once），toggle 循环后所有字段完整保留
- UI 正确显示 `cmd:`、`url:`、`prompt:`、`agent:` 标签
- 5 个模板全部可用，应用后正确写入 settings.json
