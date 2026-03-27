# 插件系统安全修复与代码清理 - 开发任务清单

## 概述

基于 `specs/updatePRDv1.md` 的安全修复与代码清理开发计划。

**相关文档**：
- PRD：`specs/updatePRDv1.md`
- 技术栈：VS Code Extension API、TypeScript 5.8、Node.js child_process

**总任务数**：7 个
**预计总时间**：约 3.5 小时

---

## 任务列表

### Task 1: 修复 BackupManager Shell 注入风险
**预计时间**: 30 分钟
**依赖**: 无
**关联需求**: PRD 2.1 功能 A
**状态**: [x]

**上下文摘要**:
> `BackupManager.ts` 使用 `util.promisify(cp.exec)` 拼接字符串执行 Git 命令。用户聊天消息直接嵌入 `commit -m` 参数，存在 Shell 注入风险。需将所有 `exec()` 改为 `execFile()` + args 数组。

**AI 提示词**:

你是一位资深 Node.js 安全工程师，精通 `child_process` API（`exec` vs `execFile` 的安全差异）、Shell 注入防护，以及 Git CLI 的参数传递方式。

请修复 `src/managers/BackupManager.ts` 中的 Shell 注入风险。

## 背景
当前文件使用 `const exec = util.promisify(cp.exec)` 执行所有 Git 命令，通过字符串模板拼接构造命令行。`commit -m "${actualMessage}"` 中的 `actualMessage` 包含用户输入，存在命令注入风险。

## 需求
1. 将所有 `exec(字符串模板)` 调用改为 `execFile('git', [...args])` 形式
2. 涉及的命令（共 9 处）：
   - `git init`（line 63-65）
   - `git config user.name`（line 67）
   - `git config user.email`（line 68）
   - `git add -A`（line 94-96）
   - `git rev-parse HEAD`（line 101-103, line 137-139）
   - `git status --porcelain`（line 110-112）
   - `git commit -m`（line 133-135）— **最关键的注入点**
   - `git checkout <sha> -- .`（line 179）

## 技术要求
- 使用 `util.promisify(cp.execFile)` 替换 `util.promisify(cp.exec)`
- `execFile` 不经过 Shell 解释，参数作为数组传递，天然防注入
- `--git-dir` 和 `--work-tree` 作为独立参数传入
- 代码注释使用英文
- 保持 `debugLog` 日志输出内容不变（日志中可继续拼接字符串用于展示）

## 约束条件
- 不要改变函数签名和公共接口
- 不要修改 `CommitInfo` 接口
- 不要添加新的依赖
- 保持错误处理结构不变

## 参考
`execFile` 用法：
```typescript
const execFile = util.promisify(cp.execFile);
// exec 版本（不安全）：
await exec(`git --git-dir="${repo}" commit -m "${msg}"`);
// execFile 版本（安全）：
await execFile('git', ['--git-dir', repo, 'commit', '-m', msg]);
```

**验收标准**:
- [x] `BackupManager.ts` 中不再有 `exec(字符串模板)` 调用
- [x] 所有 9 处 Git 命令改为 `execFile('git', [...args])` 形式
- [x] `npm run compile` 编译通过
- [x] 备份/恢复功能正常（日志行为保持一致）

---

### Task 2: 泛化 SecretService 支持多种 API Key
**预计时间**: 30 分钟
**依赖**: 无
**关联需求**: PRD 2.2 功能 B（第一步）
**状态**: [x]

**上下文摘要**:
> `SecretService.ts` 当前仅支持 Gemini API key 存取。需要泛化为通用的密钥管理服务，新增对 Anthropic API key 的支持，为 Task 3 的迁移做准备。

**AI 提示词**:

你是一位资深 VS Code 扩展开发专家，精通 `vscode.SecretStorage` API、安全凭据管理和 TypeScript 面向对象设计。

请泛化 `src/services/SecretService.ts`，使其支持存储多种 API key。

