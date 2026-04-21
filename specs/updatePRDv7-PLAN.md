# updatePRDv7 — Gemini-mcp v2.0 SDK 迁移开发计划

## 概述

基于 `specs/updatePRDv7.md` Part II 的 v2.0 SDK 迁移 PRD 制定。本 PLAN 覆盖从 v1 回归验证到 v2.0 发布的完整实施路径。

**相关文档**：
- PRD：`specs/updatePRDv7.md`
- 目标仓库：`E:/Github/Gemini-mcp/`
- 参考实现 A：`E:/Github/Grok-mcp/src/index.ts`（同作者 SDK 版 MCP）
- 参考实现 B：`E:/Github/Claude-code-ChatInWindows/reference/gemini-mcp/`（RLabs-Inc）
- 回归脚本：`scripts/probe-mcp-initialized.mjs`、`scripts/test-gemini-adc.mjs`

**技术栈**：TypeScript 5.x、`@modelcontextprotocol/sdk@^1.22.0`、`zod`、`@google/genai`

**总任务数**：10 个（含 1 个用户操作前置项）
**预计总时间**：~5.3 小时（不含前置回归与用户手动验收等待）

**版本路径**：`v1.5.1`（当前 notification 修复版）→ `v2.0.0`（SDK 迁移版，major bump）

---

## 前置条件（Precondition — 非 AI 任务）

### P0: v1 回归测试通过

**状态**：[ ]
**执行者**：**用户**（本 PRD 第 14 节明确规定 v1 回归通过前不得启动 Part II）

**操作**：
1. 完全关闭所有 `claude` CLI 会话，新开一个会话询问"列举你可用的 MCP 工具"，确认 `mcp__gemini-assistant__*` 5 个工具出现
2. 完全关闭 VS Code 的 Claude Code Chat 面板，重开后发起调用 `gemini_search`，确认无 `MCP error -32000: Connection closed`
3. 重跑 `node scripts/test-gemini-adc.mjs`，确认返回正常 Gemini 响应

**如未通过**：停止 Part II，回到 Part I 继续挖问题根因。
**如通过**：推进至 Task 1。

---

## 任务列表

### Task 1: 分支初始化 + SDK 依赖接入
**预计时间**: 0.3 小时
**依赖**: P0 通过
**关联需求**: PRD 第 11 节 P1
**状态**: [ ]

**上下文摘要**:
> v1.5.1 notification 修复已稳定。现在需要在独立分支上引入官方 SDK 依赖，同时确保主干分支不被污染、v1 仍可随时回滚。

**AI 提示词**:

你是一位资深 Node.js / TypeScript 后端工程师，精通 npm 依赖管理、Git 分支策略和 MCP 生态。

请帮我在 `E:/Github/Gemini-mcp/` 仓库中完成 v2.0 迁移的环境准备工作。

## 背景
仓库当前在 `main` 分支、版本 `v1.5.1`（含 notification 修复）。准备重写为官方 SDK 实现，发布 `v2.0.0`。

## 需求
1. 确认当前工作区干净（`git status` 无未提交改动），若有改动先提示我处理
2. 为 `v1.5.1` 打 tag：`git tag v1.5.1`（若尚未打）
3. 从 `main` 切出 `v2-migration` 分支
4. 安装依赖：
   - `@modelcontextprotocol/sdk@^1.22.0`（与 `reference/gemini-mcp` 一致，保守版本选择）
   - `zod`（运行时 schema 校验，SDK 推荐搭配）
5. 验证 `npm run build` 当前仍能通过（此时代码未改，只是多了依赖）
6. 在 `package.json` 里预置 `"version": "2.0.0-alpha.1"` 用于迁移期间发版隔离

## 技术要求
- 所有改动只能在 `v2-migration` 分支
- `package.json` 的 `engines.node` 保持原值
- 不得删除现有任何 dependency（例如 `@google/genai`、`undici`）

## 约束条件
- 不要动业务代码
- 不要 `npm audit fix --force`
- 不要执行 `git push`（本地完成即可，发布阶段才 push）

## 验收
- [ ] 当前分支为 `v2-migration`
- [ ] `package.json` 中存在 `@modelcontextprotocol/sdk` 和 `zod`
- [ ] `npm run build` 无错误
- [ ] `git tag` 列表中包含 `v1.5.1`

