# updatePRDv4 — 核心 Bug 修复与协议适配

> 版本：v4.0.7 | 创建日期：2026-04-01 | 完成日期：2026-04-02 | 状态：**已完成** ✅

## 1. 背景与动机

### 1.1 触发事件

v4.0.5 版本中 TodoWrite 工具再次出现 "⏳ undefined undefined" 渲染异常，排查过程中发现：

1. commit `be2694e` 的 UI 修复代码（JSON.parse 字符串 todos）**源码正确但编译产物未同步**
2. 深层问题是 **Claude CLI 的 deferred tool 机制**——模型跳过 ToolSearch 直接调用 TodoWrite 时，参数验证失败，扩展侧无法控制
3. 顺带审查发现了多个确认的 Bug 和与 CLI 新协议的差距

### 1.2 审查方法

- 对照 Claude Agent SDK 最新文档（2026-04 更新）
- 对照 Claude Code CLI 源码（`reference/claude-code-main/src/`）
- 逐行核实每个 Bug 的实际代码，排除了 subagent 分析的错误结论

### 1.3 不在范围内

- 架构级重构（God Object 拆分、UI 框架化）——技术债但不紧急
- SDK 包名变更（`@anthropic-ai/claude-code` → `@anthropic-ai/claude-agent-sdk`）——我们不依赖 npm 包，直接 spawn CLI
- TodoV2（`TaskCreate/Get/Update/List`）迁移——CLI 尚未全面启用，等稳定后再跟进

---

## 2. 需求列表

### 2.1 P0 — 双重 JSON 序列化消除

**文件**：`ClaudeChatProvider.ts:660`、`MessageProcessor.ts:100-110`

**现状**：每条 CLI stdout 流消息都经历无意义的 `JSON.stringify → JSON.parse` 往返：

```
ClaudeProcessService.onData(jsonData)     // 已是 JS 对象
  → ClaudeChatProvider: JSON.stringify(data)  // 对象→字符串
    → MessageProcessor.processJsonLine(line)  // 字符串→JSON.parse→对象
      → _processJsonData(jsonData)            // 实际处理
```

**问题**：
- 每条消息多一次序列化+反序列化，高频流场景（长对话、多工具）有可感知的性能浪费
- `JSON.stringify` 对 `NaN`/`Infinity`/`undefined` 值有静默丢弃行为，可能导致下游字段消失

**方案**：`MessageProcessor` 暴露 `public processJsonData(data: any, callbacks: MessageCallbacks)` 方法，`ClaudeChatProvider` 直接调用，跳过 stringify/parse 环节。保留 `processJsonLine` 供其他可能的字符串输入场景使用。

---

### 2.2 P0 — 新消息类型静默丢弃

**文件**：`MessageProcessor.ts:115-123`

**现状**：`_processJsonData` 只处理 4 种消息类型：

```typescript
if (type === 'assistant' || type === 'user' || type === 'system') → _processMessage
else if (type === 'result') → _processResult
else if (jsonData.error) → _processError
// 其他所有类型 → 静默丢弃
```

**CLI 实际发送但被丢弃的类型**：

| 消息类型 | 用途 | 丢弃影响 |
|---------|------|---------|
| `tool_progress` | 长时间工具执行的进度更新 | 用户看不到工具执行进度 |
| `compact_boundary` | 上下文压缩边界标记 | 无法感知上下文被压缩 |
| `partial_assistant` | 流式 token 输出 | 当前已有替代方案（逐行文本），影响较小 |
| `rate_limit_info` | 速率限制信息 | 用户不知道为何响应变慢 |

**方案**：

**Phase 1（本次）**：
- 对未知消息类型添加 `debugLog` 记录，不再静默丢弃
- 处理 `tool_progress`：向 webview 发送进度事件，UI 显示工具执行耗时

**Phase 2（后续）**：
- 处理 `compact_boundary`：在聊天区显示分隔标记
- 处理 `rate_limit_info`：在状态栏或聊天区提示

---

### 2.3 P1 — 图片 MIME 类型硬编码

**文件**：`ClaudeProcessService.ts:300`

**现状**：所有图片统一声明为 `image/png`：

```typescript
media_type: 'image/png',  // Default PNG, can be extended for auto-detection
```

**问题**：用户粘贴 JPEG/GIF/WebP 图片时，MIME 类型与实际数据不匹配。Claude API 可能拒绝或解码异常。

**方案**：通过 base64 数据的头部 magic bytes 检测实际图片类型：

| Magic Bytes (base64 前缀) | 格式 | MIME |
|--------------------------|------|------|
| `/9j/` | JPEG | `image/jpeg` |
| `iVBOR` | PNG | `image/png` |
| `R0lGOD` | GIF | `image/gif` |
| `UklGR` | WebP | `image/webp` |

