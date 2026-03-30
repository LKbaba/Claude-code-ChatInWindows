# updatePRDv3-PLAN — Hooks 系统升级 开发计划

> 基于：`specs/updatePRDv3.md` v3.0 | 创建日期：2026-03-30 | 状态：**已完成**

---

## 任务总览

| # | 任务 | 文件 | 依赖 | 状态 |
|---|------|------|------|------|
| 1 | 类型定义重构 | `HooksConfigManager.ts` | 无 | [x] |
| 2 | 读取逻辑重构 | `HooksConfigManager.ts` | Task 1 | [x] |
| 3 | 写入逻辑重构 | `HooksConfigManager.ts` | Task 1 | [x] |
| 4 | DisabledHook 标识符升级 | `HooksConfigManager.ts` | Task 1 | [x] |
| 5 | 模板扩展 | `HooksConfigManager.ts` | Task 1 | [x] |
| 6 | UI 列表渲染适配 | `ui-script.ts` | Task 1 | [x] |
| 7 | ClaudeChatProvider 适配 | `ClaudeChatProvider.ts` | Task 1 | [x] |
| 8 | 测试基础设施搭建 | `package.json`, 新建测试文件 | Task 1-5 | [x] |
| 9 | 核心测试用例实现 | `HooksConfigManager.test.ts` | Task 8 | [x] |
| 10 | 编译验证 + 打包 | 全部 | Task 1-9 | [x] |

---

## Task 1：类型定义重构

**文件**：`src/services/HooksConfigManager.ts`

**AI 提示词**：

```
你是一位资深 TypeScript 开发专家，精通类型系统设计和向后兼容。

请修改 `src/services/HooksConfigManager.ts` 中的类型定义。只改类型/接口，不改任何函数实现。

### 1. 新增 HookType（在 HookEvent 之后）

export type HookType = 'command' | 'http' | 'prompt' | 'agent';

### 2. 扩展 HookEvent（替换 line 11 的现有定义）

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

### 3. 扩展 ConfiguredHook（替换 line 21-30 的现有定义）

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

### 4. 扩展 RawHookEntry（替换 line 66-69 的现有定义）

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

### 5. 扩展 DisabledHookEntry（替换 line 46-50 的现有定义）

interface DisabledHookEntry {
    event: string;
    matcher: string;
    type?: HookType;      // new, optional for backward compat
    command?: string;      // command type identifier (backward compat)
    url?: string;          // http type identifier
    prompt?: string;       // prompt/agent type identifier
}

### 6. 扩展 HookDescriptionEntry（替换 line 56-61 的现有定义）

interface HookDescriptionEntry {
    event: string;
    matcher: string;
    command?: string;      // command type
    url?: string;          // http type
    prompt?: string;       // prompt/agent type
    description: string;
}

### 7. 扩展 HookTemplate（替换 line 35-41 的现有定义）

export interface HookTemplate {
    name: string;
    description: string;
    event: HookEvent;
    matcher: string;
    type: HookType;
    command?: string;      // command type
    url?: string;          // http type
    prompt?: string;       // prompt/agent type
}

### 关键要求

- 只改类型定义，不改任何函数体
- 改完后会出现 TypeScript 编译错误（因为函数体还在用旧类型），这是预期的，后续 Task 修复
- 代码注释用英文
- 新增一个辅助函数签名用于后续实现：

// Helper to get the primary identifier of a hook entry based on its type
function getHookIdentifier(hook: { type?: HookType; command?: string; url?: string; prompt?: string }): string;
```

**完成标准**：
- [x] `HookType` 导出定义存在
- [x] `HookEvent` 包含 26 个事件
- [x] `ConfiguredHook` 包含 `_rawEntry`、`url`、`prompt`、`if` 等新字段
- [x] `RawHookEntry` 有 index signature `[key: string]: unknown`
- [x] `DisabledHookEntry` 支持 `url`/`prompt` 字段

---

## Task 2：读取逻辑重构

**文件**：`src/services/HooksConfigManager.ts`

**AI 提示词**：

