# 安全加固与缺陷修复 - 开发计划 (v2)

**对应 PRD**：`specs/updatePRDv2.md`
**预计任务数**：8 个任务（多个小修复合并执行）
**预计总工时**：约 3-4 小时

---

## 任务总览

| # | 任务 | 对应功能 | 预计时间 | 依赖 |
|---|------|----------|----------|------|
| 1 | 添加 Webview CSP 安全策略 | A | 30min | 无 |
| 2 | 修复 XSS 注入点（自定义命令 + MCP thinking） | B, C | 20min | 无 |
| 3 | 修复 Windows 孤儿进程问题 | D | 45min | 无 |
| 4 | 修复 ui-script.ts 中的三处缺陷 | E, F, G | 30min | 无 |
| 5 | 修复 StatisticsCache 缓存过期逻辑 | H | 30min | 无 |
| 6 | 代码卫生：移除 docx + 补全 gitBashPath + tree provider disposable | I, J, K | 15min | 无 |
| 7 | .vscodeignore 排除 specs 目录 | L | 5min | 无 |
| 8 | 编译验证 + VSIX 打包 | 全部 | 15min | 1-7 |

---

## Task 1：添加 Webview CSP 安全策略

**对应 PRD**：功能 A

**状态**：[x]

### AI 提示词

```
你是一位资深 VS Code Extension 安全专家，精通 Webview Content Security Policy 配置。

任务：为项目的 Webview 添加 CSP 安全策略。

背景：
- 项目是一个 VS Code 扩展，聊天界面使用 Webview 渲染
- 当前 HTML 完全没有 CSP meta 标签，VS Code 官方文档强制要求所有 Webview 设置 CSP
- HTML 生成在 `src/ui-v2/index.ts` 的 `generateUIHtml()` 函数中
- 当前 HTML 结构：内联 `<style>` + 内联 `<script>`，没有外部资源加载
- `generateUIHtml()` 目前不接受任何参数，是纯函数

需要修改的文件：
1. `src/ui-v2/index.ts` — 添加 CSP meta 标签和 nonce
2. `src/ui-loader.ts` — 调用 `generateUIHtml()` 的地方，可能需要传入 webview 引用

具体步骤：
1. 在 `generateUIHtml()` 中生成一个随机 nonce（使用 crypto 或简单的 Math.random + 时间戳，长度至少 32 字符）
2. 在 `<head>` 中添加 CSP meta 标签：
   ```html
   <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-{nonce}'; style-src 'unsafe-inline'; img-src data:; font-src 'none';">
   ```
3. 给 `<script>` 标签添加 `nonce="{nonce}"` 属性
4. style 使用 `'unsafe-inline'` 因为当前所有 CSS 都是内联的（这是 VS Code Webview 的常见做法）
5. img-src 需要 `data:` 因为代码中有 base64 图片

注意事项：
- `generateUIHtml()` 当前是纯字符串模板函数，修改后仍应保持简洁
- 不需要从外部传入 `webview.cspSource`，因为我们没有加载外部资源
- nonce 每次调用生成新值即可
- 确保 `npm run compile` 零错误

代码注释请使用英文。
```

### 验收标准
- [ ] HTML 输出包含 CSP meta 标签
- [ ] 内联 script 使用 nonce
- [ ] 正常聊天功能不受影响
- [ ] `npm run compile` 通过

---

## Task 2：修复 XSS 注入点（自定义命令 + MCP thinking）

**对应 PRD**：功能 B, C

**状态**：[x]

### AI 提示词