## 背景
当前 `SecretService` 是一个单例类，方法全部硬编码为 Gemini 专用（`getGeminiApiKey`、`setGeminiApiKey` 等）。现在需要新增 Anthropic API key 存储，同时保持对 Gemini 的向后兼容。

## 需求
1. 新增通用的密钥存取方法：
   - `getApiKey(provider: string): Promise<string | undefined>`
   - `setApiKey(provider: string, key: string): Promise<void>`
   - `deleteApiKey(provider: string): Promise<void>`
2. 定义 provider 常量：`ANTHROPIC = 'anthropic-api-key'`，`GEMINI = 'gemini-api-key'`
3. **保留**现有的 `getGeminiApiKey()`、`setGeminiApiKey()`、`deleteGeminiApiKey()` 方法，内部委托到通用方法（向后兼容）
4. 新增 Anthropic 相关便捷方法：`getAnthropicApiKey()`、`setAnthropicApiKey()`、`deleteAnthropicApiKey()`
5. 新增静态验证方法 `isValidAnthropicApiKeyFormat(key: string): boolean`（Anthropic key 以 `sk-ant-` 开头）

## 技术要求
- 文件位置：`src/services/SecretService.ts`
- 使用 `vscode.SecretStorage` 的 `get`/`store`/`delete` 方法
- 代码注释使用英文
- 维持单例模式不变

## 约束条件
- 不要删除任何现有公共方法（Gemini 相关的保持不动）
- 不要修改 `initialize()` 方法签名
- `SECRET_KEYS` 常量可扩展但不改名

**验收标准**:
- [x] 新增 `getApiKey`/`setApiKey`/`deleteApiKey` 通用方法
- [x] 新增 Anthropic 便捷方法和验证方法
- [x] 现有 Gemini 方法调用行为不变
- [x] `npm run compile` 编译通过

---

### Task 3: 将 Anthropic API Key 迁移到 SecretStorage
**预计时间**: 45 分钟
**依赖**: Task 2
**关联需求**: PRD 2.2 功能 B（第二步）
**状态**: [x]

**上下文摘要**:
> Task 2 已泛化 SecretService。本任务将 `ApiConfigManager` 中的 Anthropic key 存储从 `settings.json` 明文迁移到 `SecretStorage` 加密存储，并实现已有用户的自动迁移逻辑。

**AI 提示词**:

ultrathink

你是一位资深 VS Code 扩展开发专家，精通 `vscode.workspace.getConfiguration` 和 `vscode.SecretStorage` API，擅长数据迁移和向后兼容方案设计。

请将 Anthropic API key 从 `settings.json` 明文存储迁移到 `SecretStorage` 加密存储。

## 背景
- `src/managers/config/ApiConfigManager.ts` 当前用 `config.update('api.key', ...)` 将 API key 写入 `settings.json`（明文）
- `src/services/SecretService.ts` 已泛化（Task 2 完成），支持 `setAnthropicApiKey()` / `getAnthropicApiKey()`
- 需要实现自动迁移：首次启动时检测 `settings.json` 中的旧 key → 存入 SecretStorage → 清空 settings 中的明文值

## 需求
1. **修改 `ApiConfigManager`**：
   - `getApiKey()` 改为 async，从 `SecretService.getAnthropicApiKey()` 读取
   - `updateApiKey(key)` 改为调用 `SecretService.setAnthropicApiKey(key)`
   - `getApiConfig()` 的 `key` 字段改为空字符串（key 不再从 settings 读取）
2. **实现迁移逻辑**（在 `ApiConfigManager` 中新增 `migrateApiKeyIfNeeded()` 方法）：
   - 读取 `settings.json` 中的 `api.key`
   - 如果有值且非空，存入 SecretStorage，然后将 settings 中的值设为空字符串
   - 迁移完成后打日志