---

### Task 2: SDK 骨架替换 `server.ts`（最简握手版）
**预计时间**: 1 小时
**依赖**: Task 1
**关联需求**: PRD 第 11 节 P2
**状态**: [ ]

**上下文摘要**:
> 用官方 SDK 重写入口文件，先跑通最小握手——`initialize` + `notifications/initialized` + `tools/list`（暂时返回空列表）。这一步的目标是证明"协议层已彻底重构"，而不是工具可用。

**AI 提示词**:

ultrathink
use context7

你是一位资深 TypeScript 架构师，精通 MCP 协议、`@modelcontextprotocol/sdk` 的 `Server` + `StdioServerTransport` 架构，以及 JSON-RPC 2.0 规范细节。

请帮我用官方 SDK 重写 `E:/Github/Gemini-mcp/src/server.ts`，建立最小可运行骨架。

## 背景
v1 `server.ts` 手写 `readline` + `switch` 路由，违反 JSON-RPC notification 规范。v2 改用官方 SDK，协议层完全托管给 SDK。

## 需求
重写 `src/server.ts`，保留以下原有逻辑：
1. `setupProxy()` 函数及其在启动前的调用（代理配置必须在任何 HTTP 初始化之前）
2. `unhandledRejection` 全局捕获
3. 启动 banner 日志（`console.error` 打印 server 名称、版本、auth mode）
4. SIGINT / SIGTERM 优雅退出

删除以下内容：
- `readline.createInterface` + `rl.on('line')`
- 自写的 `sendResponse` / `sendError` / `handleRequest`
- `MCPRequest` / `MCPResponse` 等手写协议类型（改用 SDK 类型）
- `isInitialized` 全局状态（SDK 内部管理）

新骨架关键结构：
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

// Existing setupProxy(), SERVER_INFO imports kept intact
const server = new Server(
  { name: SERVER_INFO.name, version: SERVER_INFO.version },
  { capabilities: { tools: {} } }
);

// Placeholder: return empty list for now — tools added in Task 3+
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));

server.setRequestHandler(CallToolRequestSchema, async () => {
  throw new McpError(ErrorCode.MethodNotFound, 'Tools not yet migrated');
});

await setupProxy();
const transport = new StdioServerTransport();
await server.connect(transport);
```

## 技术要求
- 文件：`src/server.ts`（完全重写）
- 继续保留 `#!/usr/bin/env node` shebang
- TypeScript strict 模式要能通过（参考 `tsconfig.json`）
- 保留对 `src/config/constants.ts` 中 `SERVER_INFO` 的引用

## 约束条件
- 暂不迁移任何工具处理器（Task 3 开始）
- 暂不删除 `src/tools/*.ts` 业务代码，只删/改协议层
- `src/types.ts` 可暂时保留（下一 Task 再精简）
- `src/utils/error-handler.ts`、`src/utils/gemini-factory.ts` 等业务工具**一行不改**

## 参考
- `E:/Github/Grok-mcp/src/index.ts` — 同作者 SDK 版骨架
- `E:/Github/Claude-code-ChatInWindows/reference/gemini-mcp/src/` — SDK 初始化最佳实践

如对 `@modelcontextprotocol/sdk` 具体 API 有疑问，先 `use context7` 查最新文档再写代码。

## 验收
- [ ] `npm run build` 无错误
- [ ] `node E:/Github/Claude-code-ChatInWindows/scripts/probe-mcp-initialized.mjs` 跑 Gemini-mcp 部分：`notifications/initialized` 静默、`tools/list` 返回空数组、**无孤儿响应**
- [ ] 启动日志正常输出
- [ ] 服务进程在 stdin 关闭后干净退出

---

## 🏁 验收检查点 1：协议层重构完成

Task 1-2 完成后，用户验收：

- [ ] `probe-mcp-initialized.mjs` Gemini-mcp 行为与 Grok-mcp 完全一致（2 条 stdout 消息，无多余）
- [ ] 当前 TypeScript 构建无错
- [ ] 用户确认"骨架可以接工具了"

**通过后才进入 Task 3。**

---