```
你是一位资深前端安全专家，精通 XSS 防护和 HTML 转义。

任务：修复 `src/ui-v2/ui-script.ts` 中两处 XSS 注入点。

背景：
- 该文件是 Webview 前端脚本，以模板字符串形式导出
- 文件中已有 `escapeHtml()` 函数（约第 122 行），使用 DOM 的 textContent/innerHTML 方式转义，实现正确
- 需要在两处使用它

修复点 1：自定义命令显示（约第 2363-2396 行）

当前代码在 `displayCustomCommands` 函数中，两处 innerHTML 拼接都未转义用户输入：
- 第一处（existingCommandsList，管理弹窗）约第 2363 行
- 第二处（customCommandsList，斜杠命令弹窗）约第 2388 行

需要对以下字段调用 escapeHtml()：
- `cmd.name` — 命令名称
- `cmd.description` — 命令描述
- `cmd.command` — 命令内容
- `cmd.icon` — 图标（虽然通常是 emoji 但也应转义）
- `cmd.id` — 在 onclick 属性中使用，需要转义防止引号闭合

对于 onclick 中的 `cmd.id` 和 `cmd.command`，由于它们在单引号字符串内，需要额外转义单引号。可以用 escapeHtml 后再替换 `&#39;` 的方式，或者更好的方式是直接使用现有的 `escapeHtml` 处理显示文本，onclick 中的 ID 使用 `cmd.id.replace(/'/g, "\\'")` 转义。

修复点 2：MCP thinking 工具结果（约第 332-334 行）

当前代码：
```javascript
if (data.toolName && data.toolName.startsWith('mcp__') && data.toolName.includes('thinking')) {
    contentDiv.innerHTML = parseSimpleMarkdown(content, imagePathMap);
}
```

content 需要先经过 escapeHtml 再传给 parseSimpleMarkdown：
```javascript
contentDiv.innerHTML = parseSimpleMarkdown(escapeHtml(content), imagePathMap);
```

注意事项：
- 只修改这两处，不要动其他代码
- escapeHtml 后的文本传给 parseSimpleMarkdown 是安全的，因为 parseSimpleMarkdown 的正则替换（Bold/Italic/Header）操作的是已转义的文本，不会引入新的 HTML 标签
- 确保修改后自定义命令的显示仍然正常（名称、描述、命令内容正确展示）
- 确保 MCP thinking 工具的 Markdown 渲染仍然正常

代码注释请使用英文。
```

### 验收标准
- [ ] 自定义命令的 `cmd.name`、`cmd.description`、`cmd.command`、`cmd.icon` 均经过 `escapeHtml()` 处理
- [ ] onclick 中的 `cmd.id` 和 `cmd.command` 安全转义
- [ ] MCP thinking 工具结果经过 `escapeHtml()` 再传给 `parseSimpleMarkdown()`
- [ ] 自定义命令显示正常
- [ ] MCP thinking Markdown 渲染正常

---

## ✅ 验收检查点 1：安全修复（Task 1-2 完成后暂停）

- [ ] CSP 已添加（Task 1）
- [ ] 自定义命令 XSS 已修复（Task 2）
- [ ] MCP thinking XSS 已修复（Task 2）
- [ ] `npm run compile` 通过

**到达此检查点后暂停，等待用户验收确认。**

---

## Task 3：修复 Windows 孤儿进程问题

**对应 PRD**：功能 D

**状态**：[x]

### AI 提示词

```
你是一位资深 Node.js 进程管理专家，精通 Windows 平台的进程树管理和 VS Code Extension 生命周期。

ultrathink

任务：修复关闭 VS Code 时 Claude CLI 子进程不被终止的问题。需要修改三个文件。

背景：
- 项目是 Windows 专用的 VS Code 扩展，通过 cp.spawn 启动 Claude CLI 进程
- 使用 Git Bash 作为 shell，进程树：Extension Host → bash.exe → claude CLI
- 当前问题是关闭 VS Code 时，子进程可能不被终止成为孤儿进程

问题 1：provider 未注册到 context.subscriptions
文件：`src/extension.ts`
- 第 85 行创建了 `const provider = new ClaudeChatProvider(...)`
- 第 121 行 `context.subscriptions.push(...)` 中没有 provider
- ClaudeChatProvider 实现了 `dispose()` 方法，但只在 webview panel 关闭时通过 `onDidDispose` 调用
- VS Code 关闭时不会自动调用 provider.dispose()

修复：在第 121 行的 `context.subscriptions.push(...)` 中加入 `provider`

