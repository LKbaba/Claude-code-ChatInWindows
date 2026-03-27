# 插件系统安全修复与代码清理 - 产品需求文档 (v1)

## 1. 概述

### 1.1 背景
Claude-Code ChatUI for Windows 插件当前版本 v3.1.8，经过全面代码审计发现以下问题：
- 安全隐患：Shell 注入风险、API Key 明文存储
- 死代码堆积：6,090 行未生效的 CSS 模块、三重定义的函数
- 潜在稳定性问题：进程启动竞态条件

这些问题虽然在日常手动使用中不易触发，但影响代码质量和安全合规，尤其是面向 Marketplace 公开发布的场景。

### 1.2 目标
- **安全止血**：消除已知的注入风险和凭据暴露问题
- **代码瘦身**：清除死代码，减少维护负担
- **稳定性加固**：修复进程管理竞态条件

### 1.3 目标用户
- 使用自定义 API 端点的用户（API Key 安全）
- 所有用户（代码质量、稳定性）
- 插件维护者/开发者（代码可维护性）

### 1.4 范围界定
本版本 **仅处理** 已确认需要修复的问题，不涉及架构重构（如前端框架迁移、ClaudeChatProvider 拆分等），这些留待后续版本。

---

## 2. 功能需求

### 2.1 功能 A：修复 Shell 注入风险

- **描述**：`BackupManager.ts` 中所有 `exec()` 调用使用字符串拼接构造 Shell 命令，用户聊天输入直接嵌入 `git commit -m` 参数，存在命令注入风险。
- **当前问题代码**：`src/managers/BackupManager.ts:133-135`
  ```typescript
  const commitCmd = `git --git-dir="${this._backupRepoPath}" --work-tree="${workspacePath}" commit -m "${actualMessage}"`;
  await exec(commitCmd);
  ```
