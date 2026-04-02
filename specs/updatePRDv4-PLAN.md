# updatePRDv4-PLAN — 核心 Bug 修复与协议适配 开发计划

> 基于：`specs/updatePRDv4.md` v4.0.7 | 创建日期：2026-04-01 | 完成日期：2026-04-02 | 状态：**已完成** ✅

---

## 任务总览

| # | 任务 | 文件 | 依赖 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 1 | 双重 JSON 序列化消除 | `MessageProcessor.ts`, `ClaudeChatProvider.ts` | 无 | P0 | [x] |
| 2 | 新消息类型处理 | `MessageProcessor.ts`, `ui-script.ts` | Task 1 | P0 | [x] |
| 3 | 图片 MIME 类型检测 | `ClaudeProcessService.ts` | 无 | P1 | [x] |
| 4 | rm -rf 分类修复 | `MessageProcessor.ts` | 无 | P1 | [x] |
| 5 | tool_result.content 数组展开 | `MessageProcessor.ts` | Task 1 | P1 | [x] |
| 6 | TodoWrite 换行修复 | `ui-script.ts` | 无 | P2 | [x] |
| 7 | 死代码清理 + npmFinder 重复调用 | `ClaudeProcessService.ts`, `ClaudeChatProvider.ts` | 无 | P2 | [x] |
| 8 | reset() token 计数器 | `MessageProcessor.ts` | 无 | P3 | [x] |
| 9 | 版本发布 + CHANGELOG | `package.json`, `getBodyContent.ts`, `CHANGELOG.md` | Task 1-8 | — | [x] |

**总任务数**：9 个
**预计总时间**：约 1.5 小时

---

## Task 1：双重 JSON 序列化消除

**预计时间**：15 分钟
**依赖**：无
**关联需求**：PRD 2.1
**状态**：[ ]

**上下文摘要**：
> `ClaudeChatProvider.ts:660` 将已解析的 JS 对象 `JSON.stringify` 后传给 `MessageProcessor.processJsonLine`，后者又 `JSON.parse` 回来。`_processJsonData` 已经是独立的 private 方法，只需暴露为 public。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code 扩展架构和流式数据处理。

请消除 `MessageProcessor` 和 `ClaudeChatProvider` 之间的双重 JSON 序列化。

## 背景

当前数据流：`ClaudeProcessService.onData(object)` → `ClaudeChatProvider` 调用 `JSON.stringify(data)` → `MessageProcessor.processJsonLine(string)` 调用 `JSON.parse(line)` → `_processJsonData(object)`。每条流消息都经历无意义的序列化往返。

## 需求

1. 在 `src/services/MessageProcessor.ts` 中，将 `_processJsonData` 改为 `public processJsonData`
2. 在 `src/providers/ClaudeChatProvider.ts:660`，将 `this._messageProcessor.processJsonLine(JSON.stringify(data), ...)` 改为 `this._messageProcessor.processJsonData(data, ...)`
3. 保留 `processJsonLine` 方法不删除（它内部改为调用 `processJsonData`）

## 技术要求

- 文件：`src/services/MessageProcessor.ts`、`src/providers/ClaudeChatProvider.ts`
- `processJsonLine` 改为内部调用 `processJsonData`，避免代码重复
- 代码注释用英文

## 约束条件

- 不要改变 `processJsonLine` 的 public 签名（其他地方可能引用）
- 不要修改 `_processJsonData` 内部的任何处理逻辑
- 不要改动 `ClaudeProcessService` 的 `onData` 回调签名

**验收标准**：
- [ ] 编译零错误
- [ ] `processJsonData` 为 public 方法
- [ ] `ClaudeChatProvider` 不再对流数据做 `JSON.stringify`
- [ ] `processJsonLine` 仍可用，内部委托给 `processJsonData`

---

## Task 2：新消息类型处理

**预计时间**：20 分钟
**依赖**：Task 1（使用 `processJsonData` 的新结构）
**关联需求**：PRD 2.2
**状态**：[ ]

**上下文摘要**：
> `MessageProcessor._processJsonData` 只处理 `assistant/user/system` + `result` + `error` 五种类型。CLI（v2.1.87）还会发送 `tool_progress`、`compact_boundary` 等类型，全部被静默丢弃。本次只处理 `tool_progress` 和未知类型的日志记录。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 Claude Code CLI 的 stream-json 协议和 VS Code Webview 通信。