同时修复：第 109 行 `vscode.window.registerTreeDataProvider(...)` 返回的 Disposable 也被丢弃了
修复：存储返回值并 push 进 subscriptions

问题 2：killProcess() 不等待 taskkill 完成
文件：`src/managers/WindowsCompatibility.ts`
- `killProcess()` 方法（约第 390 行）声明为 `async ... Promise<void>`
- Windows 分支使用 `cp.exec('taskkill ...', callback)` 但没有用 Promise 包裹
- 函数立即 return，`await killProcess()` 形同虚设

修复：将 Windows 分支的 `cp.exec` 包装在 `new Promise` 中：
```typescript
await new Promise<void>((resolve) => {
    cp.exec(`taskkill /pid ${pid} /t /f`, (error) => {
        if (error) {
            console.error('Failed to kill process with taskkill:', error);
        }
        resolve(); // Always resolve, even on error (process may already be dead)
    });
});
```

问题 3：dispose() 跳过 Windows 专用路径
文件：`src/services/ClaudeProcessService.ts`
- `dispose()` 方法（约第 400 行）直接调用 `this._currentProcess.kill()`
- 这在 Windows 上只杀主进程，不杀子进程树
- 而 `stopProcess()` 方法正确地调用了 `this._windowsCompatibility.killProcess(pid)`
- dispose() 是同步方法（VS Code 扩展 deactivation 要求），但我们可以 fire-and-forget 调用 killProcess

修复：dispose() 中改为发出 taskkill 命令（不等待完成）：
```typescript
public dispose(): void {
    if (this._currentProcess) {
        const pid = this._currentProcess.pid;
        debugLog('ClaudeProcessService', 'Disposing: killing Claude process tree on extension deactivation');
        if (pid) {
            // Fire-and-forget: send taskkill to kill process tree
            // Don't await - dispose must be synchronous
            this._windowsCompatibility.killProcess(pid).catch(error => {
                debugError('ClaudeProcessService', 'Error killing process tree during dispose', error);
            });
        }
        try {
            this._currentProcess.kill(); // Also send SIGTERM as fallback
        } catch (error) {
            // Process may already be dead
        }
        this._currentProcess = undefined;
    }
}
```

注意事项：
- extension.ts 的修改很小，只是在 subscriptions.push 中加两个对象
- WindowsCompatibility 的修改需要确保 Promise 正确包裹 cp.exec
- ClaudeProcessService 的 dispose 保持 void 返回类型（同步签名），用 fire-and-forget 方式调用异步方法
- 确保 `npm run compile` 零错误

代码注释请使用英文。
```

### 验收标准
- [ ] `provider` 在 `context.subscriptions` 中
- [ ] `registerTreeDataProvider` 返回的 Disposable 在 `context.subscriptions` 中
- [ ] `killProcess()` 的 Windows 分支正确包装为 Promise
- [ ] `dispose()` 使用 `killProcess()` 杀进程树（fire-and-forget）
- [ ] `npm run compile` 通过

---

## ✅ 验收检查点 2：进程可靠性（Task 3 完成后暂停）

- [ ] provider 在 subscriptions 中
- [ ] killProcess 正确等待
- [ ] dispose 走 Windows 路径
- [ ] `npm run compile` 通过

**到达此检查点后暂停，建议用户 F5 测试关闭后查看任务管理器确认无孤儿进程。**

---

## Task 4：修复 ui-script.ts 中的三处缺陷

**对应 PRD**：功能 E, F, G

**状态**：[x]

### AI 提示词

```
你是一位资深前端开发专家，精通 DOM 事件管理和调试。

任务：修复 `src/ui-v2/ui-script.ts` 中的三个独立缺陷。该文件是 Webview 前端脚本，以模板字符串形式导出。

缺陷 1：configChanged 参数顺序错误（约第 2965-2967 行）

当前代码：
```javascript
case 'configChanged':
    addMessage('system', event.data);
    break;
```

`addMessage()` 的签名是 `addMessage(content, type = 'claude')`（约第 128 行），第一个参数是内容，第二个是类型。当前把 'system' 当成内容、event.data 当成类型，完全反了。