- **修复方案**：将所有 `exec()` 字符串拼接改为 `execFile()` + args 数组形式，避免 Shell 解释
- **验收标准**：
  - [x] `BackupManager.ts` 中不再有任何 `exec(字符串模板)` 调用
  - [x] 所有 Git 操作改用 `execFile('git', [...args])` 形式
  - [x] 用户消息含特殊字符（`"`, `` ` ``, `$()`, `&&`）时不会导致命令注入
  - [x] 正常备份/恢复功能不受影响（现有日志行为保持一致）

### 2.2 功能 B：API Key 迁移到加密存储

- **描述**：自定义 API 端点的 key（`claudeCodeChatUI.api.key`）当前存储在 `settings.json` 明文中，而 Gemini key 已正确使用 `SecretStorage`（OS 钥匙链加密）。需要统一标准。
- **当前问题代码**：`src/managers/config/ApiConfigManager.ts:52-54`
  ```typescript
  await config.update('api.key', apiKey, vscode.ConfigurationTarget.Global);
  ```
- **修复方案**：
  1. 将 Anthropic API key 存储迁移到 `vscode.SecretStorage`
  2. 泛化 `SecretService`，支持存储多种 API key（不再仅限 Gemini）
  3. 保留 `settings.json` 中的 `api.key` 配置项作为向后兼容（首次读取时自动迁移到 SecretStorage，迁移后清空 settings 中的明文值）
- **涉及文件**：
  - `src/services/SecretService.ts` — 新增通用 key 存取方法
  - `src/managers/config/ApiConfigManager.ts` — 改用 SecretService
  - `src/providers/ClaudeChatProvider.ts` — 适配新的 key 读取流程
- **验收标准**：
  - [x] API key 存储在 OS 钥匙链中（Windows: Credential Manager）
  - [x] `settings.json` 中不再出现明文 API key
  - [x] 已有用户的 key 自动迁移（首次启动时从 settings 读取 → 存入 SecretStorage → 清空 settings）
  - [x] Settings UI 中的 API key 输入功能正常

### 2.3 功能 C：消除 `escapeHtml` 三重定义

- **描述**：`ui-script.ts` 中 `escapeHtml` 函数定义了 3 次（line 122, 667, 5894），JavaScript 函数提升导致只有最后一个生效，前两个是死代码。
- **修复方案**：保留一个规范的定义（推荐 DOM 版，line 667 的实现），删除其余两个
- **验收标准**：
  - [x] `ui-script.ts` 中只有一个 `escapeHtml` 函数定义
  - [x] 定义放在文件靠前位置，所有调用点均可访问
  - [x] 现有的 HTML 转义行为不变

### 2.4 功能 D：清除未生效的 CSS 模块代码

- **描述**：`src/ui-v2/styles/` 目录下 14 个文件共 6,090 行 CSS 模块代码在运行时从未被调用。`index.ts` 中 `import { getCombinedStyles }` 后从未使用。实际渲染走的是 `getStylesOld()` 内联路径。
- **修复方案**：
  1. 删除 `src/ui-v2/styles/` 整个目录
  2. 删除 `src/ui-v2/index.ts` 中对 `getCombinedStyles` 的 import
  3. 同时清理 `index.ts` 中其他未使用的 import（`StateManager`, `EventHandlers`, `parseMarkdown`, `VscodeApi` 等，需逐一确认）
- **验收标准**：
  - [x] `src/ui-v2/styles/` 目录已删除
  - [x] 编译（`npm run compile`）无错误
  - [x] 插件 UI 外观与删除前完全一致（因为这些代码本来就没生效）
  - [x] 无未使用的 import 残留（含 StateManager、EventHandlers 等孤立文件一并清除）

### 2.5 功能 E：修复进程启动竞态条件

- **描述**：`ClaudeProcessService.ts:startProcess()` 中，`if (this._currentProcess)` 检查与 `this._currentProcess = cp.spawn(...)` 赋值之间存在 `await` gap，理论上可导致双进程孤儿泄漏。
- **当前问题代码**：`src/services/ClaudeProcessService.ts:66-92`
- **修复方案**：在 `startProcess` 方法入口处增加 `_isStarting` 互斥标志位
  ```typescript
  private _isStarting = false;

  public async startProcess(...) {
      if (this._currentProcess || this._isStarting) {
          throw new Error('A Claude process is already running');
      }
      this._isStarting = true;
      try {
          // ... existing logic ...
          this._currentProcess = cp.spawn(...);
      } finally {
          this._isStarting = false;
      }
  }
  ```
- **验收标准**：
  - [x] 新增 `_isStarting` 私有字段
  - [x] `startProcess` 入口同时检查 `_currentProcess` 和 `_isStarting`
  - [x] `finally` 块确保标志位在异常时也能重置
  - [x] 正常发送消息流程不受影响

---

## 3. 不在本版本范围内（记录备查）

以下问题已识别但**不纳入本次修复**：

| 问题 | 原因 |
|------|------|
| Markdown 代码块渲染 | 用户未遇到实际问题，待定观察 |
| 类型系统 `selectedModel` 对齐 | 功能正常，仅代码质量问题，记录即可 |
| `ClaudeChatProvider` 拆分（3,240 行） | 架构重构，需单独版本规划 |
| 前端框架迁移（esbuild/Vite + React） | 重大架构变更，需单独版本规划 |
| CSP nonce 安全加固 | 依赖前端构建管道改造，随框架迁移一起做 |
| Windows 路径发现补全（WinGet/Scoop） | 功能增强，非修复，后续版本 |
| 测试基础设施搭建 | 需要独立规划，后续版本 |

---

## 4. 技术要求

### 4.1 技术栈（不变）
- VS Code Extension API (^1.94.0)
- TypeScript 5.8
- Node.js child_process API

### 4.2 兼容性要求
- 向后兼容：已有用户的 API key 需自动迁移，不能丢失
- 功能回归：所有现有功能行为不变

### 4.3 编码规范
- 代码注释使用英文
- 交流使用中文

---

## 5. 验收检查点

### 检查点 1：安全修复验收（功能 A + B 完成后）
- [x] BackupManager 无 Shell 注入风险
- [x] API Key 已迁移到加密存储
- [x] 已有用户 key 自动迁移逻辑验证通过

### 检查点 2：代码清理验收（功能 C + D 完成后）
- [x] escapeHtml 仅一处定义
- [x] 死代码 CSS 模块已删除（含孤立服务/类型文件）
- [x] `npm run compile` 编译通过
- [x] UI 外观无变化

### 检查点 3：稳定性修复 + 最终验收（功能 E 完成后）
- [x] 进程竞态条件已修复
- [x] 全量功能回归测试通过
- [x] 打包 VSIX 成功（`claude-code-chatui-3.1.8.vsix`）