3. **在扩展启动时调用迁移**：在 `ClaudeChatProvider` 合适的位置调用 `migrateApiKeyIfNeeded()`
4. **更新 Settings UI 交互**：`ClaudeChatProvider` 中处理 `updateSettings` 消息时，API key 的读写改走 SecretService

## 技术要求
- 修改文件：`src/managers/config/ApiConfigManager.ts`、`src/providers/ClaudeChatProvider.ts`
- `SecretService` 实例通过 `SecretService.getInstance()` 获取
- 代码注释使用英文

## 约束条件
- `package.json` 中的 `claudeCodeChatUI.api.key` 配置声明保留（用于向后兼容检测）
- 不要修改 `ApiConfig` 接口定义（但 `key` 字段在 `getApiConfig` 中返回空字符串）
- `ClaudeProcessService` 中的 `ANTHROPIC_API_KEY` 环境变量注入逻辑需要适配（从 SecretService 异步读取）
- 不要破坏现有的 Settings UI 显示

**验收标准**:
- [x] API key 存储在 OS 钥匙链中
- [x] `settings.json` 中不再出现明文 API key
- [x] 旧用户首次启动后自动迁移（settings → SecretStorage → 清空 settings）
- [x] Settings UI 中 API key 输入/保存功能正常
- [x] 使用自定义 API 端点发送消息功能正常
- [x] `npm run compile` 编译通过

---

### ✅ 验收检查点 1：安全修复验收（Task 1-3 完成后暂停）

完成 Task 1-3 后，请暂停并验收：
- [x] BackupManager 不再有字符串拼接的 `exec` 调用
- [x] API Key 已迁移到 OS 钥匙链加密存储
- [x] 已有用户 key 自动迁移逻辑正确
- [x] `npm run compile` 编译通过

**用户确认"继续"后进入下一阶段。**

---

### Task 4: 消除 escapeHtml 三重定义
**预计时间**: 15 分钟
**依赖**: 无
**关联需求**: PRD 2.3 功能 C
**状态**: [x]

**上下文摘要**:
> `ui-script.ts` 中 `escapeHtml` 被定义了 3 次（line 122, 667, 5894），由于 JS 函数提升只有最后一个生效。需要合并为一个定义。

**AI 提示词**:

你是一位资深 JavaScript 开发专家，精通 JavaScript 函数提升机制、DOM API 和 XSS 防护。

请清理 `src/ui-v2/ui-script.ts` 中的 `escapeHtml` 三重定义问题。

## 背景
`ui-script.ts` 是一个导出为字符串常量的 ~5,995 行 JavaScript 文件。在同一作用域内，`escapeHtml` 被定义了 3 次：
- **line 122**：regex 版，手动映射 `&<>"'` 五个实体
- **line 667**：DOM 版，`div.textContent = text; return div.innerHTML;`
- **line 5894**：与 line 667 完全相同的 DOM 版

由于 JavaScript 的 `function` 声明提升，最后一个（line 5894）覆盖前两个。

## 需求
1. 在文件靠前位置（当前 line 122 附近）保留**一个** `escapeHtml` 定义
2. 推荐保留 DOM 版实现（`div.textContent`/`div.innerHTML`），因为这是当前实际生效的版本
3. 删除 line 667 和 line 5894 处的重复定义
4. 确保所有调用点仍然可以访问该函数

## 技术要求
- 文件位置：`src/ui-v2/ui-script.ts`
- 注意：此文件内容是模板字符串，修改时注意反引号转义
- 代码注释使用英文

## 约束条件
- 只做删除重复定义这一件事，不要重构其他代码
- 不要改变函数的实现逻辑
- 不要添加新功能

**验收标准**:
- [x] `ui-script.ts` 中只有一个 `escapeHtml` 函数定义
- [x] 定义位于文件靠前位置
- [x] `npm run compile` 编译通过
- [x] HTML 转义行为不变

---

### Task 5: 清除未生效的 CSS 模块目录
**预计时间**: 20 分钟
**依赖**: 无
**关联需求**: PRD 2.4 功能 D
**状态**: [x]