```
ultrathink

你是一位资深 TypeScript 后端开发专家，精通 JSON 数据解析和向后兼容处理。

请修改 `src/services/HooksConfigManager.ts` 中的 `loadHooksFromFile` 方法（约 line 487-577）。

### 核心改动：动态遍历所有事件 key

现有代码（约 line 522-523）硬编码了 5 个事件：
```typescript
const eventTypes: HookEvent[] = ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'UserPromptSubmit'];
for (const event of eventTypes) { ... }
```

改为动态遍历：
```typescript
for (const event of Object.keys(hooksSection)) {
    const matcherGroups = hooksSection[event];
    if (!matcherGroups || !Array.isArray(matcherGroups)) continue;
    // ...
}
```

### 核心改动：读取完整 hook 条目

现有代码（约 line 534-549）只读取 `hookEntry.command`。改为读取所有字段并保存原始数据：

```typescript
for (const hookEntry of group.hooks) {
    const hookType = (hookEntry.type || 'command') as HookType;
    const identifier = getHookIdentifier(hookEntry);

    const isDisabled = disabledHooks.some(
        d => d.event === event && d.matcher === group.matcher && matchDisabledHook(d, hookEntry)
    );

    hooks.push({
        id: crypto.randomUUID(),
        event: event as HookEvent,
        matcher: group.matcher,
        type: hookType,
        command: hookEntry.command as string | undefined,
        url: hookEntry.url as string | undefined,
        prompt: hookEntry.prompt as string | undefined,
        if: hookEntry.if as string | undefined,
        timeout: hookEntry.timeout as number | undefined,
        statusMessage: hookEntry.statusMessage as string | undefined,
        once: hookEntry.once as boolean | undefined,
        async: hookEntry.async as boolean | undefined,
        shell: hookEntry.shell as string | undefined,
        model: hookEntry.model as string | undefined,
        headers: hookEntry.headers as Record<string, string> | undefined,
        description: findDescription(event, group.matcher, identifier),
        scope,
        enabled: !isDisabled,
        _rawEntry: { ...hookEntry }  // lossless preservation
    });
}
```

### 新增辅助函数 getHookIdentifier

在类外部或作为静态方法实现：

```typescript
function getHookIdentifier(hook: { type?: HookType | string; command?: string; url?: string; prompt?: string }): string {
    switch (hook.type) {
        case 'http': return hook.url || '';
        case 'prompt':
        case 'agent': return hook.prompt || '';
        case 'command':
        default: return hook.command || '';
    }
}
```

### 新增辅助函数 matchDisabledHook

匹配 disabled hook 条目（兼容新旧格式）：

```typescript
function matchDisabledHook(disabled: DisabledHookEntry, hookEntry: RawHookEntry): boolean {
    // New format: match by type + corresponding identifier
    if (disabled.type) {
        switch (disabled.type) {
            case 'http': return disabled.url === hookEntry.url;
            case 'prompt':
            case 'agent': return disabled.prompt === hookEntry.prompt;
            case 'command': return disabled.command === hookEntry.command;
        }
    }
    // Old format: match by command field only (backward compat)
    return disabled.command === hookEntry.command;
}
```

### 更新 findDescription

现有的 findDescription 只按 command 匹配。需要同时支持 url/prompt 匹配：

```typescript
const findDescription = (event: string, matcher: string, identifier: string): string => {
    const entry = descriptions.find(d =>
        d.event === event &&
        d.matcher === matcher &&
        (d.command === identifier || d.url === identifier || d.prompt === identifier)
    );
    return entry ? entry.description : '';
};
```

### 更新 disabled-only hooks 加载

现有的 "Add disabled-only hooks" 部分（约 line 554-569）也需要更新：
- `event: disabled.event as HookEvent` 保持
- `type: (disabled.type || 'command') as HookType` — 兼容旧格式
- `command: disabled.command` 保持
- 新增 `url: disabled.url`, `prompt: disabled.prompt`
- `_rawEntry` 从 disabled 条目中不可恢复（没有原始数据），设为 undefined

### 关键要求

- 代码注释用英文
- 保持错误处理（try/catch）不变
- 所有新字段使用 `as Type | undefined` 确保类型安全
- disabled-only hooks 中，type 缺失时默认为 'command'
```

**完成标准**：
- [x] `loadHooksFromFile` 使用 `Object.keys(hooksSection)` 动态遍历
- [x] 每个 hook 的 `_rawEntry` 保存了完整原始 JSON
- [x] `getHookIdentifier` 辅助函数存在
- [x] `matchDisabledHook` 兼容新旧格式
- [x] `findDescription` 支持 url/prompt 匹配

---

## Task 3：写入逻辑重构

**文件**：`src/services/HooksConfigManager.ts`

**AI 提示词**：

```
ultrathink

你是一位资深 TypeScript 后端开发专家，精通无损数据读写和向后兼容。

请修改 `src/services/HooksConfigManager.ts` 中的所有写入逻辑，确保 hook 条目字段不丢失。

### 核心：新增 buildRawEntry 私有方法

在 HooksConfigManager 类中新增：

```typescript
/**
 * Build a raw hook entry for JSON serialization.
 * If _rawEntry exists, use it as base to preserve unknown fields.
 * Otherwise, construct from known fields.
 */