### Task 3: 迁移 `gemini_search`（首个工具，打通端到端）
**预计时间**: 1.5 小时
**依赖**: Task 2 + 验收检查点 1 通过
**关联需求**: PRD 第 10.1 节 + 第 11 节 P3
**状态**: [ ]

**上下文摘要**:
> 选最简单的工具打通"SDK 注册 → Zod 校验 → 业务函数调用 → SDK 包装返回"的全链路。成功后剩余 4 个工具是复制粘贴级改造。

**AI 提示词**:

ultrathink
use context7

你是一位精通 MCP SDK + Zod 的 TypeScript 工程师，擅长把手写 JSON Schema 翻译为类型安全的 Zod schema，并用 SDK 的 `registerTool` / `setRequestHandler` 机制接入业务逻辑。

请帮我把 `gemini_search` 工具从 v1 手写定义迁移到 SDK 风格。

## 背景
- Task 2 骨架已跑通，`tools/list` 当前返回空数组
- `src/tools/search.ts` 的 `handleSearch` 业务函数**不要动**（输入参数、Gemini API 调用、返回格式都复用）
- 业务函数签名（可参考 v1 源码）：`handleSearch(args: any, geminiAI: GoogleGenAI): Promise<string>`
- v1 工具定义在 `src/tools/definitions.ts` 的 `TOOL_DEFINITIONS` 数组中（JSON schema 格式）

## 需求
1. 新建 `src/tools/search.schema.ts`，把 v1 `gemini_search` 的 JSON schema 重写为 Zod schema（字段、默认值、必填、枚举值全部对齐）
2. 在 `src/server.ts` 中：
   - 注册 `ListToolsRequestSchema` handler，返回包含 `gemini_search` 的工具数组（name / description / inputSchema 用 `zodToJsonSchema` 转换或 SDK 原生方式）
   - 注册 `CallToolRequestSchema` handler，`switch(name)` 路由到 `handleSearch`
   - 保留 v1 的 Gemini 客户端懒初始化逻辑（`detectAuthConfig()` + `createGeminiAI()` 在第一次 `tools/call` 时初始化，避免启动时就要求凭证）
3. 错误处理改用 SDK 的 `McpError`，映射 v1 的错误分类：
   - `ValidationError` → `ErrorCode.InvalidParams`
   - `APIError` → `ErrorCode.InternalError`（带原始 message）
   - 未知工具 → `ErrorCode.MethodNotFound`

## 技术要求
- 新文件：`src/tools/search.schema.ts`
- 修改：`src/server.ts`
- 保持输出格式一致：`CallToolRequestSchema` handler 返回 `{ content: [{ type: 'text', text: string }] }`
- Zod schema 必须能反映所有 v1 字段的可选/必填语义

## 约束条件
- `src/tools/search.ts`（业务实现）**一行不改**
- `src/utils/gemini-factory.ts`、`src/utils/gemini-client.ts` 不改
- 其他 4 个工具（`multimodal_query` 等）本 Task 不处理，`tools/list` 只返回 `gemini_search`

## 参考
- v1 工具 JSON schema：`src/tools/definitions.ts`
- Grok-mcp 工具注册示例：`E:/Github/Grok-mcp/src/index.ts`
- RLabs-Inc Zod 写法：`E:/Github/Claude-code-ChatInWindows/reference/gemini-mcp/src/tools/`

如 `@modelcontextprotocol/sdk` 的 `setRequestHandler` 返回格式或 Zod→JSON Schema 转换方式有疑问，`use context7` 查证。

## 验收
- [ ] `npm run build` 无错误
- [ ] `node scripts/test-gemini-adc.mjs` 成功返回 `modelUsed: gemini-3-flash-preview` 与 `2 + 2 = 4` 类响应
- [ ] `probe-mcp-initialized.mjs` 的 `tools/list` 现在能看到 1 个工具
- [ ] 对 `gemini_search` 传空参数应收到 `InvalidParams` 错误（Zod 校验生效）

---

## 🏁 验收检查点 2：端到端链路打通

Task 3 完成后，用户验收：

- [ ] `test-gemini-adc.mjs` 正常返回
- [ ] ADC 认证行为与 v1 等价
- [ ] 用户确认"首个工具形态 OK，可以复制到其他 4 个"

**通过后才进入 Task 4。**

---