请在 `MessageProcessor` 中添加对新消息类型的处理。

## 背景

CLI 的 stream-json 输出除了 `assistant/user/system/result` 之外，还会发送以下类型：
- `tool_progress`：包含 `tool_name`、`elapsed_time_seconds`、`tool_use_id` 字段
- `compact_boundary`：上下文压缩边界标记
- `partial_assistant`：流式 token
- `rate_limit_info`：速率限制

当前 `_processJsonData`（现改名为 `processJsonData`）对这些类型完全静默丢弃。

## 需求

1. 在 `processJsonData` 中添加 `tool_progress` 处理分支：
   - 通过 `callbacks.sendToWebview` 发送 `{ type: 'toolProgress', data: { toolName, elapsedTime, toolUseId } }`
2. 对所有未识别的消息类型，添加 `debugLog('MessageProcessor', 'Unhandled message type', { type: jsonData.type, subtype: jsonData.subtype })` 日志
3. 在 `ui-script.ts` 的 `window.addEventListener('message')` 中添加 `toolProgress` case，更新当前工具执行的耗时显示

## 技术要求

- 文件：`src/services/MessageProcessor.ts`、`src/ui-v2/ui-script.ts`
- `tool_progress` 的 JSON 结构：`{ type: "tool_progress", tool_name: string, elapsed_time_seconds: number, tool_use_id: string }`
- UI 端：找到现有的 `toolStatus` 相关代码，在工具执行中显示 `⏱ Xs` 耗时
- 注意 `ui-script.ts` 是 template literal，字符串转义需要额外的反斜杠层

## 约束条件

- 不要处理 `compact_boundary`、`partial_assistant`、`rate_limit_info`（留给后续版本）
- 不要修改已有的 `assistant/user/system/result/error` 处理逻辑
- 未识别类型只记日志，不抛错

**验收标准**：
- [ ] 编译零错误
- [ ] `tool_progress` 消息能触发 webview 的耗时显示
- [ ] 未知消息类型出现在 debug_log.txt 中而非被静默丢弃

---

## Task 3：图片 MIME 类型检测

**预计时间**：10 分钟
**依赖**：无
**关联需求**：PRD 2.3
**状态**：[ ]

**上下文摘要**：
> `ClaudeProcessService.ts:300` 将所有图片硬编码为 `image/png`。图片数据是纯 base64 字符串，无 metadata。需要通过 base64 前缀的 magic bytes 判断实际格式。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通文件格式识别和二进制数据处理。

请在 `ClaudeProcessService` 中添加图片 MIME 类型自动检测。

## 背景

当前 `_buildUserMessage` 方法在构造图片消息时，将所有图片的 `media_type` 硬编码为 `image/png`（行 300）。用户粘贴 JPEG/GIF/WebP 图片时 MIME 类型与数据不匹配。

## 需求

1. 在 `ClaudeProcessService` 类中添加 private 方法 `_detectImageMimeType(base64Data: string): string`
2. 检测逻辑基于 base64 编码后的前缀字符：
   - `/9j/` → `image/jpeg`
   - `iVBOR` → `image/png`
   - `R0lGOD` → `image/gif`
   - `UklGR` → `image/webp`
   - 默认回退 → `image/png`
3. 在行 300 处调用：`media_type: this._detectImageMimeType(imageData)`

## 技术要求

- 文件：`src/services/ClaudeProcessService.ts`
- 方法放在类的 private 区域（靠近 `_buildUserMessage`）
- 代码注释用英文

## 约束条件

- 不要修改图片的 base64 数据本身
- 不要引入任何新的 npm 依赖
- 只改 `_buildUserMessage` 中的 `media_type` 赋值，不动其他逻辑

**验收标准**：
- [ ] 编译零错误
- [ ] PNG 图片检测为 `image/png`
- [ ] JPEG 图片检测为 `image/jpeg`
- [ ] 未知格式回退为 `image/png`

---

## Task 4：rm -rf 分类修复

**预计时间**：10 分钟
**依赖**：无
**关联需求**：PRD 2.4
**状态**：[ ]