**上下文摘要**:
> `src/ui-v2/styles/` 目录下 14 个文件（6,090 行）的 CSS 模块在运行时从未被调用。`index.ts` 中 import 了 `getCombinedStyles` 但从未使用。同时还有其他未使用的 import（`StateManager`, `EventHandlers`, `parseMarkdown`, `VscodeApi`）。需要清理所有死代码。

**AI 提示词**:

你是一位资深 TypeScript 代码质量专家，精通模块依赖分析、死代码消除和 VS Code 扩展构建流程。

请清除 `src/ui-v2/` 中未生效的 CSS 模块和未使用的 import。

## 背景
`src/ui-v2/index.ts` 是 UI 的入口文件。它 import 了多个模块但从未调用：
- `getCombinedStyles` from `./styles` — 整个 `styles/` 目录 14 个文件是死代码
- `StateManager` from `./services/StateManager`
- `EventHandlers` from `./services/EventHandlers`
- `parseMarkdown` from `./utils/markdown`
- `VscodeApi` from `./types`
- `formatDiff` from `./utils/formatters/diff-formatter`
- `formatToolInputUI` from `./utils/formatters/tool-formatter`

实际渲染路径：`generateUIHtml()` → `getStyles()` → `getStylesWithEnhancements()` → `getStylesOld()`（内联 CSS）。`getCombinedStyles()` 从未被调用。

## 需求
1. 删除 `src/ui-v2/styles/` 整个目录（含所有子目录和文件）
2. 逐一检查 `src/ui-v2/index.ts` 中每个 import 是否在文件内使用：
   - 已确认未使用：`getCombinedStyles`, `StateManager`, `EventHandlers`, `VscodeApi`
   - 需要确认：`parseMarkdown`, `formatDiff`, `formatToolInputUI` — 检查它们在 `index.ts` 内是否被调用
3. 删除所有确认未使用的 import 语句
4. 如果 `src/ui-v2/services/StateManager.ts` 和 `src/ui-v2/services/EventHandlers.ts` 不被其他文件引用，也一并删除
5. 如果 `src/ui-v2/services/index.ts` 只是 re-export 被删除的模块，也删除
6. 如果 `src/ui-v2/types/index.ts` 不被任何运行时代码引用，也删除

## 技术要求
- 删除前用 grep 确认每个待删文件/目录在 `src/` 中无其他引用
- 删除后运行 `npm run compile` 确认无编译错误
- 代码注释使用英文

## 约束条件
- 不要修改 `getStylesOld()` 和 `getStylesWithEnhancements()` 的任何内容
- 不要修改 `getBodyContent.ts` 和 `ui-script.ts` 的任何内容
- 仅删除死代码，不做任何重构

**验收标准**:
- [x] `src/ui-v2/styles/` 目录已删除
- [x] `index.ts` 无未使用的 import
- [x] 无孤立文件（被删除模块的 re-export barrel 一并清理）
- [x] `npm run compile` 编译通过
- [x] 插件 UI 外观不变

---

### ✅ 验收检查点 2：代码清理验收（Task 4-5 完成后暂停）

完成 Task 4-5 后，请暂停并验收：
- [x] `escapeHtml` 在 `ui-script.ts` 中仅一处定义
- [x] `src/ui-v2/styles/` 目录已删除
- [x] 无未使用的 import 残留
- [x] `npm run compile` 编译通过
- [x] UI 外观无变化

**用户确认"继续"后进入下一阶段。**

---

### Task 6: 修复进程启动竞态条件
**预计时间**: 15 分钟
**依赖**: 无
**关联需求**: PRD 2.5 功能 E
**状态**: [x]

**上下文摘要**:
> `ClaudeProcessService.ts` 的 `startProcess()` 方法中，`if (this._currentProcess)` 检查与 `this._currentProcess = cp.spawn(...)` 赋值之间有一个 `await _prepareProcessExecution()` 异步间隙，理论上可导致双进程。需要加互斥标志位。