### Task 4: 迁移 `gemini_multimodal_query`
**预计时间**: 0.4 小时
**依赖**: Task 3 + 验收检查点 2 通过
**关联需求**: PRD 第 10.1 节 + 第 11 节 P4
**状态**: [ ]

**上下文摘要**:
> 按 Task 3 建立的模式，批量复制。这是 5 个工具中唯一支持多模态输入（图片 base64）的，需特别注意 Zod schema 对 `Array<{ mimeType, data }>` 的描述准确性。

**AI 提示词**:

你是一位精通 Zod schema 设计的 TypeScript 工程师，熟悉多模态数据（图像 base64、MIME 类型）的类型建模。

请按 Task 3 建立的模式迁移 `gemini_multimodal_query` 工具。

## 背景
- `src/tools/multimodal-query.ts` 的 `handleMultimodalQuery` 业务函数保留
- v1 工具支持文本 + 图片数组输入（`images: [{ mimeType, data }]`）

## 需求
1. 新建 `src/tools/multimodal-query.schema.ts` — Zod 版 schema
2. 在 `src/server.ts` 的 tools 数组和 `CallToolRequestSchema` switch 中注册 `gemini_multimodal_query`
3. 特别关注：图片数组为可选，但若提供则每个元素的 `mimeType` 和 `data` 必填

## 技术要求
- 文件模式与 Task 3 对齐（`*.schema.ts` 导出 Zod schema）
- `images[].mimeType` 应约束为枚举（`image/png | image/jpeg | image/webp | image/gif`，参考 v1 定义）
- `data` 字段用 `z.string().base64()` 或 `z.string().regex(...)` 校验

## 约束条件
- `src/tools/multimodal-query.ts` 不改
- 已迁移的 `gemini_search` 注册不能破坏

## 参考
- v1 定义：`src/tools/definitions.ts` 中 `gemini_multimodal_query` 条目
- Task 3 刚建立的 `search.schema.ts` 模式

## 验收
- [ ] `npm run build` 无错误
- [ ] `tools/list` 现在有 2 个工具
- [ ] 手动发一个仅文本参数（无图片）的 `tools/call` 正常返回
- [ ] 传入非法 `mimeType` 收到 `InvalidParams` 错误

---

### Task 5: 迁移 `gemini_analyze_content`
**预计时间**: 0.3 小时
**依赖**: Task 4
**关联需求**: PRD 第 10.1 节 + 第 11 节 P4
**状态**: [ ]

**上下文摘要**:
> 同 Task 4 模式。内容分析工具，输入为字符串 + 可选分析维度枚举。

**AI 提示词**:

你是一位精通 Zod + MCP SDK 的 TypeScript 工程师。

请按 Task 3、4 的模式迁移 `gemini_analyze_content`。

## 需求
1. 新建 `src/tools/analyze-content.schema.ts`
2. 在 `server.ts` 注册
3. 保留 `src/tools/analyze-content.ts` 的业务函数调用

## 技术要求
- 复用前两个 Task 建立的代码模式
- 字段枚举值（如 analysis type）必须与 v1 JSON schema 完全一致

## 约束条件
- `src/tools/analyze-content.ts` 不改
- 不重构 `server.ts` 已有的 switch/注册逻辑，只追加分支

## 验收
- [ ] `npm run build` 无错误
- [ ] `tools/list` 有 3 个工具
- [ ] 用实际字符串调用一次，返回 Gemini 响应

---

### Task 6: 迁移 `gemini_analyze_codebase`
**预计时间**: 0.3 小时
**依赖**: Task 5
**关联需求**: PRD 第 10.1 节 + 第 11 节 P4
**状态**: [ ]

**上下文摘要**:
> 同模式。该工具输入包含路径（本地文件系统）+ 分析 prompt，需保留 v1 的路径处理逻辑（由业务函数完成，此 Task 不涉及）。

**AI 提示词**:

你是一位精通 Zod + MCP SDK 的 TypeScript 工程师。

请按既定模式迁移 `gemini_analyze_codebase`。

## 需求
1. 新建 `src/tools/analyze-codebase.schema.ts`
2. 在 `server.ts` 注册
3. 保留 `src/tools/analyze-codebase.ts` 的业务函数（含路径读取、glob 过滤等）