private buildRawEntry(hook: ConfiguredHook | Omit<ConfiguredHook, 'id'>): Record<string, unknown> {
    // Start from original raw entry if available, to preserve unknown fields
    const entry: Record<string, unknown> = (hook as ConfiguredHook)._rawEntry
        ? { ...(hook as ConfiguredHook)._rawEntry }
        : { type: hook.type || 'command' };

    // Always set type
    entry.type = hook.type || 'command';

    // Set type-specific primary field
    switch (hook.type) {
        case 'http':
            if (hook.url !== undefined) entry.url = hook.url;
            if (hook.headers !== undefined) entry.headers = hook.headers;
            // Remove command-specific fields if type changed
            delete entry.command;
            break;
        case 'prompt':
        case 'agent':
            if (hook.prompt !== undefined) entry.prompt = hook.prompt;
            if (hook.model !== undefined) entry.model = hook.model;
            delete entry.command;
            break;
        case 'command':
        default:
            if (hook.command !== undefined) entry.command = hook.command;
            if (hook.async !== undefined) entry.async = hook.async;
            if (hook.shell !== undefined) entry.shell = hook.shell;
            break;
    }

    // Set common optional fields only if explicitly provided
    if (hook.if !== undefined) entry.if = hook.if;
    if (hook.timeout !== undefined) entry.timeout = hook.timeout;
    if (hook.statusMessage !== undefined) entry.statusMessage = hook.statusMessage;
    if (hook.once !== undefined) entry.once = hook.once;

    return entry;
}
```

### 更新 addHook 方法（约 line 164-212）

替换 line 193 的：
```typescript
group.hooks.push({ type: 'command', command: newHook.command });
```
为：
```typescript
group.hooks.push(this.buildRawEntry(newHook) as RawHookEntry);
```

同时更新 description 持久化（约 line 197-205），description 的 identifier 改用 getHookIdentifier：
```typescript
if (newHook.description) {
    const descriptions: HookDescriptionEntry[] = (data._hookDescriptions as HookDescriptionEntry[]) || [];
    const identifier = getHookIdentifier(newHook);
    const descEntry: HookDescriptionEntry = {
        event: newHook.event,
        matcher: newHook.matcher,
        description: newHook.description
    };
    // Set identifier field based on type
    switch (newHook.type) {
        case 'http': descEntry.url = newHook.url; break;
        case 'prompt': case 'agent': descEntry.prompt = newHook.prompt; break;
        default: descEntry.command = newHook.command; break;
    }
    descriptions.push(descEntry);
    data._hookDescriptions = descriptions;
}
```

### 更新 toggleHookState 方法（约 line 266-323）

替换 line 294 的：
```typescript
group.hooks.push({ type: 'command', command: hook.command });
```
为：
```typescript
group.hooks.push(this.buildRawEntry(hook) as RawHookEntry);
```

同时更新 disable 逻辑（约 line 304-309），DisabledHookEntry 改用新格式：
```typescript
const disabledEntry: DisabledHookEntry = {
    event: hook.event,
    matcher: hook.matcher,
    type: hook.type
};
switch (hook.type) {
    case 'http': disabledEntry.url = hook.url; break;
    case 'prompt': case 'agent': disabledEntry.prompt = hook.prompt; break;
    default: disabledEntry.command = hook.command; break;
}
disabledHooks.push(disabledEntry);
```

更新 enable 时从 _disabledHooks 移除的匹配逻辑（约 line 297-299）：
```typescript
data._disabledHooks = disabledHooks.filter(
    d => !(d.event === hook.event && d.matcher === hook.matcher && matchDisabledHook(d, { type: hook.type, command: hook.command, url: hook.url, prompt: hook.prompt } as RawHookEntry))
);
```

### 更新 updateHook 方法（约 line 328-399）

替换 line 380 的：
```typescript
group.hooks.push({ type: 'command', command: newCommand });
```
为：
```typescript
const updatedHook: Partial<ConfiguredHook> = {
    ...hook,
    ...changes,
    _rawEntry: hook._rawEntry
};
group.hooks.push(this.buildRawEntry(updatedHook as ConfiguredHook) as RawHookEntry);
```

在 scope 改变的分支（约 line 344-354）中，也需要传递 `_rawEntry`。

### 更新 removeHookFromSection（约 line 589-600）

现有代码用 `h.command === hook.command` 匹配。改为支持多类型：
```typescript
const idx = group.hooks.findIndex(h => {
    switch (hook.type) {
        case 'http': return h.url === hook.url;
        case 'prompt': case 'agent': return h.prompt === hook.prompt;
        default: return h.command === hook.command;
    }
});
```

### 更新 removeHook 中的 _disabledHooks/_hookDescriptions 过滤

约 line 238-254，匹配逻辑也需要更新为多类型感知。

### 关键要求

- 代码注释用英文
- `buildRawEntry` 必须处理 `_rawEntry` 存在和不存在两种情况
- 所有 5 个写入点（addHook, toggleHookState enable, toggleHookState disable, updateHook same-scope, updateHook cross-scope）都使用 `buildRawEntry`
- matchDisabledHook 和 getHookIdentifier 是在 Task 2 中添加的，这里直接使用
```

**完成标准**：
- [x] `buildRawEntry` 方法存在于类中
- [x] 所有 5 个写入点都使用 `buildRawEntry`
- [x] `removeHookFromSection` 支持按 url/prompt 匹配
- [x] `removeHook` 的 disabled/description 过滤支持多类型
- [x] `toggleHookState` 的 disable 写入新格式 DisabledHookEntry

---

## ✅ 验收检查点 1：后端核心逻辑

完成 Task 1-3 后暂停，验收：
- [x] `npm run compile` 编译通过零错误
- [x] 手动在 `~/.claude/settings.json` 中添加带 `if: "Bash(git *)"` 的 hook → 打开插件 → UI 能看到 → toggle 后 `if` 不丢失
- [x] 手动添加 `SubagentStop` 事件的 hook → UI 能看到
- [x] 手动添加 `http` 类型 hook → UI 能看到

---

## Task 4：DisabledHook 兼容性完善

**文件**：`src/services/HooksConfigManager.ts`

**AI 提示词**：