**上下文摘要**：
> `MessageProcessor._analyzeBashCommand` 中，`rm` 的普通删除检查（行 373）在递归删除检查（行 432）之前。`rm -rf dir` 匹配到行 373 后直接返回 `FILE_DELETE`，行 432 的 `DIRECTORY_DELETE` 永远不会被执行。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通命令行解析和操作追踪系统。

请修复 `MessageProcessor._analyzeBashCommand` 中 `rm -rf` 命令的分类错误。

## 背景

`_analyzeBashCommand` 方法（行 371-450）按顺序匹配 bash 命令。当前顺序：
1. 行 373：`rm`（排除 rmdir）→ `FILE_DELETE` ← `rm -rf` 在此匹配并返回
2. 行 392：`mv` → `FILE_RENAME`
3. 行 414：`mkdir` → `DIRECTORY_CREATE`
4. 行 432：`rmdir` 或 `rm -r` → `DIRECTORY_DELETE` ← 永远无法匹配 `rm -rf`

## 需求

调整检查顺序，将递归删除提前：

1. **先检查**递归 rm（`rm` + `-r` 或 `-R` flag）→ `DIRECTORY_DELETE`
2. **再检查**普通 rm → `FILE_DELETE`
3. 同时将行 432 原有的 `rmdir` 单独检查保留（因为 rmdir 不含 `-r`）

## 技术要求

- 文件：`src/services/MessageProcessor.ts`，`_analyzeBashCommand` 方法
- 修改行 371-450 的检查顺序
- 递归 rm 的正则需要匹配 `-r`、`-rf`、`-fr`、`-R` 等变体
- 保留现有的引号路径匹配逻辑（`quotedMatch` / `unquotedMatch`）

## 约束条件

- 不要改动 `mv`、`mkdir` 的检查逻辑
- 不要改变 `OperationType` 枚举
- 保持 `rmdir` 命令也能正确匹配 `DIRECTORY_DELETE`

**验收标准**：
- [ ] `rm -rf mydir` → `DIRECTORY_DELETE`
- [ ] `rm -r mydir` → `DIRECTORY_DELETE`
- [ ] `rm file.txt` → `FILE_DELETE`
- [ ] `rmdir emptydir` → `DIRECTORY_DELETE`
- [ ] 编译零错误

---

## Task 5：tool_result.content 数组展开

**预计时间**：10 分钟
**依赖**：Task 1（在同一方法链中）
**关联需求**：PRD 2.5
**状态**：[ ]

**上下文摘要**：
> `MessageProcessor._processToolResult`（行 612-621）对非 MCP 工具的 object 类型 content 直接 `JSON.stringify`。Anthropic API 允许 `tool_result.content` 为数组 `[{type:"text", text:"..."}]`，需要先提取文本。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 Anthropic Messages API 协议和数据格式处理。

请在 `MessageProcessor._processToolResult` 中添加对数组类型 `content` 的文本提取。

## 背景

当前代码（行 612-621）：
```typescript
if (typeof resultContent === 'object' && resultContent !== null) {
    if (toolName && toolName.startsWith('mcp__')) {
        resultContent = this._formatMcpToolResult(resultContent, toolName);
    } else {
        resultContent = JSON.stringify(resultContent, null, 2);  // 问题：数组也被 stringify
    }
}
```

Anthropic API 的 `tool_result.content` 类型是 `string | ContentBlockParam[]`，其中 `ContentBlockParam` 为 `{type: "text", text: string}` 等。

## 需求