## 技术要求
- 路径字段用 `z.string().min(1)`，不要加 `.url()` 等不适用校验
- 可选字段（include/exclude patterns、maxFiles 等）都用 `.optional()` 明确标注

## 约束条件
- 业务文件不改
- 保持与已迁移工具的风格统一

## 验收
- [ ] `npm run build` 无错误
- [ ] `tools/list` 有 4 个工具
- [ ] 对本地目录调用一次，能读到文件并返回 Gemini 响应

---

### Task 7: 迁移 `gemini_brainstorm`
**预计时间**: 0.3 小时
**依赖**: Task 6
**关联需求**: PRD 第 10.1 节 + 第 11 节 P4
**状态**: [ ]

**上下文摘要**:
> 最后一个工具。完成后所有 5 个工具迁移完毕。

**AI 提示词**:

你是一位精通 Zod + MCP SDK 的 TypeScript 工程师。

请按既定模式迁移 `gemini_brainstorm`，这是 5 个工具中的最后一个。

## 需求
1. 新建 `src/tools/brainstorm.schema.ts`
2. 在 `server.ts` 注册
3. 保留 `src/tools/brainstorm.ts` 的业务函数

## 技术要求
- 字段语义、默认值与 v1 JSON schema 一致

## 约束条件
- 本 Task 结束后，`src/server.ts` 应包含全部 5 个工具的注册，`src/tools/definitions.ts` 可以删除（由每个 `*.schema.ts` 取代）
- `src/tools/index.ts` 如仅 re-export 业务函数可保留，如有任何路由相关导出应清理

## 验收
- [ ] `npm run build` 无错误
- [ ] `tools/list` 返回 5 个工具
- [ ] 每个工具名与 v1 完全一致（`gemini_search`、`gemini_multimodal_query`、`gemini_analyze_content`、`gemini_analyze_codebase`、`gemini_brainstorm`）
- [ ] `src/tools/definitions.ts` 已删除或仅保留注释说明

---

## 🏁 验收检查点 3：5 工具全部迁移

Task 3-7 完成后，用户验收：

- [ ] `tools/list` 5 个工具齐全，schema 正确
- [ ] 至少抽查 3 个工具各调用一次，行为与 v1 一致
- [ ] 无残留的 v1 协议层代码（grep 不到 `sendResponse`、`sendError`、`handleRequest`、`MCPRequest` 等）

**通过后才进入 Task 8。**

---

### Task 8: 业务层对齐 + 代码精简 + 全量回归
**预计时间**: 0.5 小时
**依赖**: Task 7 + 验收检查点 3 通过
**关联需求**: PRD 第 11 节 P5 + 第 12 节验收标准 1-4、6、7
**状态**: [ ]

**上下文摘要**:
> 最后一公里：清理无用代码、跑全量回归、对齐文档、验证三种认证模式。

**AI 提示词**:

ultrathink

你是一位资深 QA 工程师兼架构师，擅长代码审查、回归测试设计和版本发布前的全面质量把关。

请帮我完成 v2.0 迁移的收尾质量工作。

## 背景
Task 1-7 已完成 SDK 迁移核心工作。现在需要：清理死代码、跑完整测试、确认 PRD 第 12 节的 7 条 Go/No-Go 标准全部满足。

## 需求

### 1. 代码清理
- 确认并删除 `src/types.ts` 中所有已被 SDK 取代的协议类型（`MCPRequest`、`MCPResponse`、`InitializeResult` 等）；若文件变空则删除整个文件，并清理所有 import
- 检查 `src/config/constants.ts` 中 `ERROR_CODES`、`MCP_VERSION`、`TOOL_NAMES` 是否还有引用，无引用则删除
- 确认 `src/tools/index.ts` 只导出业务 handler，不含协议逻辑
- 比对 v1.5.1 `src/server.ts` + `src/types.ts` 总行数 vs v2 对应文件行数，**验证 ≤ 70%**（PRD 成功标准 #6）

### 2. 三认证模式回归
依次测试：
- **API Key 模式**：`GEMINI_API_KEY=xxx node dist/server.js`
- **Vertex JSON 模式**：`GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node dist/server.js`
- **ADC 模式**：`GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT=lk-sandbox-2026 node dist/server.js`

每个模式用 `scripts/test-gemini-adc.mjs`（视情况修改 env）调用 `gemini_search` 一次，确认返回正常。

