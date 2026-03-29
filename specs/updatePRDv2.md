# 安全加固与缺陷修复 - 产品需求文档 (v2)

**版本**：v3.1.9
**状态**：✅ 已完成（2026-03-29）

## 1. 概述

### 1.1 背景
基于 v3.1.8 的全面代码审计（10 个维度交叉核查），发现了安全、可靠性、代码质量三类问题。本次修复聚焦于**经逐项核查确认**的真实问题，不涉及架构重构。

### 1.2 目标
- **安全加固**：添加 CSP 防护、修复 XSS 注入点
- **进程可靠性**：修复 Windows 孤儿进程问题
- **缺陷修复**：参数错误、重复监听器、缓存逻辑 bug
- **代码卫生**：清理未使用依赖、修复接口遗漏

### 1.3 范围界定
本版本**仅处理**经用户确认的 14 项修复（原审计 16 项，第 4 项和第 8 项暂缓至后续架构调整）。

**暂缓项（记录但不修）：**
- 第 4 项：restoreContainer SHA 注入 — 当前 SHA 来源可信，风险低，待后续架构改动时一并处理
- 第 8 项：进程 error 事件后 UI 卡在 loading — 待后续前端架构调整时统一处理

---

## 2. 功能需求

### 2.1 功能 A：添加 Webview CSP 安全策略

- **描述**：聊天界面（Webview）缺少 Content Security Policy，VS Code 官方强制要求。CSP 是最后一道防线——即使有 XSS 漏洞，CSP 也能阻止注入的脚本运行。
- **当前问题**：`src/ui-v2/index.ts:11-23` 的 HTML `<head>` 中无 CSP meta 标签
- **修复方案**：
  1. 在 `generateUIHtml()` 中生成随机 nonce
  2. 添加 `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-{nonce}'; style-src 'unsafe-inline'; img-src ... ">`
  3. 给 `<script>` 标签添加 `nonce` 属性
- **验收标准**：
  - [ ] HTML 输出包含 CSP meta 标签
  - [ ] 内联 script 使用 nonce
  - [ ] 注入 `<script>alert(1)</script>` 到消息内容时不执行
  - [ ] 正常聊天功能不受影响

### 2.2 功能 B：修复自定义命令 XSS

- **描述**：用户创建的自定义命令，名称/描述/命令内容在显示时直接插入 `innerHTML`，未经 HTML 转义
- **当前问题代码**：`src/ui-v2/ui-script.ts:2363-2396`
  ```javascript
  <div>/\${cmd.name}</div>
  <div>\${cmd.description}</div>
  <div>\${cmd.command}</div>
  ```
- **修复方案**：所有用户输入字段在插入 innerHTML 前调用 `escapeHtml()` 转义
- **验收标准**：
  - [ ] `cmd.name`、`cmd.description`、`cmd.command`、`cmd.icon`、`cmd.id` 全部经过 `escapeHtml()` 处理
  - [ ] 自定义命令显示正常，特殊字符（`<>&"'`）显示为文字而非 HTML

### 2.3 功能 C：修复 MCP Thinking 工具结果 XSS

- **描述**：MCP thinking 工具返回的结果未经 HTML 转义就传给 Markdown 渲染
- **当前问题代码**：`src/ui-v2/ui-script.ts:332-334`
  ```javascript
  contentDiv.innerHTML = parseSimpleMarkdown(content, imagePathMap);
  // content 未经 escapeHtml
  ```
- **修复方案**：`content` 先走 `escapeHtml()` 再传给 `parseSimpleMarkdown()`
- **验收标准**：
  - [ ] MCP thinking 工具结果中的 HTML 特殊字符被正确转义
  - [ ] Markdown 格式（加粗、标题、列表）仍正常渲染

### 2.4 功能 D：修复 Windows 孤儿进程问题

- **描述**：关闭 VS Code 时，Claude CLI 子进程不会被自动终止。根本原因是三个问题叠加：
  1. `provider` 未加入 `context.subscriptions`，VS Code 不会自动调用 dispose
  2. `killProcess()` 使用 `cp.exec` 回调但未包装 Promise，`await` 形同虚设
  3. `dispose()` 直接调用 `.kill()` 而非 `taskkill /T /F`，不杀子进程树