修复：注意该 switch 块中使用的变量名。查看上下文：主 message handler 使用的变量可能是 `message`（来自 `event.data`），所以正确写法应该参考附近其他 case 的用法。检查 2955-2958 行的 `terminalOpened` case 作为参考：
```javascript
case 'terminalOpened':
    addMessage(message.data, 'system');
    break;
```

所以 configChanged 应该改为：
```javascript
case 'configChanged':
    addMessage(message.data, 'system');
    break;
```

注意：检查变量名是 `message.data` 还是 `event.data`，以主 switch 块中的上下文为准。

缺陷 2：settingsData 消息双重处理（约第 3045 行 + 第 5193 行）

代码中存在两个 `window.addEventListener('message', ...)` 都处理 `settingsData` 消息：
- 第一处：约第 3045 行，在主 message handler 的 switch 之后，用 `if (message.type === 'settingsData')` 处理
- 第二处：约第 5193 行，注册了一个独立的 addEventListener，里面也处理 `settingsData`

第二个 listener（第 5193-5344 行）除了处理 settingsData 外，还处理了：
- `geminiIntegrationConfig`（约第 5330 行）
- `platformInfo`（约第 5335 行）

但这两个消息类型在主 handler 的 switch 中已经有对应的 case 处理。所以第二个 listener 整体是重复的。

修复：删除第 5191-5344 行的整个重复 addEventListener 块（从 `// Add settings message handler` 注释到对应的 `});` 闭合）。

验证：确保主 handler（switch 中 + switch 后的 if 块）已涵盖 settingsData、geminiIntegrationConfig、platformInfo 的所有处理逻辑。如果第二个 listener 中有任何主 handler 没有的逻辑，需要先合并到主 handler 再删除。

缺陷 3：textarea input 事件双重绑定（约第 5346-5350 行）

第一处（约第 1263 行）：
```javascript
messageInput.addEventListener('input', (e) => {
    adjustTextareaHeight();
    addToHistory(messageInput.value);
});
```

第二处（约第 5347 行，在上面要删除的块之后）：
```javascript
const textarea = document.getElementById('messageInput');
textarea.addEventListener('input', () => {
    adjustTextareaHeight();
});
```

修复：删除第二处（约第 5346-5350 行）。第一处已包含 adjustTextareaHeight() 调用。

注意事项：
- 这三个修复互相独立但在同一文件中
- 删除第二个 listener 时要注意不要误删它后面的代码（第 5352 行开始的 `window.xxx = xxx` 全局函数挂载）
- 确保删除后文件语法正确（大括号、分号匹配）

代码注释请使用英文。
```

### 验收标准
- [ ] `configChanged` case 使用正确的参数顺序：`addMessage(message.data, 'system')`
- [ ] 重复的 `addEventListener('message', ...)` 块（第 5191-5344 行）已删除
- [ ] 重复的 textarea `input` 事件绑定（第 5346-5350 行）已删除
- [ ] 主 message handler 已包含 settingsData、geminiIntegrationConfig、platformInfo 的完整处理
- [ ] Settings 弹窗功能正常
- [ ] 输入框自动高度调整正常

---

## Task 5：修复 StatisticsCache 缓存过期逻辑

**对应 PRD**：功能 H

**状态**：[x]

### AI 提示词

```
你是一位资深后端开发专家，精通缓存策略和数据结构设计。

ultrathink

任务：修复 `src/services/StatisticsCache.ts` 中的缓存过期逻辑 Bug。

Bug 描述：
缓存条目的 `timestamp` 字段存储的是文件的 `stats.mtimeMs`（文件修改时间），但 `needsUpdate()` 中用 `Date.now() - timestamp` 来判断缓存是否过期。对一个一周前修改的文件，差值为 7 天，远超 5 分钟的过期阈值，导致缓存永远被判定为过期，形同虚设。

需要修改的文件：
1. `src/services/StatisticsCache.ts`
2. `src/providers/ClaudeChatProvider.ts`（调用处，传入 timestamp 的地方）

修复方案：