### 3. Session A / B 回归
- Session A：更新 `~/.claude.json` 中 `gemini-assistant` 指向新的 `dist/server.js`，重启 `claude` CLI，列出 MCP 工具，确认 5 个都在
- Session B：在 VS Code 的 Claude Code Chat 插件中调用 `gemini_search`，确认无 `Connection closed`

### 4. 文档更新
- 在 `E:/Github/Gemini-mcp/CHANGELOG.md` 开头新增 `## [2.0.0] - 2026-04-XX` 段，说明：
  - BREAKING: 架构重写，从手写 JSON-RPC 迁移至官方 SDK
  - 对外 API（工具名、参数、返回）保持兼容
  - 修复 notification 规范违规（继承自 v1.5.1）
  - 代码量减少约 40%
- `package.json` 版本改为 `2.0.0`（去掉 alpha 后缀）

## 技术要求
- 清理原则：**只删明确未被引用的代码**，不要为了精简破坏可读性
- 回归脚本如需新建（如 `test-gemini-apikey.mjs`、`test-gemini-vertex-json.mjs`）放在 `E:/Github/Claude-code-ChatInWindows/scripts/`

## 约束条件
- 不要提前发布到 npm（Task 9 处理）
- 不要 `git push`
- 不要改业务函数语义

## 验收（对应 PRD 第 12 节 Go/No-Go 标准）
- [ ] #1 `probe-mcp-initialized.mjs` 通过
- [ ] #2 `test-gemini-adc.mjs` ADC 模式通过
- [ ] #3 5 个工具全部手动验证
- [ ] #4 Claude CLI 独立 session 工具可见
- [ ] #5 VS Code 插件内工具可调用
- [ ] #6 `src/server.ts` + `src/types.ts` 总行数 ≤ v1.5.1 的 70%
- [ ] #7 三种认证模式全部验证通过

---

### Task 9: 合并 `main` + 发布 `v2.0.0`
**预计时间**: 0.5 小时
**依赖**: Task 8 + 验收检查点 4 通过
**关联需求**: PRD 第 11 节 P6 + 第 16 节后续产出
**状态**: [ ]

**上下文摘要**:
> 最终发布动作。涉及 `git push`、npm publish 等**不可逆外部副作用**，必须在验收检查点 4 通过后才能执行。

**AI 提示词**:

你是一位资深发布工程师，精通 Git 工作流、语义化版本和 npm 发布安全实践。

请帮我完成 Gemini-mcp v2.0.0 的发布流程。

## 背景
验收检查点 4 已通过，所有质量门禁满足 PRD 第 12 节的 7 条标准。

## 需求

### 1. 合并与打 tag
- 确认 `v2-migration` 分支的测试已全通过
- 切回 `main`，合并 `v2-migration`（建议 `--no-ff` 保留分支历史）
- 打 tag：`git tag -a v2.0.0 -m "Migrate to official MCP SDK"`
- **等我人工确认后**再 `git push origin main --tags`

### 2. npm 发布
- 如果 Gemini-mcp 以前发过 npm（检查 `package.json` 的 `name` 和 `publishConfig`）：
  - 确认登录状态：`npm whoami`
  - 先 `npm publish --dry-run` 审查包内容（不得包含 `.env`、测试脚本等）
  - **等我人工确认后**再 `npm publish`
- 如果以前没发过，跳过这步，告诉我如何评估要不要发

### 3. 产出后续计划
按 PRD 第 16 节要求，在 `E:/Github/Gemini-mcp/` 创建：
- `CHANGELOG.md`（Task 8 已做更新，此处确认完整）
- `MIGRATION.md`（可选，如果没用户 fork 可跳过；如果要写，说明"API 完全兼容，仅需更新依赖"即可）

### 4. 最终状态报告
输出一份简报告：
- 当前 `main` 指向的 commit hash
- 发布的 tag / npm 版本
- 所有变更文件清单（相对 v1.5.1）
- 代码行数对比（v1 server.ts + types.ts 行数 vs v2）

## 技术要求
- 所有 `git push` / `npm publish` 命令**必须在执行前停下来等我确认**，不得自动执行
- 发布前再跑一次 `npm run build` 确保 `dist/` 是最新