- **当前问题代码**：
  - `src/extension.ts:121` — provider 不在 subscriptions 中
  - `src/managers/WindowsCompatibility.ts:399` — cp.exec 未包装 Promise
  - `src/services/ClaudeProcessService.ts:400-410` — dispose 用 .kill() 不走 Windows 路径
- **修复方案**：
  1. `extension.ts` 中把 `provider` 加入 `context.subscriptions`
  2. `killProcess()` 中用 `new Promise` 包裹 `cp.exec`，确保 await 真正等待
  3. `dispose()` 改为调用 `_windowsCompatibility.killProcess(pid)` 杀进程树（改为 async 或 fire-and-forget 发出 taskkill 命令）
- **验收标准**：
  - [ ] `provider` 在 `context.subscriptions` 中
  - [ ] `killProcess()` 返回的 Promise 在 taskkill 完成后才 resolve
  - [ ] `dispose()` 在 Windows 上使用 `taskkill /T /F` 杀进程树
  - [ ] 关闭 VS Code 后任务管理器中无残留 node/bash/claude 进程

### 2.5 功能 E：修复 configChanged 参数顺序错误

- **描述**：`addMessage()` 函数的参数是 `(content, type)`，但 configChanged 消息处理处写反了
- **当前问题代码**：`src/ui-v2/ui-script.ts:2965-2967`
  ```javascript
  case 'configChanged':
      addMessage('system', event.data);  // 参数反了
  ```
- **修复方案**：改为 `addMessage(event.data, 'system')`（或 `message.data`，取决于上下文变量名）
- **验收标准**：
  - [ ] configChanged 消息显示正确内容而非 "system" 或 `[object Object]`

### 2.6 功能 F：消除 settingsData 消息双重处理

- **描述**：两处 `window.addEventListener('message', ...)` 都处理了 `settingsData` 消息，逻辑重复，每次更新 DOM 操作执行两遍
- **当前问题代码**：`src/ui-v2/ui-script.ts:3045` 和 `src/ui-v2/ui-script.ts:5193-5196`（第二个 addEventListener）
- **修复方案**：删除 `5193` 行的重复 `addEventListener`，保留 `3045` 行的处理逻辑。检查第二个 listener 中是否有任何非重复的逻辑需要合并
- **验收标准**：
  - [ ] `settingsData` 消息只被一个 handler 处理
  - [ ] Settings 弹窗功能正常（思维模式、语言、模型等配置正确恢复）
  - [ ] 无功能回退

### 2.7 功能 G：消除 textarea input 事件重复绑定

- **描述**：输入框的 `input` 事件被绑定了两次，`adjustTextareaHeight()` 每次打字执行两遍
- **当前问题代码**：`src/ui-v2/ui-script.ts:1263` 和 `src/ui-v2/ui-script.ts:5347`
- **修复方案**：删除 `5347` 行的重复绑定
- **验收标准**：
  - [ ] 输入框 `input` 事件只有一个监听器
  - [ ] 自动高度调整功能正常

### 2.8 功能 H：修复 StatisticsCache 缓存过期逻辑 Bug

- **描述**：缓存过期判断用的是"文件修改时间"(`stats.mtimeMs`) 而非"缓存创建时间"(`Date.now()`)，导致所有超过 5 分钟未修改的文件永远被判为过期，缓存完全无效
- **当前问题代码**：
  - `src/services/StatisticsCache.ts:76` — `now - cachedData.timestamp > CACHE_EXPIRY_TIME`（timestamp 实际是 mtimeMs）
  - `src/providers/ClaudeChatProvider.ts:1177` — 传入 `stats.mtimeMs` 作为 timestamp
- **修复方案**：缓存条目同时存储两个字段：
  - `fileTimestamp`：`stats.mtimeMs`（用于检测文件是否修改）
  - `cachedAt`：`Date.now()`（用于判断缓存是否过期）
- **验收标准**：
  - [ ] 缓存条目包含独立的 `fileTimestamp` 和 `cachedAt` 字段
  - [ ] 文件未修改时，5 分钟内不重新读取
  - [ ] 文件被修改后，立即重新读取
  - [ ] 统计面板加载速度明显提升（对大量历史文件场景）

### 2.9 功能 I：移除未使用的 docx 依赖