```
你是一位 TypeScript 开发专家。

请检查 `src/services/HooksConfigManager.ts` 中所有涉及 `_disabledHooks` 和 `_hookDescriptions` 的代码路径，确保它们都能正确处理新旧两种格式。

### 需要检查的代码点

1. loadHooksFromFile 中读取 disabled-only hooks（约 line 504-517）— Task 2 应该已经处理了

2. toggleHookState 中的 enable 逻辑（从 _disabledHooks 移除）— Task 3 应该已经处理了

3. toggleHookState 中的 disable 逻辑（添加到 _disabledHooks）— Task 3 应该已经处理了

4. removeHook 中的 _disabledHooks 清理（约 line 238-244）— 需要更新匹配逻辑：
   ```typescript
   data._disabledHooks = (data._disabledHooks as DisabledHookEntry[]).filter(
       d => !(d.event === hook.event && d.matcher === hook.matcher && matchDisabledHook(d, { type: hook.type, command: hook.command, url: hook.url, prompt: hook.prompt } as RawHookEntry))
   );
   ```

5. removeHook 中的 _hookDescriptions 清理（约 line 248-254）— 需要更新匹配逻辑：
   ```typescript
   data._hookDescriptions = (data._hookDescriptions as HookDescriptionEntry[]).filter(
       d => !(d.event === hook.event && d.matcher === hook.matcher &&
           (d.command === hook.command || d.url === hook.url || d.prompt === hook.prompt))
   );
   ```

6. updateHook 中的 _disabledHooks 更新（约 line 383-389）— 需要更新匹配和写入逻辑

### 向后兼容测试点

- 旧格式 `{ event, matcher, command }` 的 _disabledHooks 仍然能匹配到 command 类型 hook
- 新格式 `{ event, matcher, type: "http", url: "..." }` 能匹配到 http 类型 hook
- 混合新旧格式不冲突

代码注释用英文。
```

**完成标准**：
- [x] 所有 6 个 _disabledHooks/_hookDescriptions 代码点都已更新
- [x] 旧格式数据不会被破坏
- [x] 编译通过

---

## Task 5：模板扩展

**文件**：`src/services/HooksConfigManager.ts`

**AI 提示词**：

```
你是一位 TypeScript 开发专家，精通跨平台 shell 脚本。

请修改 `src/services/HooksConfigManager.ts` 中的 `getTemplates()` 方法（约 line 404-427）。

### 现有模板（保留并改进）

1. **Completion Notification**（已有，更新 command 为更可靠版本）

Windows 版本改为：
```
powershell -Command "$input = [Console]::In.ReadToEnd(); $json = $input | ConvertFrom-Json; if ($json.stop_hook_active) { exit 0 }; [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Claude Code task completed', 'Claude Code', 0, 64) | Out-Null; echo '{}'"
```

macOS 和 Linux 保持现有逻辑。

### 新增 4 个模板

2. **Auto-Commit Guard**
   - event: 'Stop'
   - matcher: ''
   - type: 'command'
   - description: 'Block Claude from stopping if there are uncommitted changes'
   - Windows command:
     ```
     powershell -Command "$input = [Console]::In.ReadToEnd(); $json = $input | ConvertFrom-Json; if ($json.stop_hook_active) { exit 0 }; $status = git status --porcelain 2>$null; if ($status) { Write-Error 'Uncommitted changes detected. Please commit before stopping.'; exit 2 } else { echo '{}' }"
     ```
   - macOS/Linux command:
     ```
     bash -c 'input=$(cat); stop_active=$(echo "$input" | grep -o "\"stop_hook_active\":true"); if [ -n "$stop_active" ]; then exit 0; fi; status=$(git status --porcelain 2>/dev/null); if [ -n "$status" ]; then echo "Uncommitted changes detected. Please commit before stopping." >&2; exit 2; else echo "{}"; fi'
     ```

3. **Block Sensitive Files**
   - event: 'PreToolUse'
   - matcher: 'Edit'
   - type: 'command'
   - description: 'Prevent editing .env, credentials, and key files'
   - 跨平台 command（bash，Windows Git Bash 也支持）：
     ```
     bash -c 'input=$(cat); file=$(echo "$input" | grep -o "\"file_path\":\"[^\"]*\"" | head -1 | sed "s/\"file_path\":\"//;s/\"//"); case "$file" in *.env|*.env.*|*credentials*|*secret*|*.pem|*.key) echo "Blocked: $file is a sensitive file" >&2; exit 2;; esac; echo "{}"'
     ```

4. **Format on Save**
   - event: 'PostToolUse'
   - matcher: 'Edit'
   - type: 'command'
   - description: 'Auto-format files after editing (requires prettier or similar)'
   - 跨平台 command：
     ```
     bash -c 'input=$(cat); file=$(echo "$input" | grep -o "\"file_path\":\"[^\"]*\"" | head -1 | sed "s/\"file_path\":\"//;s/\"//"); if [ -n "$file" ] && command -v npx >/dev/null 2>&1; then npx prettier --write "$file" 2>/dev/null; fi; echo "{}"'
     ```

5. **Log All Tool Calls**
   - event: 'PostToolUse'
   - matcher: ''
   - type: 'command'
   - description: 'Log all tool calls to a file for debugging'
   - 跨平台 command：
     ```
     bash -c 'input=$(cat); echo "[$(date -Iseconds)] $input" >> "$HOME/.claude/hooks/tool-calls.log"; echo "{}"'
     ```

### HookTemplate 接口更新

所有模板都要包含 `type: 'command'` 字段（Task 1 已扩展了 HookTemplate 接口）。

### 代码结构

保持现有的平台检测逻辑（`process.platform`）。每个需要平台区分的模板使用 `isWin ? winCmd : unixCmd`。不需要平台区分的模板（Block Sensitive Files、Format on Save、Log All Tool Calls）统一用 bash（Windows 上 Git Bash 支持）。

代码注释用英文。
```

**完成标准**：
- [x] `getTemplates()` 返回 5 个模板
- [x] 每个模板都有 `type: 'command'` 字段
- [x] Completion Notification 的 Windows 版本包含 `stop_hook_active` 检查
- [x] Auto-Commit Guard 的两个平台版本都包含 `stop_hook_active` 检查
- [x] 编译通过

---

## Task 6：UI 列表渲染适配

**文件**：`src/ui-v2/ui-script.ts`