在 `typeof resultContent === 'object'` 检查内部，**最先**检测是否为数组并提取文本：

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
    if (toolName && toolName.startsWith('mcp__')) {
        resultContent = this._formatMcpToolResult(resultContent, toolName);
    } else {
        resultContent = JSON.stringify(resultContent, null, 2);
    }
}
```

## 技术要求

- 文件：`src/services/MessageProcessor.ts`，`_processToolResult` 方法
- Array 检查必须在 object 检查之前（因为 `Array.isArray` 是 object 的子集）
- 保留 MCP 工具的特殊格式化逻辑不变

## 约束条件

- 不要修改 `_formatMcpToolResult` 方法
- 不要改变字符串类型 content 的处理路径
- 当数组中没有 text 块时（如全是 image 块），仍回退 JSON.stringify

**验收标准**：
- [ ] 字符串类型 content 仍正常处理
- [ ] 数组 `[{type:"text", text:"hello"}]` 提取为 `"hello"`
- [ ] MCP 工具结果仍走 `_formatMcpToolResult`
- [ ] 编译零错误

---

## Task 6：TodoWrite 换行修复

**预计时间**：5 分钟
**依赖**：无
**关联需求**：PRD 2.6
**状态**：[ ]

**上下文摘要**：
> `ui-script.ts` 中 TodoWrite 渲染用 `'\\n'`（template literal 中编译为 `\n`），赋给 `innerHTML` 时 HTML 把换行当空格，所有 todo 挤在一行。

**AI 提示词**：

你是一位资深前端开发专家，精通 DOM 操作和 HTML 渲染，特别熟悉 TypeScript template literal 的转义规则。

请修复 `ui-script.ts` 中 TodoWrite 工具的换行渲染问题。

## 背景

`ui-script.ts` 是一个 TypeScript template literal（整个文件导出一个 JS 字符串）。当前代码：
```typescript
todoHtml += '\\n' + status + ' ' + escapeHtml(label);
```
`'\\n'` 在 template literal 中编译为 JS 的 `'\n'`，赋给 `innerHTML` 时 HTML 将 `\n` 当空白处理，导致所有 todo 项显示在一行。

## 需求

将每个 todo 项用 `<div>` 包裹：
```typescript
todoHtml += '<div>' + status + ' ' + escapeHtml(label) + '</div>';
```

## 技术要求

- 文件：`src/ui-v2/ui-script.ts`
- 搜索 `todoHtml += '\\\\n'` 或 `todoHtml += '\\n'`（注意 template literal 转义层）
- 只改这一行，不动周围逻辑
- `<div>` 不需要额外 class，继承父容器样式即可

## 约束条件

- 不要修改 todo 的 JSON.parse 修复逻辑（`typeof todos === 'string'` 检查）
- 不要修改 status emoji 的映射逻辑
- 不要添加额外的 CSS 样式

**验收标准**：
- [ ] 编译零错误
- [ ] TodoWrite 每个 todo 项独占一行
- [ ] todo 内容仍经过 `escapeHtml` 处理

---

## Task 7：死代码清理 + npmFinder 重复调用

**预计时间**：10 分钟
**依赖**：无
**关联需求**：PRD 2.7 + 2.9
**状态**：[ ]

**上下文摘要**：
> `ClaudeProcessService` 的 `_npmPrefixPromise` 赋值后全类无读取，白白触发一次 `npm prefix` 子进程（约 3 秒）。实际的 npm prefix 使用在 `WindowsCompatibility`，从 `ClaudeChatProvider` 获取自己的副本。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通依赖注入和 VS Code 扩展架构。

请清理 `ClaudeProcessService` 中未使用的 `_npmPrefixPromise` 及其相关代码。

## 背景

当前依赖链：
- `ClaudeChatProvider` 构造时调用 `resolveNpmPrefix()` → 存为 `this._npmPrefixPromise`
- `WindowsCompatibility` 接收这个 promise → 在行 144、206 使用（✅ 正确）
- `ClaudeProcessService` 接收 `_npmPrefixResolver` 回调 → 行 49 调用并存储 → **之后再无读取**（❌ 浪费）

调试日志确认：npmFinder 在启动时被调用 2 次，第 2 次来自 `ClaudeProcessService` 构造函数，耗时 ~3 秒。

## 需求

1. `ClaudeProcessService.ts`：
   - 删除 `private _npmPrefixPromise` 属性声明（行 39）
   - 删除构造函数参数 `private _npmPrefixResolver: () => Promise<string | undefined>`（行 47）
   - 删除 `this._npmPrefixPromise = this._npmPrefixResolver()`（行 49）
2. `ClaudeChatProvider.ts`：
   - 找到创建 `ClaudeProcessService` 的地方，移除传递 `_npmPrefixResolver` 的参数

## 技术要求

- 文件：`src/services/ClaudeProcessService.ts`、`src/providers/ClaudeChatProvider.ts`
- 确认 `ClaudeProcessService` 中没有其他地方引用 `_npmPrefixPromise` 或 `_npmPrefixResolver`
- `WindowsCompatibility` 的 npm prefix 功能不受影响（它有自己的副本）

## 约束条件

- 不要修改 `WindowsCompatibility` 的任何代码
- 不要修改 `resolveNpmPrefix()` 工具函数
- 不要改动 `ClaudeChatProvider` 中传给 `WindowsCompatibility` 的 `_npmPrefixPromise`

**验收标准**：
- [ ] 编译零错误
- [ ] `ClaudeProcessService` 构造函数参数减少一个
- [ ] 启动时 debug_log.txt 中 `[npmFinder] Starting` 只出现 1 次
- [ ] Claude CLI 仍能正常 spawn 和通信

---

## Task 8：reset() token 计数器

**预计时间**：2 分钟
**依赖**：无
**关联需求**：PRD 2.8
**状态**：[ ]

**上下文摘要**：
> `MessageProcessor.reset()` 清理了大部分状态，但遗漏了 `_currentRequestTokensInput` 和 `_currentRequestTokensOutput`。

**AI 提示词**：

你是一位资深 TypeScript 开发专家。

请在 `src/services/MessageProcessor.ts` 的 `reset()` 方法中补充遗漏的 token 计数器重置。

## 需求

在 `reset()` 方法（行 68-78）的末尾、`this._lastOperationTracked = false;` 之后添加：

```typescript
this._currentRequestTokensInput = 0;
this._currentRequestTokensOutput = 0;
```

## 约束条件

- 只在 `reset()` 方法内添加这两行
- 不要修改任何其他方法

**验收标准**：
- [ ] 编译零错误
- [ ] `reset()` 方法清理了所有计数器状态

---

## Task 9：版本发布 + CHANGELOG

**预计时间**：10 分钟
**依赖**：Task 1-8
**关联需求**：PRD 5. 版本发布
**状态**：[ ]

**上下文摘要**：
> 所有 bug 修复完成后，更新版本号、CHANGELOG，编译打包。

**AI 提示词**：

你是一位资深 VS Code 扩展开发专家，熟悉版本发布流程。

请完成 v4.0.7 的版本发布。

## 需求

1. `package.json` → `"version": "4.0.7"`
2. `src/ui-v2/getBodyContent.ts` → 找到版本显示字符串，更新为 `v4.0.7`
3. `CHANGELOG.md` → 在顶部添加 v4.0.7 条目：

```markdown
## v4.0.7 — Bug 修复与协议适配 (2026-04-01)