- **描述**：`package.json` 中 `"docx": "^9.5.1"` 被列为运行时依赖，但代码中无任何引用
- **修复方案**：从 `package.json` 的 `dependencies` 中删除 `docx`
- **验收标准**：
  - [ ] `package.json` 不再包含 `docx`
  - [ ] `npm run compile` 零错误
  - [ ] VSIX 包体积减小

### 2.10 功能 J：修复 getWindowsConfig 遗漏 gitBashPath

- **描述**：`WindowsConfig` 接口声明了 `gitBashPath?: string`，但 `getWindowsConfig()` 实现中未读取该配置项，返回的 gitBashPath 永远为 undefined
- **当前问题代码**：`src/managers/config/ApiConfigManager.ts:28-34`
- **修复方案**：添加 `gitBashPath: config.get<string>('windows.gitBashPath')`
- **验收标准**：
  - [ ] `getWindowsConfig()` 返回值包含 `gitBashPath`
  - [ ] 用户配置的 gitBashPath 能通过此接口正确读取

### 2.11 功能 K：修复 registerTreeDataProvider Disposable 遗漏

- **描述**：`vscode.window.registerTreeDataProvider()` 返回的 Disposable 未加入 `context.subscriptions`
- **当前问题代码**：`src/extension.ts:109`
- **修复方案**：将返回值存储并 push 进 `context.subscriptions`
- **验收标准**：
  - [ ] tree provider disposable 在 subscriptions 中
  - [ ] 侧边栏会话列表功能正常

### 2.12 功能 L：.vscodeignore 排除 specs 目录

- **描述**：`specs/` 目录的规划文档会被打包进 VSIX 发布包
- **修复方案**：`.vscodeignore` 添加 `specs/**`
- **验收标准**：
  - [ ] VSIX 包中不包含 specs 目录
  - [ ] 打包后 VSIX 体积减小

---

## 3. 非功能需求

### 3.1 兼容性
- 所有修改须保持 Windows 10 + Git Bash 环境下正常运行
- CSP 策略须兼容 VS Code 1.94+

### 3.2 编译验证
- `npm run compile` 零错误
- VSIX 打包成功

---

## 4. 验收检查点

### 检查点 1：安全修复（功能 A-C） ✅
- [x] CSP 已添加（注：因项目有 119 个内联事件处理器，改用 `script-src 'unsafe-inline'` 代替 nonce 方案）
- [x] 自定义命令 XSS 已修复
- [x] MCP thinking XSS 已修复
- [x] `npm run compile` 通过

### 检查点 2：进程可靠性（功能 D） ✅
- [x] provider 在 subscriptions 中
- [x] killProcess 正确等待
- [x] dispose 走 Windows 路径
- [x] F5 测试关闭后无孤儿进程（日志确认 `Disposing: killing Claude process tree`）

### 检查点 3：缺陷修复（功能 E-H） ✅
- [x] configChanged 参数修复
- [x] settingsData 不再双重处理
- [x] textarea 不再双重绑定
- [x] 统计缓存正确工作

### 检查点 4：代码卫生 + 最终验证（功能 I-L） ✅
- [x] docx 已移除
- [x] gitBashPath 已补全
- [x] tree provider disposable 已注册
- [x] .vscodeignore 排除 specs
- [x] `npm run compile` 零错误
- [x] VSIX 打包成功（443 KB，较 v3.1.8 减小约 27 KB）

---

## 5. 暂缓事项记录

以下问题已记录，待后续版本处理：

| # | 问题 | 暂缓理由 |
|---|------|----------|
| 4 | restoreContainer SHA 注入（`ui-script.ts:3251`） | SHA 来源当前可信，待架构调整时改用 DOM API |
| 8 | 进程 error 事件后 UI 卡在 loading（`ClaudeProcessService.ts:384`） | 待前端架构调整时统一处理 |
| - | API Key 通过 postMessage 传输 | 需重构 Settings 交互流程 |
| - | ClaudeChatProvider 神类拆分（3,269 行） | 大型重构，需独立规划 |
| - | ui-script.ts 模块化拆分（5,978 行） | 大型重构，需独立规划 |
| - | MessageCallbacks 接口全为 any | 类型问题，不影响运行时 |
| - | console.* 与 debugLog 混用 | 代码风格，不影响功能 |