**AI 提示词**：

```
你是一位前端开发专家，精通 VS Code Webview 中的 TypeScript 模板字符串嵌套。

**重要**：`ui-script.ts` 导出的是一段 JS 代码包裹在 TypeScript 模板字符串中。注意转义规则（参考 CLAUDE.md 的 "ui-script.ts Template Literal Nesting" 章节）。

请修改 `src/ui-v2/ui-script.ts` 中的 `renderHookItem` 函数（约 line 2044-2069）。

### 当前代码（约 line 2048-2050）：

```javascript
var displayName = hook.description ? escapeHtml(hook.description) : escapeHtml(hook.command);
var matcherDisplay = hook.matcher ? escapeHtml(hook.matcher) : '(all)';
var commandDisplay = escapeHtml(hook.command);
```

### 改为：

```javascript
// Get primary field based on hook type
var primaryField = hook.command || hook.url || hook.prompt || '';
var displayName = hook.description ? escapeHtml(hook.description) : escapeHtml(primaryField);
var matcherDisplay = hook.matcher ? escapeHtml(hook.matcher) : '(all)';

// Build type-aware detail display
var detailLabel = 'cmd';
var detailValue = primaryField;
if (hook.type === 'http') {
    detailLabel = 'url';
    detailValue = hook.url || '';
} else if (hook.type === 'prompt') {
    detailLabel = 'prompt';
    detailValue = hook.prompt || '';
} else if (hook.type === 'agent') {
    detailLabel = 'agent';
    detailValue = hook.prompt || '';
}
var commandDisplay = escapeHtml(detailValue);
```

### 同时更新 detail 行（约 line 2065-2066）：

当前：
```javascript
'matcher: ' + matcherDisplay + '  |  cmd: ' + commandDisplay +
```

改为：
```javascript
'matcher: ' + matcherDisplay + '  |  ' + detailLabel + ': ' + commandDisplay +
```

### 关键注意

- 现有的 escapeHtml、escapeForOnclick 调用保持不变
- 不改变 HTML 结构和 CSS 类名
- hook 对象现在可能包含 url/prompt/type 等新字段（由后端传入）
- 保持与现有代码完全一致的缩进和风格
```

**完成标准**：
- [x] command 类型 hook 显示 `cmd: echo hi`（与现有行为一致）
- [x] http 类型 hook 显示 `url: https://...`
- [x] prompt 类型 hook 显示 `prompt: Is this safe?`
- [x] agent 类型 hook 显示 `agent: Review all changes...`
- [x] 编译通过

---

## Task 7：ClaudeChatProvider 适配

**文件**：`src/providers/ClaudeChatProvider.ts`

**AI 提示词**：

```
你是一位 VS Code Extension 开发专家。

请修改 `src/providers/ClaudeChatProvider.ts` 中 hooks 相关的消息处理。

### 1. 更新 _applyHookTemplate 方法（约 line 2628-2652）

现有代码（约 line 2640）硬编码了 `type: 'command'`：
```typescript
const newHook = await hooksManager.addHook({
    event: template.event,
    matcher: template.matcher,
    type: 'command',         // ← 硬编码
    command: template.command,
    ...
});
```

改为使用模板的 type 字段：
```typescript
const hookData: any = {
    event: template.event,
    matcher: template.matcher,
    type: template.type || 'command',
    description: template.description,
    scope: hookScope,
    enabled: true
};
// Set type-specific primary field from template
switch (template.type) {
    case 'http':
        hookData.url = template.url;
        break;
    case 'prompt':
    case 'agent':
        hookData.prompt = template.prompt;
        break;
    case 'command':
    default:
        hookData.command = template.command;
        break;
}
const newHook = await hooksManager.addHook(hookData);
```

### 关键要求

- 不改变其他 hooks 消息处理（toggleHookState、removeHook、refreshHooks、loadConfiguredHooks）
- 这些方法只传递 hookId，不涉及字段处理，HooksConfigManager 内部已经处理了字段保留
- 代码注释用英文
```

**完成标准**：
- [x] `_applyHookTemplate` 使用 `template.type` 而非硬编码 `'command'`
- [x] 支持 command/http/prompt/agent 类型模板的字段分发
- [x] 编译通过

---

## ✅ 验收检查点 2：全功能验收

完成 Task 4-7 后暂停，验收：

### 编译
- [x] `npm run compile` 零错误

### P0 — 无损读写
- [x] 手动在 settings.json 加 `if: "Bash(git *)"` → UI toggle → `if` 仍在
- [x] 手动加 `timeout: 30` + `async: true` → toggle → 字段不丢
- [x] 手动加 `shell: "powershell"` → 编辑另一个 hook → `shell` 保留

### P1 — 事件列表
- [x] 手动添加 `SubagentStop` hook → UI 可见 → toggle 可用
- [x] 手动添加 `PreCompact` hook → UI 可见

### P2 — 多类型支持
- [x] 手动添加 `http` 类型 hook → 列表显示 `url: https://...`
- [x] 手动添加 `prompt` 类型 hook → 列表显示 `prompt: "..."`
- [x] toggle 非 command 类型 hook → 类型和字段不丢失

### P3 — 模板
- [x] Templates 列表有 5 个
- [x] 应用 Auto-Commit Guard → settings.json 正确写入

---

## Task 8：测试基础设施搭建

**文件**：`package.json`, `src/test/HooksConfigManager.test.ts`

**AI 提示词**：