### Bug Fixes
- **P0**: 消除双重 JSON 序列化，流消息不再经历 stringify/parse 往返
- **P0**: 新增 `tool_progress` 消息处理，未知消息类型记录到 debug log
- **P1**: 图片 MIME 类型自动检测（支持 PNG/JPEG/GIF/WebP）
- **P1**: 修复 `rm -rf` 被错误分类为 FILE_DELETE（应为 DIRECTORY_DELETE）
- **P1**: tool_result.content 数组类型自动展开为文本
- **P2**: TodoWrite 换行修复（`\n` → `<div>` 包裹）
- **P2**: 清理 ClaudeProcessService 死代码，减少一次 npmFinder 调用（节省 ~3s 启动时间）
- **P3**: reset() 补充遗漏的 token 计数器重置
```

4. 编译：`npm run compile` → 确认零错误
5. 打包：`cmd //c "npx @vscode/vsce package --no-dependencies"`
6. 确认产物：`claude-code-chatui-4.0.7.vsix`

## 约束条件

- CHANGELOG 条目用英文（与现有风格一致）
- 不要修改 .vscodeignore（specs/ 已在排除列表中）

**验收标准**：
- [ ] 三处版本号一致为 4.0.7
- [ ] 编译零错误
- [ ] VSIX 文件名正确
- [ ] VSIX 体积合理（~360KB 左右）

---

## 验收检查点

- [ ] **Task 1-2 完成后**：核心数据流验收 — 启动插件对话，确认流消息正常处理、tool_progress 日志出现
- [ ] **Task 3-8 完成后**：全部 bug 修复验收 — 在 Extension Development Host 中测试图片发送、TodoWrite 显示、undo 面板
- [ ] **Task 9 完成后**：发布验收 — 安装 VSIX，确认版本号显示正确，基本功能正常