**AI 提示词**:

你是一位资深 Node.js 并发控制专家，精通 JavaScript 事件循环、async/await 竞态条件和进程管理。

请修复 `src/services/ClaudeProcessService.ts` 中的进程启动竞态条件。

## 背景
`startProcess()` 方法的逻辑：
```typescript
if (this._currentProcess) { throw ... }     // line 67 — 检查
const { ... } = await this._prepareProcessExecution(options);  // line 71 — async gap
this._currentProcess = cp.spawn(...);        // line 92 — 赋值
```
在 `await` 期间，另一个调用可以通过 line 67 的检查，导致两个进程同时启动。

## 需求
1. 新增 `private _isStarting: boolean = false` 字段
2. 在 `startProcess` 入口处同时检查 `_currentProcess` 和 `_isStarting`
3. 检查通过后立即设置 `_isStarting = true`
4. 使用 `try/finally` 确保无论成功还是异常，`_isStarting` 都会被重置

## 技术要求
- 文件位置：`src/services/ClaudeProcessService.ts`
- 代码注释使用英文

## 约束条件
- 仅修改 `startProcess` 方法和新增字段
- 不要改变 `stopProcess`、`dispose` 等其他方法
- 不要改变方法签名

## 参考实现
```typescript
private _isStarting = false;

public async startProcess(options: ProcessOptions, callbacks: ProcessCallbacks): Promise<void> {
    if (this._currentProcess || this._isStarting) {
        throw new Error('A Claude process is already running');
    }
    this._isStarting = true;
    try {
        const { execEnvironment, args } = await this._prepareProcessExecution(options);
        // ... rest of existing logic ...
        this._currentProcess = cp.spawn(...);
    } finally {
        this._isStarting = false;
    }
    // Set up event handlers (after finally, _isStarting is reset)
    this._setupProcessHandlers(this._currentProcess, callbacks);
}
```

**验收标准**:
- [x] 新增 `_isStarting` 字段
- [x] `startProcess` 入口双重检查
- [x] `finally` 块确保重置
- [x] `npm run compile` 编译通过
- [x] 正常发送消息功能不受影响

---

### Task 7: 全量编译验证与 VSIX 打包
**预计时间**: 15 分钟
**依赖**: Task 1-6 全部完成
**关联需求**: PRD 5 验收检查点 3
**状态**: [x]

**上下文摘要**:
> 所有修改完成后，进行全量编译验证和 VSIX 打包，确保无回归问题。

**AI 提示词**:

你是一位资深 VS Code 扩展发布工程师，精通 TypeScript 编译、`@vscode/vsce` 打包和扩展兼容性验证。

请执行全量编译和打包验证。

## 需求
1. 运行 `npm run compile`，确认零错误、零警告
2. 使用 `cmd //c "npx @vscode/vsce package --no-dependencies"` 打包 VSIX
3. 确认 VSIX 文件生成成功
4. 检查打包产物大小是否合理（删除 6,090 行死代码后应明显减小）

## 约束条件
- 打包命令必须在 cmd 中执行（Git Bash 会静默失败）
- 不要修改任何代码，仅做验证

**验收标准**:
- [x] `npm run compile` 零错误
- [x] VSIX 打包成功（`claude-code-chatui-3.1.8.vsix`，470.98 KB）
- [x] 产物文件存在且大小合理

---

## ✅ 验收检查点 3：最终验收（Task 6-7 完成后暂停）

全部任务完成后，最终验收：
- [x] 进程竞态条件已修复
- [x] 全量编译通过（零错误）
- [x] VSIX 打包成功（`claude-code-chatui-3.1.8.vsix`）
- [x] 额外清理：Task 5 补全删除了孤立死代码文件（StateManager、EventHandlers、formatters 等）

**✅ 本次更新已全部完成。**