步骤 1：修改 CachedFileData 接口（StatisticsCache.ts 约第 20-25 行）

当前：
```typescript
interface CachedFileData {
    timestamp: number;      // File last modification time
    entries: StatisticsEntry[];
    hash: string;
}
```

改为：
```typescript
interface CachedFileData {
    fileTimestamp: number;   // File last modification time (stats.mtimeMs) - for detecting file changes
    cachedAt: number;        // Cache creation time (Date.now()) - for expiry checking
    entries: StatisticsEntry[];
    hash: string;
}
```

步骤 2：修改 needsUpdate()（约第 56-85 行）

- 第 70 行：`cachedData.timestamp !== currentTimestamp` → `cachedData.fileTimestamp !== currentTimestamp`
- 第 76 行：`now - cachedData.timestamp > this.CACHE_EXPIRY_TIME` → `now - cachedData.cachedAt > this.CACHE_EXPIRY_TIME`

步骤 3：修改 updateCache()（约第 100-115 行）

当前签名：`updateCache(filePath: string, entries: StatisticsEntry[], timestamp: number)`

方法内部：
```typescript
this.fileCache.set(filePath, {
    fileTimestamp: timestamp,    // Keep the mtimeMs for file change detection
    cachedAt: Date.now(),        // New: record when cache was created
    entries,
    hash: this.generateHash(filePath, timestamp)
});
```

步骤 4：修改 cleanExpiredCache()（约第 180-195 行）

搜索 `data.timestamp` 的引用，改为 `data.cachedAt`（用于过期清理）。

步骤 5：修改 ClaudeChatProvider.ts 中的调用处

搜索 `this._statisticsCache.updateCache` 的调用，确认传入的 timestamp 参数是 `stats.mtimeMs`（这个不变，因为 updateCache 内部会自己加 Date.now()）。

注意事项：
- `getCachedEntries()` 方法如果也引用了 `timestamp` 字段，需要一并修改
- `hash` 字段计算中如果引用了 `timestamp`，也需要改为 `fileTimestamp`
- 确保所有引用 `CachedFileData.timestamp` 的地方都已更新

代码注释请使用英文。
```

### 验收标准
- [ ] `CachedFileData` 接口包含 `fileTimestamp` 和 `cachedAt` 两个独立字段
- [ ] `needsUpdate()` 用 `fileTimestamp` 检测文件变化，用 `cachedAt` 检测缓存过期
- [ ] `updateCache()` 正确设置两个字段
- [ ] `cleanExpiredCache()` 使用 `cachedAt` 判断过期
- [ ] `npm run compile` 通过

---

## ✅ 验收检查点 3：缺陷修复（Task 4-5 完成后暂停）

- [ ] configChanged 参数修复（Task 4）
- [ ] settingsData 不再双重处理（Task 4）
- [ ] textarea 不再双重绑定（Task 4）
- [ ] 统计缓存过期逻辑修复（Task 5）
- [ ] `npm run compile` 通过

**到达此检查点后暂停，等待用户验收确认。**

---

## Task 6：代码卫生（docx + gitBashPath + tree provider）

**对应 PRD**：功能 I, J, K

**状态**：[x]

### AI 提示词

```
你是一位资深 TypeScript 开发者，擅长代码清理和接口一致性修复。

任务：三个独立的小修复，合并在一个任务中完成。

修复 1：移除未使用的 docx 依赖
文件：`package.json`
- 在 `dependencies` 中删除 `"docx": "^9.5.1"` 这一行
- 该包在整个 src/ 中无任何 import 或 require 引用

修复 2：补全 getWindowsConfig 遗漏的 gitBashPath
文件：`src/managers/config/ApiConfigManager.ts`
- 约第 28-34 行，`getWindowsConfig()` 方法
- `WindowsConfig` 接口声明了 `gitBashPath?: string`，但实现中只读取了 `shell` 和 `pythonPath`

当前代码：
```typescript
return {
    shell: config.get<string>('windows.shell'),
    pythonPath: config.get<string>('windows.pythonPath')
};
```