添加 `_detectImageMimeType(base64Data: string): string` 工具方法，默认回退 `image/png`。

---

### 2.4 P1 — rm -rf 操作分类错误

**文件**：`MessageProcessor.ts:371-447`

**现状**：`_analyzeBashCommand` 中 `rm` 检查在 `rmdir`/`rm -r` 检查之前，导致 `rm -rf dir` 被错误分类：

```
373: if (command.includes('rm ') && !command.includes('rmdir'))  ← 先匹配
     → return FILE_DELETE  ← rm -rf dir 在这里就返回了

432: if (command.includes('rm') && command.includes('-r'))       ← 永远到不了
     → return DIRECTORY_DELETE
```

**影响**：`rm -rf` 的 undo 操作会使用 `FILE_DELETE` 策略而非 `DIRECTORY_DELETE` 策略，可能导致恢复逻辑不正确。

**方案**：将递归删除检查提前到普通 `rm` 检查之前：

```typescript
// Check recursive rm FIRST (directory delete)
if (command.includes('rm ') && (command.includes('-r') || command.includes('-R'))) {
    // → DIRECTORY_DELETE
}
// Then check plain rm (file delete)
if (command.includes('rm ') && !command.includes('rmdir')) {
    // → FILE_DELETE
}
```

---

### 2.5 P1 — tool_result.content 数组未展开

**文件**：`MessageProcessor.ts:612-621`

**现状**：当 `tool_result.content` 是数组 `[{type:"text", text:"..."}]` 且工具不是 MCP 工具时，直接 `JSON.stringify` 显示原始 JSON：

```typescript
if (typeof resultContent === 'object' && resultContent !== null) {
    if (toolName && toolName.startsWith('mcp__')) {
        resultContent = this._formatMcpToolResult(resultContent, toolName);
    } else {
        resultContent = JSON.stringify(resultContent, null, 2);  // ← 显示原始 JSON
    }
}
```

**问题**：Anthropic API 规范允许 `tool_result.content` 为 `string | ContentBlockParam[]`。虽然当前内置工具多数返回字符串，但 CLI 版本更新后可能切换为数组格式，届时 UI 会显示原始 JSON 而非可读文本。

**方案**：在 JSON.stringify 之前，先检测并提取文本内容：

```typescript
if (Array.isArray(resultContent)) {
    const textParts = resultContent
        .filter((block: any) => block.type === 'text' && block.text)
        .map((block: any) => block.text);
    if (textParts.length > 0) {
        resultContent = textParts.join('\n');
    } else {
        resultContent = JSON.stringify(resultContent, null, 2);
    }
} else if (typeof resultContent === 'object' && resultContent !== null) {
    // existing MCP / fallback logic
}
```

---

### 2.6 P2 — TodoWrite 换行渲染错误

**文件**：`ui-script.ts:243`

**现状**：

```typescript
todoHtml += '\\n' + status + ' ' + escapeHtml(label);
```

在 template literal 中 `'\\n'` 编译为 JS 的 `'\n'`（换行符）。赋给 `innerHTML` 时，HTML 把 `\n` 当作空格，所有 todo 项挤在一行。

**方案**：改用 `<br>` 或 `<div>` 包装每个 todo 项：

```typescript
todoHtml += '<div>' + status + ' ' + escapeHtml(label) + '</div>';
```

---

### 2.7 P2 — ClaudeProcessService 死代码清理

**文件**：`ClaudeProcessService.ts:39,49`

**现状**：`_npmPrefixPromise` 在构造函数中被赋值但**全类没有任何读取**。实际的 npm prefix 使用在 `WindowsCompatibility`（行 144、206），它从 `ClaudeChatProvider` 获取自己的副本。

```typescript
private _npmPrefixPromise: Promise<string | undefined>;  // 39: 声明
this._npmPrefixPromise = this._npmPrefixResolver();       // 49: 赋值，触发 npm prefix 子进程
// 之后再无引用
```

**影响**：每次创建 `ClaudeProcessService` 实例时，白白启动一个 `npm prefix` 子进程。

**方案**：删除 `_npmPrefixPromise` 属性、构造函数赋值行，以及 `_npmPrefixResolver` 参数（如果确认无其他消费者）。同步更新 `ClaudeChatProvider.ts:105` 的传参。

---

### 2.8 P3 — reset() 遗漏 token 计数器

**文件**：`MessageProcessor.ts:68-78`

**现状**：`reset()` 清理了 `_totalTokensInput/Output`、`_totalCost`、`_requestCount` 以及 `_lastToolUseId/Name/Input`，但遗漏了 `_currentRequestTokensInput`（行 55）和 `_currentRequestTokensOutput`（行 56）。