```
你是一位 Node.js 测试工程师，精通 mocha 测试框架配置。

请搭建 HooksConfigManager 的测试基础设施。

### 1. 安装依赖

运行：
```bash
npm install --save-dev ts-node
```

### 2. 在 package.json 中新增 test script

在 `"scripts"` 区块中添加：
```json
"test:hooks": "mocha --require ts-node/register --timeout 10000 src/test/HooksConfigManager.test.ts"
```

### 3. 创建测试文件骨架

创建 `src/test/HooksConfigManager.test.ts`：

```typescript
/**
 * Unit tests for HooksConfigManager
 *
 * These tests verify the hooks configuration read/write logic
 * without requiring VS Code Extension Host.
 *
 * Run: npm run test:hooks
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock vscode module before importing anything that depends on it
// DebugLogger imports vscode but never uses any vscode.* API
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        return {}; // empty stub — DebugLogger imports but never calls vscode.*
    }
    return originalRequire.apply(this, arguments);
};

import { HooksConfigManager, ConfiguredHook, HookTemplate } from '../services/HooksConfigManager';

// ── Test Helpers ──────────────────────────────────────────

let testCounter = 0;

async function createTempSettings(
    scope: 'global' | 'project',
    content: Record<string, any>
): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), `hooks-test-${Date.now()}-${testCounter++}`);
    const claudeDir = path.join(tmpDir, '.claude');
    await fsp.mkdir(claudeDir, { recursive: true });
    await fsp.writeFile(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify(content, null, 2)
    );
    return tmpDir;
}

async function readBackSettings(dirPath: string): Promise<Record<string, any>> {
    const filePath = path.join(dirPath, '.claude', 'settings.json');
    const content = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

async function cleanupTempDir(dirPath: string): Promise<void> {
    try {
        await fsp.rm(dirPath, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
}

// ── Helpers to access HooksConfigManager internals ──────

function getManagerInstance(): HooksConfigManager {
    // Reset singleton for test isolation
    (HooksConfigManager as any).instance = null;
    return HooksConfigManager.getInstance();
}

// ── Test Suites ─────────────────────────────────────────

describe('HooksConfigManager', function() {
    // Placeholder — Task 9 fills in test cases

    it('should instantiate', function() {
        const manager = getManagerInstance();
        assert.ok(manager);
    });
});
```

### 4. 验证测试可运行

```bash
npm run test:hooks
```

应该看到 1 passing。

### 关键要求

- vscode mock 必须在所有 import 之前执行
- 使用 `Module.prototype.require` hook 拦截 vscode 导入
- 每个测试用独立的临时目录（testCounter 确保唯一）
- cleanupTempDir 在 afterEach 中调用
- 代码注释用英文
```

**完成标准**：
- [x] `npm install --save-dev ts-node` 成功
- [x] `npm run test:hooks` 可运行，1 passing
- [x] vscode mock 不影响 HooksConfigManager 正常工作

---

## Task 9：核心测试用例实现

**文件**：`src/test/HooksConfigManager.test.ts`

**AI 提示词**：

```
ultrathink

你是一位资深测试工程师，精通 mocha + assert 的 TypeScript 测试。

请在 `src/test/HooksConfigManager.test.ts` 的 describe 块中实现全部测试用例。测试文件骨架和辅助函数已在 Task 8 中创建。

### 重要背景

HooksConfigManager 是单例，用 `setWorkspacePath()` 设置项目路径。它读写 3 个文件：
- global: `~/.claude/settings.json`（用 `os.homedir()` 决定）
- project: `{workspacePath}/.claude/settings.json`
- project-local: `{workspacePath}/.claude/settings.local.json`

测试中我们只测试 project scope（通过 setWorkspacePath 指向临时目录），避免污染全局配置。

### T1 — 无损读写 round-trip

```typescript
describe('T1 — Lossless round-trip', function() {
    let tmpDir: string;
    let manager: HooksConfigManager;

    beforeEach(async function() {
        manager = getManagerInstance();
    });

    afterEach(async function() {
        if (tmpDir) await cleanupTempDir(tmpDir);
    });

    it('should preserve "if" field after toggle', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: {
                PreToolUse: [{
                    matcher: 'Bash',
                    hooks: [{ type: 'command', command: 'echo test', if: 'Bash(git *)' }]
                }]
            }
        });
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks.length, 1);

        // Toggle disable then re-enable
        await manager.toggleHookState(hooks[0].id);
        await manager.toggleHookState(hooks[0].id); // re-enable

        // Read back from disk
        const settings = await readBackSettings(tmpDir);
        const hookEntry = settings.hooks.PreToolUse[0].hooks[0];
        assert.strictEqual(hookEntry.if, 'Bash(git *)');
    });

    it('should preserve timeout and async fields after toggle', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: {
                Stop: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'notify.sh', timeout: 30, async: true }]
                }]
            }
        });
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        await manager.toggleHookState(hooks[0].id); // disable
        await manager.toggleHookState(hooks[0].id); // re-enable

        const settings = await readBackSettings(tmpDir);
        const hookEntry = settings.hooks.Stop[0].hooks[0];
        assert.strictEqual(hookEntry.timeout, 30);
        assert.strictEqual(hookEntry.async, true);
    });

    it('should preserve shell field after toggle', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: {
                Stop: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'echo done', shell: 'powershell' }]
                }]
            }
        });
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        await manager.toggleHookState(hooks[0].id);
        await manager.toggleHookState(hooks[0].id);

        const settings = await readBackSettings(tmpDir);
        const hookEntry = settings.hooks.Stop[0].hooks[0];
        assert.strictEqual(hookEntry.shell, 'powershell');
    });

    it('should preserve unknown/future fields via index signature', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: {
                Stop: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'echo x', futureField: 'xyz', anotherField: 42 }]
                }]
            }
        });
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        await manager.toggleHookState(hooks[0].id);
        await manager.toggleHookState(hooks[0].id);

        const settings = await readBackSettings(tmpDir);
        const hookEntry = settings.hooks.Stop[0].hooks[0];
        assert.strictEqual(hookEntry.futureField, 'xyz');
        assert.strictEqual(hookEntry.anotherField, 42);
    });

    it('should not lose sibling hook fields when removing one hook from group', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: {
                PostToolUse: [{
                    matcher: 'Bash',
                    hooks: [
                        { type: 'command', command: 'hook-a.sh', if: 'Bash(npm *)' },
                        { type: 'command', command: 'hook-b.sh', timeout: 60 }
                    ]
                }]
            }
        });
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        const hookA = hooks.find(h => h.command === 'hook-a.sh')!;
        await manager.removeHook(hookA.id);

        const settings = await readBackSettings(tmpDir);
        const remaining = settings.hooks.PostToolUse[0].hooks;
        assert.strictEqual(remaining.length, 1);
        assert.strictEqual(remaining[0].command, 'hook-b.sh');
        assert.strictEqual(remaining[0].timeout, 60);
    });
});
```

### T2 — 26 事件读取

```typescript
describe('T2 — All 26 events', function() {
    let tmpDir: string;
    let manager: HooksConfigManager;

    afterEach(async function() {
        if (tmpDir) await cleanupTempDir(tmpDir);
    });

    it('should read hooks from all 26 event types', async function() {
        const allEvents = [
            'SessionStart', 'SessionEnd', 'InstructionsLoaded',
            'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
            'PostToolUse', 'PostToolUseFailure',
            'Notification', 'Stop', 'StopFailure',
            'SubagentStart', 'SubagentStop',
            'TaskCreated', 'TaskCompleted', 'TeammateIdle',
            'ConfigChange', 'CwdChanged', 'FileChanged',
            'WorktreeCreate', 'WorktreeRemove',
            'PreCompact', 'PostCompact',
            'Elicitation', 'ElicitationResult'
        ];

        const hooksSection: Record<string, any[]> = {};
        for (const event of allEvents) {
            hooksSection[event] = [{
                matcher: '',
                hooks: [{ type: 'command', command: `echo ${event}` }]
            }];
        }

        tmpDir = await createTempSettings('project', { hooks: hooksSection });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks.length, allEvents.length);

        for (const event of allEvents) {
            const found = hooks.find(h => h.event === event);
            assert.ok(found, `Event ${event} should be loaded`);
        }
    });

    it('should not crash on unknown event keys', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: {
                FutureEvent: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'echo future' }]
                }],
                Stop: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'echo stop' }]
                }]
            }
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.ok(hooks.length >= 1); // At least Stop should load
    });

    it('should skip empty event arrays gracefully', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: {
                Stop: [],
                PreToolUse: [{
                    matcher: '',
                    hooks: [{ type: 'command', command: 'echo test' }]
                }]
            }
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks.length, 1);
        assert.strictEqual(hooks[0].event, 'PreToolUse');
    });
});
```

### T3 — 4 类型读写

```typescript
describe('T3 — Four hook types', function() {
    let tmpDir: string;
    let manager: HooksConfigManager;

    afterEach(async function() {
        if (tmpDir) await cleanupTempDir(tmpDir);
    });

    it('should read command type correctly', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }] }
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks[0].type, 'command');
        assert.strictEqual(hooks[0].command, 'echo hi');
    });

    it('should read http type correctly', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [
                { type: 'http', url: 'https://example.com/hook', headers: { 'X-Token': 'abc' } }
            ] }] }
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks[0].type, 'http');
        assert.strictEqual(hooks[0].url, 'https://example.com/hook');
        assert.deepStrictEqual(hooks[0].headers, { 'X-Token': 'abc' });
    });

    it('should read prompt type correctly', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [
                { type: 'prompt', prompt: 'Is this edit safe?' }
            ] }] }
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks[0].type, 'prompt');
        assert.strictEqual(hooks[0].prompt, 'Is this edit safe?');
    });

    it('should read agent type with model correctly', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: { Stop: [{ matcher: '', hooks: [
                { type: 'agent', prompt: 'Review changes', model: 'claude-haiku-4-5-20251001' }
            ] }] }
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks[0].type, 'agent');
        assert.strictEqual(hooks[0].prompt, 'Review changes');
        assert.strictEqual(hooks[0].model, 'claude-haiku-4-5-20251001');
    });

    it('should default to command type when type field is missing', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: { Stop: [{ matcher: '', hooks: [{ command: 'echo hi' }] }] }
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks[0].type, 'command');
    });

    it('should preserve http type and fields after toggle', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: { PostToolUse: [{ matcher: '', hooks: [
                { type: 'http', url: 'https://example.com/hook', headers: { 'Authorization': 'Bearer $TOKEN' }, timeout: 15 }
            ] }] }
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        await manager.toggleHookState(hooks[0].id); // disable
        await manager.toggleHookState(hooks[0].id); // re-enable

        const settings = await readBackSettings(tmpDir);
        const hookEntry = settings.hooks.PostToolUse[0].hooks[0];
        assert.strictEqual(hookEntry.type, 'http');
        assert.strictEqual(hookEntry.url, 'https://example.com/hook');
        assert.deepStrictEqual(hookEntry.headers, { 'Authorization': 'Bearer $TOKEN' });
        assert.strictEqual(hookEntry.timeout, 15);
    });
});
```

### T4 — DisabledHook 兼容性

```typescript
describe('T4 — DisabledHook backward compatibility', function() {
    let tmpDir: string;
    let manager: HooksConfigManager;

    afterEach(async function() {
        if (tmpDir) await cleanupTempDir(tmpDir);
    });

    it('should load disabled hooks from old format (_disabledHooks with command only)', async function() {
        tmpDir = await createTempSettings('project', {
            _disabledHooks: [
                { event: 'Stop', matcher: '', command: 'echo old' }
            ]
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks.length, 1);
        assert.strictEqual(hooks[0].enabled, false);
        assert.strictEqual(hooks[0].command, 'echo old');
    });

    it('should load disabled hooks from new format (with type and url)', async function() {
        tmpDir = await createTempSettings('project', {
            _disabledHooks: [
                { event: 'PostToolUse', matcher: '', type: 'http', url: 'https://example.com' }
            ]
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks.length, 1);
        assert.strictEqual(hooks[0].enabled, false);
        assert.strictEqual(hooks[0].type, 'http');
    });

    it('should handle mixed old and new disabled format', async function() {
        tmpDir = await createTempSettings('project', {
            hooks: {
                Stop: [{ matcher: '', hooks: [
                    { type: 'command', command: 'echo active' }
                ] }]
            },
            _disabledHooks: [
                { event: 'Stop', matcher: '', command: 'echo old-disabled' },
                { event: 'PreToolUse', matcher: 'Edit', type: 'prompt', prompt: 'Safe?' }
            ]
        });
        manager = getManagerInstance();
        manager.setWorkspacePath(tmpDir);

        const hooks = await manager.loadConfiguredHooks(true);
        assert.strictEqual(hooks.length, 3);

        const active = hooks.find(h => h.command === 'echo active');
        assert.ok(active);
        assert.strictEqual(active!.enabled, true);

        const oldDisabled = hooks.find(h => h.command === 'echo old-disabled');
        assert.ok(oldDisabled);
        assert.strictEqual(oldDisabled!.enabled, false);

        const newDisabled = hooks.find(h => h.prompt === 'Safe?');
        assert.ok(newDisabled);
        assert.strictEqual(newDisabled!.enabled, false);
        assert.strictEqual(newDisabled!.type, 'prompt');
    });
});
```

### T5 — 模板

```typescript
describe('T5 — Templates', function() {
    it('should return 5 templates', function() {
        const manager = getManagerInstance();
        const templates = manager.getTemplates();
        assert.strictEqual(templates.length, 5);
    });

    it('should have type field on all templates', function() {
        const manager = getManagerInstance();
        const templates = manager.getTemplates();
        for (const t of templates) {
            assert.ok(t.type, `Template "${t.name}" should have type field`);
            assert.strictEqual(t.type, 'command');
        }
    });

    it('should include Completion Notification template', function() {
        const manager = getManagerInstance();
        const templates = manager.getTemplates();
        const notify = templates.find(t => t.name === 'Completion Notification');
        assert.ok(notify);
        assert.strictEqual(notify!.event, 'Stop');
    });

    it('should include Auto-Commit Guard template', function() {
        const manager = getManagerInstance();
        const templates = manager.getTemplates();
        const guard = templates.find(t => t.name === 'Auto-Commit Guard');
        assert.ok(guard);
        assert.strictEqual(guard!.event, 'Stop');
        assert.ok(guard!.command!.includes('stop_hook_active'), 'Should include anti-loop check');
    });
});
```

### 关键要求

- 每个测试用例独立（独立临时目录，reset singleton）
- afterEach 清理临时目录
- 使用 `assert.strictEqual` 而非 `assert.equal`
- 测试 hook 状态变更后，都读回磁盘文件验证（不只检查内存状态）
- 代码注释用英文
```

**完成标准**：
- [x] T1: 5 个用例全部通过
- [x] T2: 3 个用例全部通过
- [x] T3: 6 个用例全部通过
- [x] T4: 3 个用例全部通过
- [x] T5: 4 个用例全部通过
- [x] `npm run test:hooks` 全部绿色

---

## ✅ 验收检查点 3：测试全绿

完成 Task 8-9 后暂停：
- [x] `npm run test:hooks` — 21 个用例全部通过
- [x] 无临时文件泄漏

---

## Task 10：编译验证 + 打包

**AI 提示词**：

```
你是一位 VS Code Extension 发布专家。

### 1. 编译
```bash
npm run compile
```

### 2. 如有编译错误，逐一修复

### 3. 运行测试
```bash
npm run test:hooks
```

### 4. 检查版本号

查看 PRD 是否指定了新版本号。如果需要升版，更新：
- `package.json` → `"version": "x.y.z"`
- `src/ui-v2/getBodyContent.ts` → 版本显示字符串
- `CHANGELOG.md` → 新版本条目

### 5. 打包

```bash
cmd //c "npx @vscode/vsce package --no-dependencies"
```

### 6. 验证产物

确认输出文件名格式为 `claude-code-chatui-{version}.vsix`。
```

**完成标准**：
- [x] 编译零错误
- [x] 测试全绿
- [x] VSIX 文件生成