## 约束条件
- 不要 `git push --force`
- 不要跳过任何 prepublish hook
- 如任一步失败，**立即停止**并报告状态，不要试图自动恢复

## 验收
- [ ] `main` 分支包含 v2.0.0 代码，tag 已在本地
- [ ] `CHANGELOG.md` v2.0.0 段落完整
- [ ] （如果要发 npm）`npm publish --dry-run` 输出的包内容已由我 review
- [ ] 最终状态报告产出

---

## 🏁 验收检查点 4：发布就绪（最终 Go/No-Go）

Task 8 完成后，用户最终验收。对照 PRD 第 12 节逐条打钩：

| # | 标准 | 状态 |
|---|---|---|
| 1 | `probe-mcp-initialized.mjs` 通过 | [ ] |
| 2 | `test-gemini-adc.mjs` 通过 | [ ] |
| 3 | 5 个工具全部手动验证 | [ ] |
| 4 | Claude CLI 独立 session 工具可见 | [ ] |
| 5 | VS Code 插件内工具可调用 | [ ] |
| 6 | 代码精简（server.ts + types.ts ≤ v1.5.1 70%）| [ ] |
| 7 | 三种认证模式向后兼容 | [ ] |

**全部通过后才进入 Task 9（发布）。任一失败需回到对应 Task 修复。**

---

## 整体验收检查点汇总

| 检查点 | 触发时机 | 关注重点 | 通过条件 |
|---|---|---|---|
| **检查点 0** | P0 前置条件 | v1 notification 修复是否真的解决两种症状 | Session A + B 都不再报错 |
| **检查点 1** | Task 2 完成 | 协议层骨架是否合规 | probe 脚本静默 + `tools/list` 空数组正常 |
| **检查点 2** | Task 3 完成 | SDK 迁移路径是否可行 | `test-gemini-adc.mjs` 走通 |
| **检查点 3** | Task 7 完成 | 所有工具迁移完整性 | 5 工具 + 协议层清理干净 |
| **检查点 4** | Task 8 完成 | PRD 全 7 条 Go/No-Go | 全部通过方可发布 |

---

## 风险与应对（摘自 PRD 第 13 节）

| 风险 | Task 阶段 | 早期信号 | 应对 |
|---|---|---|---|
| Zod schema 字段语义漂移 | Task 3-7 | 调用工具时 `InvalidParams` 非预期报错 | 在检查点 2 发现就立即停，修正 schema 模板再批量推进 |
| SDK 版本兼容问题 | Task 1-2 | TypeScript 编译或运行时导入错误 | 降回 `reference/gemini-mcp` 用的版本 |
| 认证路径差异 | Task 8 | 某个认证模式下 Gemini 调用 401/403 | 对比 v1.5.1 `gemini-factory.ts` 调用链，确认是否 SDK 改变了 env 处理时机 |
| 发布后用户报 break | Task 9 后 | GitHub issue / Slack 反馈 | 按 PRD 第 13.2 节回滚：`npm deprecate` + 指引用户回退 `1.5.1` |

---

## 任务状态总览

| Task | 标题 | 预计 | 状态 |
|---|---|---|---|
| P0 | v1 回归测试（用户操作） | — | [ ] |
| 1 | 分支初始化 + 依赖 | 0.3h | [ ] |
| 2 | SDK 骨架替换 server.ts | 1.0h | [ ] |
| 3 | 迁移 gemini_search | 1.5h | [ ] |
| 4 | 迁移 gemini_multimodal_query | 0.4h | [ ] |
| 5 | 迁移 gemini_analyze_content | 0.3h | [ ] |
| 6 | 迁移 gemini_analyze_codebase | 0.3h | [ ] |
| 7 | 迁移 gemini_brainstorm | 0.3h | [ ] |
| 8 | 业务层对齐 + 全量回归 | 0.5h | [ ] |
| 9 | 合并 main + 发布 v2.0.0 | 0.5h | [ ] |

**Task 1-9 合计**：~5.1 小时（与 PRD 第 11 节 5.3h 预估一致）

---

**文档生成时间**：2026-04-20
**对应 PRD**：`specs/updatePRDv7.md`（Part II 第 9-16 节）
**执行约束**：每到 🏁 验收检查点，Claude 停下等待用户确认"继续"后再进入下一阶段。