**影响**：极低——仅在会话中途 reset 时，下一次 token 统计可能包含旧值。正常使用流程中不触发。

**方案**：在 `reset()` 中追加两行：

```typescript
this._currentRequestTokensInput = 0;
this._currentRequestTokensOutput = 0;
```

---

### 2.9 P3 — npmFinder 重复调用

**文件**：`ClaudeChatProvider.ts`、`ClaudeProcessService.ts`

**现状**：调试日志确认 npm prefix 解析在启动过程中被调用了 **2 次**：

```
[14:28:54.188Z] [npmFinder] Starting to find npm executable...     ← 第1次（ClaudeChatProvider 构造）
[14:28:57.750Z] [npmFinder] Successfully got npm prefix            ← 3.5秒

[14:28:57.767Z] [npmFinder] Starting to find npm executable...     ← 第2次（ClaudeProcessService 构造）
[14:29:01.224Z] [npmFinder] Successfully got npm prefix            ← 3.2秒
```

第二次调用来自 `ClaudeProcessService` 的 `_npmPrefixResolver()`（即 Bug 2.7 中的死变量）。结合 2.7 的修复，这个重复调用也会一并消除。

**方案**：随 2.7 一起修复——删除 `ClaudeProcessService` 中的 `_npmPrefixResolver` 参数和预热调用后，第二次 npmFinder 调用自然消失，节省 ~3 秒启动时间。

---

## 3. 实施优先级

| 阶段 | 任务 | 优先级 | 预估复杂度 |
|------|------|--------|-----------|
| **Phase 1** | 2.1 双重序列化消除 | P0 | 低 |
| | 2.2 新消息类型处理（tool_progress + 未知类型日志） | P0 | 中 |
| | 2.3 图片 MIME 检测 | P1 | 低 |
| | 2.4 rm -rf 分类修复 | P1 | 低 |
| | 2.5 tool_result.content 数组展开 | P1 | 低 |
| | 2.6 TodoWrite 换行修复 | P2 | 极低 |
| | 2.7 死代码清理 | P2 | 极低 |
| | 2.8 reset() token 计数器 | P3 | 极低 |
| | 2.9 npmFinder 重复调用 | P3 | 低 |

所有任务均为 Phase 1，可在一个版本（v4.0.7）中一次性完成。

---

## 4. 验证方法

由于项目无自动化测试套件，所有验证通过 Extension Development Host 手动执行：

| 任务 | 验证步骤 |
|------|---------|
| 2.1 双重序列化 | 对话中观察 debugLog 不再出现 stringify/parse 路径 |
| 2.2 新消息类型 | 触发长时间工具（如大文件 Read），观察是否有 tool_progress 日志；debugLog 中不再出现未处理类型的静默丢弃 |
| 2.3 图片 MIME | 分别粘贴 PNG/JPEG/WebP 图片发送，debugLog 确认 MIME 类型正确 |
| 2.4 rm -rf 分类 | Claude 执行 `rm -rf` 命令后，检查 undo 面板显示的操作类型是否为 DIRECTORY_DELETE |
| 2.5 tool_result 数组 | 使用 MCP 工具或等 CLI 更新后，确认结果不显示原始 JSON |
| 2.6 TodoWrite 换行 | 触发 TodoWrite 工具，确认每个 todo 项独占一行 |
| 2.7 死代码 | 编译无错误，扩展功能正常（npm prefix 查找仍由 WindowsCompatibility 处理） |
| 2.8 reset() | 新建会话后，token 统计从 0 开始 |
| 2.9 npmFinder | 启动后检查 debug_log.txt，确认 `[npmFinder] Starting` 只出现 1 次而非 2 次 |

---

## 5. 版本发布

完成所有任务后：

1. `package.json` → `"version": "4.0.7"`
2. `src/ui-v2/getBodyContent.ts` → 版本显示 `v4.0.7`
3. `CHANGELOG.md` → 新增 v4.0.7 条目
4. `npm run compile` → 确认零错误
5. `cmd //c "npx @vscode/vsce package --no-dependencies"` → 生成 VSIX

---

## 6. 后续跟进（不在本次范围）

| 方向 | 说明 | 时机 |
|------|------|------|
| TodoV2 适配 | CLI 正迁移到 `TaskCreate/Get/Update/List`，需同时支持新旧协议 | CLI 全面启用后 |
| compact_boundary 显示 | 在聊天区显示上下文压缩分隔标记 | Phase 2 |
| rate_limit_info 提示 | 在状态栏提示速率限制 | Phase 2 |
| Subagent 进度展示 | 处理 `task_started/task_progress/task_notification` | 功能需求明确后 |
| Skills 面板升级 | 支持新 frontmatter 字段（`context: fork`、`agent`、`effort`） | 需求驱动 |