修复为：
```typescript
return {
    shell: config.get<string>('windows.shell'),
    pythonPath: config.get<string>('windows.pythonPath'),
    gitBashPath: config.get<string>('windows.gitBashPath')
};
```

修复 3：registerTreeDataProvider Disposable 注册
这一项已在 Task 3 中一并处理（extension.ts 的 subscriptions.push）。如果 Task 3 已经处理了，此处跳过。否则：
文件：`src/extension.ts` 第 109 行
```typescript
// 改为：
const treeDisposable = vscode.window.registerTreeDataProvider('claude-code-chatui.chat', treeProvider);
// 并在 121 行加入 treeDisposable
```

代码注释请使用英文。
```

### 验收标准
- [ ] `package.json` 不再包含 `docx` 依赖
- [ ] `getWindowsConfig()` 返回值包含 `gitBashPath`
- [ ] tree provider disposable 已注册（如 Task 3 未处理则在此完成）
- [ ] `npm run compile` 通过

---

## Task 7：.vscodeignore 排除 specs 目录

**对应 PRD**：功能 L

**状态**：[x]

### AI 提示词

```
你是一位 VS Code 扩展发布专家。

任务：在 `.vscodeignore` 中添加 specs 目录排除规则。

文件：项目根目录的 `.vscodeignore`

添加一行：
```
specs/**
```

放在其他排除规则附近即可。这样 VSIX 打包时不会包含规划文档。

代码注释请使用英文。
```

### 验收标准
- [ ] `.vscodeignore` 包含 `specs/**`
- [ ] VSIX 打包后不包含 specs 目录

---

## Task 8：编译验证 + VSIX 打包

**对应 PRD**：全部功能的最终验证

**状态**：[x]

### AI 提示词

```
你是一位 VS Code 扩展构建专家。

任务：执行最终编译验证和 VSIX 打包。

步骤：
1. 运行 `npm run compile`，确认零错误零警告
2. 运行 `cmd //c "npx @vscode/vsce package --no-dependencies"` 打包 VSIX
   注意：必须使用 `cmd //c` 包裹，Git Bash 下直接运行 vsce 会静默失败
3. 确认 VSIX 文件生成成功，记录文件名和大小
4. 对比上一版本（v3.1.8 约 470KB）的大小变化

如果编译有错误，需要回溯修复。
```

### 验收标准
- [ ] `npm run compile` 零错误
- [ ] VSIX 文件成功生成
- [ ] 文件大小合理（移除 docx 后应变小）

---

## ✅ 验收检查点 4：代码卫生 + 最终验证（Task 6-8 完成后暂停）

- [ ] docx 已移除（Task 6）
- [ ] gitBashPath 已补全（Task 6）
- [ ] tree provider disposable 已注册（Task 3 或 Task 6）
- [ ] .vscodeignore 排除 specs（Task 7）
- [ ] `npm run compile` 零错误（Task 8）
- [ ] VSIX 打包成功（Task 8）

**到达此检查点后暂停，等待用户最终验收。**

---

## 文件修改清单

| 文件 | 修改类型 | 涉及任务 |
|------|----------|----------|
| `src/ui-v2/index.ts` | 修改：添加 CSP + nonce | Task 1 |
| `src/ui-v2/ui-script.ts` | 修改：XSS 修复 + 三处缺陷 | Task 2, 4 |
| `src/extension.ts` | 修改：subscriptions 注册 | Task 3 |
| `src/managers/WindowsCompatibility.ts` | 修改：killProcess Promise 包裹 | Task 3 |
| `src/services/ClaudeProcessService.ts` | 修改：dispose 走 Windows 路径 | Task 3 |
| `src/services/StatisticsCache.ts` | 修改：缓存过期逻辑 | Task 5 |
| `src/providers/ClaudeChatProvider.ts` | 修改：updateCache 调用适配（如需要） | Task 5 |
| `src/managers/config/ApiConfigManager.ts` | 修改：补全 gitBashPath | Task 6 |
| `package.json` | 修改：删除 docx 依赖 | Task 6 |
| `.vscodeignore` | 修改：添加 specs/** | Task 7 |
