# updatePRDv7 — Gemini-mcp 规范修复 + v2.0 SDK 迁移 PRD

> 版本：v1 诊断修复纪要 + v2 迁移 PRD | 创建日期：2026-04-20 | 更新：2026-04-21 | 状态：
>
> - **Part I**（v1 notification 修复）：✅ **回归通过**（Session B 实测 ADC 端到端成功，详见 §5.1）
> - **Part II**（v2 SDK 迁移）：**已决策采纳**，**可启动**，按 `updatePRDv7-PLAN.md` Task 1 推进
>
> ### 追加诊断（2026-04-21）
>
> P0 回归曾一度失败——**根因不是 notification 修复失效**，而是**插件侧 Gemini Integration 开关未勾选 + Auth Mode/Project ID 未配置**，导致 `McpConfigManager.injectGeminiCredentials()` 跳过 env 注入，子进程在 `detectAuthConfig()` 阶段报 `No authentication configured` 退出。勾选 Gemini 开关 + 选 ADC 模式 + 填入 `lk-sandbox-2026` 项目 ID 后，`[McpConfigManager] Injected Vertex AI ADC mode` 路径触发，子进程 stderr 出现 `Auth mode: vertex-ai (project: lk-sandbox-2026)` OK 标记，`gemini_search` 端到端返回 Gemini 3 响应。
>
> **结论**：长期困扰由 "Gemini-mcp 协议违规" + "插件 UI 配置未到位" 两个独立问题叠加造成，任一未解决都无法通过回归。两个都已解决。

## 1. 问题表述

### 1.1 两种症状（长期困扰用户）

| 场景 | 表现 |
|---|---|
| **Session A**：独立 `claude` CLI 会话 | `claude mcp list` 显示 `gemini-assistant: ✓ Connected`，但 session 内 Claude 看不到任何 `mcp__gemini-assistant__*` 工具 |
| **Session B**：Claude Code Chat 插件内会话 | 工具能被注入 deferred tools 列表，但实际调用任意 gemini 工具即刻报 `MCP error -32000: Connection closed` |
| **Grok-mcp**（对照） | 在两个场景下都完全正常 |

### 1.2 为什么这个问题让人困惑

- 本地直接 spawn Gemini-mcp 并完成完整 MCP 握手 → 完全正常（见 `scripts/test-gemini-adc.mjs`）
- `claude mcp list` 健康检查返回 `✓ Connected` → 看似一切就绪
- 两种失败模式不同（工具不注入 vs 调用时断连），让人误以为是两个独立问题
- 过去几个月用户多次排查，怀疑过 ADC 凭证、env 传递、`cmd /c` wrapper、临时文件路径——**都不是**

---

## 2. 根因

### 2.1 JSON-RPC 2.0 规范要点

MCP 协议底层使用 JSON-RPC 2.0。客户端→服务器消息有且仅有两类：

| 类型 | 是否含 `id` | 服务器是否可响应 |
|---|---|---|
| Request | 是 | **必须**响应（含错误响应）|
| Notification | 否 | **绝对不能**响应（包括错误） |

`notifications/initialized` 是 MCP 协议 `2024-11-05` 版本引入的**强制客户端行为**——客户端在完成 `initialize` 握手后，必须发送这条通知以告知服务器进入就绪阶段。由于是 notification，服务器看到它**只能静默处理**，不能回任何东西。

### 2.2 Gemini-mcp 的违规点

Gemini-mcp fork 自 `aliargun/mcp-server-gemini`，**未使用官方 `@modelcontextprotocol/sdk`**，而是手写 JSON-RPC 路由。原代码（修复前 `src/server.ts`）：

```typescript
// BEFORE — the bug
rl.on('line', async (line) => {
  const request: MCPRequest = JSON.parse(line);
  await handleRequest(request);  // notification also goes through here
});

async function handleRequest(request: MCPRequest): Promise<void> {
  switch (request.method) {
    case 'initialize': ...
    case 'tools/list': ...
    case 'tools/call': ...
    case 'ping': ...
    default:
      // notification hits this branch and triggers a spec violation
      sendError(request.id, ERROR_CODES.METHOD_NOT_FOUND, ...);
  }
}
```

当客户端发送 `notifications/initialized` 时，进入 switch 的 default 分支，调用 `sendError(request.id, ...)`——但 `request.id` 是 `undefined`（notification 本来就没 id），最终 stdout 吐出一条**无 id 的 error response**：

```json
{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found: notifications/initialized"}}
```

这是一个"**孤儿响应**"：没有对应的请求 id，客户端无法做 id 匹配。

### 2.3 Grok-mcp 为什么没问题

Grok-mcp 源码里**完全没有**"notification"相关代码，因为它使用官方 SDK：

```typescript
// Grok-mcp: relies on the official MCP SDK
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(...);
server.setRequestHandler(ListToolsRequestSchema, ...);
server.setRequestHandler(CallToolRequestSchema, ...);
// The SDK internally handles notifications correctly (silent drop).
```

官方 SDK 内部对 notification 的处理严格遵循规范——**不会**写出任何响应。所以 Grok-mcp 天然免疫这个 bug。

### 2.4 为什么以前能用、现在不行

三个因素叠加，让 bug **长期潜伏、最近暴露**：

| 因素 | 说明 |
|---|---|
| A. 协议版本演化 | `notifications/initialized` 是 `2024-11-05` 协议版本引入的强制要求；更早版本里客户端不发此通知，bug 无法触发 |
| B. Claude CLI 严格化（推测） | 早期 CLI 版本对"孤儿响应"可能是宽容丢弃；近期版本（如 `v2.1.112`）对 JSON-RPC 合规性检查更严，收到孤儿响应会判定 server 异常，不同代码路径产生不同降级行为 |
| C. 上游就有此 bug | 上游 `aliargun/mcp-server-gemini` 在 commit `7f53096`（"Add missing protocol requirements: notifications..."）中**声称**实现了 notification 支持，但实际只加了 request 侧的 ping 等方法，notification 静默处理一直缺失 |

---

## 3. 证据链

### 3.1 对照实验

`scripts/probe-mcp-initialized.mjs`：spawn 两个 MCP server，发完整 `initialize` → `notifications/initialized` → `tools/list` 序列，抓 stdout 全部消息。

**修复前**：

| Server | stdout 消息数 | `notifications/initialized` 的响应 |
|---|---|---|
| Grok-mcp v2.0.1 | 2（仅 `initialize` 和 `tools/list` 响应）| ✅ 无（规范行为） |
| Gemini-mcp v1.5.0 | 3（多出一条无 id 的 `-32601 error`）| ❌ 返回 error |

**修复后**：

| Server | stdout 消息数 | 响应 |
|---|---|---|
| Grok-mcp v2.0.1 | 2 | ✅ 静默 |
| Gemini-mcp v1.5.0 | **2**（已修复） | ✅ 静默 |

### 3.2 源码证据

- Gemini-mcp：`src/server.ts` 手写 `rl.on('line')` + `switch` + `handleRequest`，无 notification 特判
- Grok-mcp：`src/index.ts` 使用 `@modelcontextprotocol/sdk` 的 `Server` + `setRequestHandler`，notification 由 SDK 处理

### 3.3 关键 git commit

```
Gemini-mcp 上游（aliargun）：
  7f53096 2024-12-15  Add missing protocol requirements: notifications, lifecycle ...
  ^^^ commit 标题声称处理 notification，实际未做 notification 静默

你（LKbaba）的 fork 历史：
  521254b  fix(vertex-ai): remove conflicting API key env vars ...
  a31323c  feat(v1.4.0): Vertex AI dual-mode authentication
  38df5d1  refactor: Convert all Chinese comments to English
  75d37c4  feat(v1.2.0): 精简工具集并新增模型选择功能
  (从 fork 开始 bug 一直存在)
```

---

## 4. 修复纪要

### 4.1 修改文件清单

| 文件 | 改动 |
|---|---|
| `e:\Github\Gemini-mcp\src\server.ts` | `handleRequest` 开头新增 notification 守卫（约 14 行） |
| `e:\Github\Gemini-mcp\dist\server.js` | 重新 `npm run build` 产出 |

### 4.2 改动内容

**位置**：`src/server.ts` 的 `handleRequest` 函数顶部

```typescript
async function handleRequest(request: MCPRequest): Promise<void> {
  // A missing `id` means this is a notification. Handle known ones
  // silently and drop unknown ones without replying.
  const isNotification = request.id === undefined || request.id === null;

  if (isNotification) {
    // `notifications/initialized` is the standard client-side signal that the
    // initialization phase is complete. We don't need any per-client state, so
    // just acknowledge internally and stay silent on the wire.
    if (request.method === 'notifications/initialized') {
      return;
    }
    // Any other unknown notification: ignore, do not reply.
    return;
  }

  // ...original switch unchanged
}
```

**设计要点**：

- 用"**任何无 id 消息一律不回响应**"的通用策略兜底，不仅覆盖 `notifications/initialized`
- 未来 MCP 协议引入新 notification（`notifications/cancelled`、`notifications/progress` 等）不需再改
- 对有 id 的 request 处理**零影响**，原 switch 原封不动

### 4.3 未改动的项

- `src/types.ts` 的 `MCPRequest.id: string | number`（必填）**未改**——改为 optional 会级联影响多处，运行时用 `undefined` 检查已足够安全
- `rl.on('line')` 里的 parse 错误路径**未改**——malformed notification 是边缘情况，暂不处理
- `sendError` 函数本身**未改**——问题不在它，在调用位置

### 4.4 编译与产物验证

```bash
cd E:/Github/Gemini-mcp
npm run build            # tsc 无错误
```

验证产物包含修复：

```bash
grep -n "isNotification" dist/server.js
# 184:    const isNotification = request.id === undefined || request.id === null;
# 185:    if (isNotification) { ...
```

重跑 probe 脚本 → Gemini-mcp 已静默 ✅

---

## 5. 待验证项（回归测试 / Go-No-Go）

| 步骤 | 操作 | 期望结果 |
|---|---|---|
| **1. Session A 回归** | 完全关闭当前所有 `claude` CLI 会话，重启一个新会话，问"列举你可以使用的 MCP 工具" | 工具列表中出现 `mcp__gemini-assistant__gemini_search` 等 5 个工具 |
| **2. Session B 回归** | 完全关闭 VS Code 的 Claude Code Chat 面板，重新打开，让它调用 `gemini_search` | 正常返回 Gemini 响应（非 `Connection closed`） |
| **3. 直连控制组** | 重跑 `node scripts/test-gemini-adc.mjs` | 仍返回 `modelUsed: gemini-3-flash-preview` 的正常结果 |

**确信度评级**：

- 3. 直连控制组通过 → 说明 server 基础功能没坏（已验证 ✅）
- 1+2 任一通过 → 根因分析正确（bug 已定位）
- 1+2 都通过 → 根因分析 **100% 正确**，两种症状同根源
- 1+2 都不通过 → 根因有误，notification 违规只是"一个独立 bug"，不是用户困扰的主因，需继续挖

---

## 6. 长期建议（用户自行决定是否采纳）

### 6.1 短期：把修复推回你自己的 Gemini-mcp 仓库

- 提交 commit：`fix: stay silent on JSON-RPC notifications (spec compliance)`
- bump 版本到 `v1.5.1`
- 如果已发布到 npm，需 republish

### 6.2 中期：给上游 `aliargun/mcp-server-gemini` 提 PR

- 上游原项目也有此 bug，其他 fork 者同样受害
- PR 内容基本就是本次的 14 行改动 + probe 脚本作为回归测试

### 6.3 长期：Gemini-mcp 架构升级（重写为官方 SDK）→ **已决策采纳，详见第 9 节**

**收益**：

- 所有 JSON-RPC 协议细节由 SDK 托管，免疫未来协议演化
- 代码量预计减少 40%+（参考 Grok-mcp 的代码规模）
- 自动获得 SDK 的类型安全、错误处理、日志能力

**成本**：

- 预计 **1 天量级**的重写
- 工具实现逻辑（`tools/*.ts`）基本可复用，改动集中在 `server.ts` + `types.ts`
- 需要重新跑完整回归测试套件

**风险**：低——Grok-mcp 已经验证了这条路径可行

### 6.4 插件侧的防御性改动（可选）

插件可以主动加 MCP server 启动健康自检：

- 在 `McpConfigManager` spawn MCP server 后，发一个 `notifications/initialized`
- 如果 stdout 回了任何东西 → 日志告警"此 server 违反规范"
- 不阻断启动，只是把问题尽早暴露给用户/开发者

这是"保护自己"而非"修好别人"，优先级低。

---

## 7. 附录

### 7.1 关键文件引用

| 文件 | 作用 |
|---|---|
| `E:/Github/Gemini-mcp/src/server.ts` | 本次修复的源文件 |
| `E:/Github/Gemini-mcp/dist/server.js` | 编译产物，含修复 |
| `E:/Github/Grok-mcp/src/index.ts` | 对照组：使用官方 SDK 的参考实现 |
| `E:/Github/Claude-code-ChatInWindows/scripts/probe-mcp-initialized.mjs` | 对照 probe 脚本（本次新增） |
| `E:/Github/Claude-code-ChatInWindows/scripts/test-gemini-adc.mjs` | ADC 端到端健康测试脚本 |
| `C:/Users/CQDD/.claude.json` | Claude CLI 用户级 MCP 注册配置 |

### 7.2 验证命令速查

```bash
# Rerun the head-to-head probe
cd E:/Github/Claude-code-ChatInWindows
node scripts/probe-mcp-initialized.mjs

# Rerun the end-to-end ADC test against Gemini-mcp
node scripts/test-gemini-adc.mjs

# Rebuild Gemini-mcp
cd E:/Github/Gemini-mcp && npm run build

# Check Gemini-mcp CLI registration
claude mcp get gemini-assistant
```

### 7.3 bug 的传播链路（供归档）

```
aliargun/mcp-server-gemini (upstream, 2024)
  └─> 手写 JSON-RPC 路由，notification 默认走 error 分支
        ↓ fork
  LKbaba/Gemini-mcp (2025)
  └─> 继承 bug，ADC 双模式认证等新功能叠加其上
        ↓ install
  用户本地 `~/.claude.json` mcpServers.gemini-assistant
        ↓ spawn by
  Claude CLI v2.1.112（严格化的协议校验）
        ↓ symptom in
  Session A：tools 不注入 / Session B：Connection closed
```

---

## 8. 本次诊断用到的关键技术点（回顾）

1. **对照实验**：同一作者的两个 MCP（Grok vs Gemini）在相同测试下行为差异 → 定位到"实现方式"而非"外部环境"
2. **协议层 probe**：直接用 JSON-RPC 手工发消息、抓 stdout → 绕过所有客户端/插件层的混淆
3. **源码 + git 历史考古**：确认 bug 来自上游、并非近期引入
4. **最小改动修复**：14 行改动、零级联影响、未来新 notification 自动兼容

---

# Part II — v2.0 SDK 迁移 PRD

---

## 9. 迁移决策

### 9.1 结论

**采纳长期建议 6.3，全量迁移 Gemini-mcp 至官方 `@modelcontextprotocol/sdk`，发布 `v2.0.0`。**

- 决策日期：2026-04-20
- 决策方式：基于对"手写 vs SDK"的成本收益权衡（见 6.3）做出采纳

### 9.2 决策依据

1. **v1 notification bug 只是冰山一角** — 手写 JSON-RPC 路由意味着所有 MCP 协议演化都是持续技术债（未来 `notifications/cancelled`、`notifications/progress`、`resources/*`、`prompts/*` 等支持都要自己接）
2. **同作者项目技术栈统一** — Grok-mcp 已是 SDK 版本，Gemini-mcp 迁移后两项目维护模式一致
3. **有高质量参考实现** — `reference/gemini-mcp/`（RLabs-Inc）提供了 Gemini + SDK v1.22.0 的成熟实现
4. **可接受的一次性投入** — 预估 ~5 小时，换来长期协议自动跟进

---

## 10. 迁移范围

### 10.1 必须迁移（In Scope）

| 对象 | 改动类型 |
|---|---|
| `src/server.ts` | **完全重写**，用 `Server` + `StdioServerTransport` |
| `src/types.ts` | 精简（SDK 自带大部分协议类型） |
| 5 个工具输入 schema | 手写 JSON schema → Zod schema |
| `tools/definitions.ts` | 重构为 SDK 标准的 `registerTool` 调用 |
| 错误处理 | 统一用 SDK `McpError` 替代自定义 `sendError` |
| `package.json` | 新增 `@modelcontextprotocol/sdk@^1.22.0` 和 `zod` 依赖 |
| 版本号 | `v1.5.1` → `v2.0.0` |

5 个受影响工具：
- `gemini_multimodal_query`
- `gemini_analyze_content`
- `gemini_analyze_codebase`
- `gemini_brainstorm`
- `gemini_search`

### 10.2 保留不变（Preserve As-Is）

| 目录/文件 | 理由 |
|---|---|
| `src/tools/*.ts` 业务实现 | Gemini API 调用逻辑与协议层解耦 |
| `src/utils/gemini-factory.ts` | ADC 双模式认证逻辑完整复用 |
| `src/utils/gemini-client.ts` | Gemini SDK 封装无需改动 |
| `src/utils/error-handler.ts` | 业务错误分类逻辑复用 |
| `src/config/models.ts` | 模型配置（含 Gemini 3.1 Pro / Flash）复用 |
| `setupProxy()` | 代理配置逻辑复用 |
| 工具的输入参数、输出格式、业务行为 | 对外 API **完全兼容** |

### 10.3 不在范围（Out of Scope）

- ❌ 重命名/重构业务代码（本次只改协议层）
- ❌ 添加新工具
- ❌ 更换 `@google/genai` SDK 版本
- ❌ 改变 CLI 入口点（仍然 `dist/server.js`）
- ❌ 修改 npm 包名（继续 `@lkbaba/mcp-server-gemini`）

---

## 11. 阶段规划

| 阶段 | 任务 | 预估 | 交付物 |
|---|---|---|---|
| **P0** | v1 修复 push + bump `v1.5.1` | 已完成（待 push） | 稳定可用的 v1 |
| **P1** | 新建 `v2-migration` 分支，安装 SDK 依赖 | 0.3h | 分支 + 依赖就绪 |
| **P2** | 写最简 SDK `hello world` 骨架通过 `probe-mcp-initialized.mjs` | 1h | 能跑通握手 + notification 静默 |
| **P3** | 迁移 `tools/list` + 1 个工具（建议选 `gemini_search`，业务最简单），通过 `test-gemini-adc.mjs` | 1.5h | 单工具端到端可用 |
| **P4** | 迁移剩余 4 个工具（multimodal_query、analyze_content、analyze_codebase、brainstorm） | 1.5h | 全部工具可用 |
| **P5** | 业务层（auth/proxy/error）对齐复用，跑全量回归 | 0.5h | 行为等价 v1.5.1 |
| **P6** | 合并 `main` + 发布 `v2.0.0` + npm publish | 0.5h | 发布完成 |

**总计**：~5.3 小时（含踩坑 buffer）

---

## 12. 成功标准（Go / No-Go）

v2.0 发布前必须满足**全部**条件：

| # | 标准 | 验证方式 |
|---|---|---|
| 1 | 对 JSON-RPC notification 完全静默 | `probe-mcp-initialized.mjs` 通过 |
| 2 | ADC 模式可用 | `test-gemini-adc.mjs` 返回正常 Gemini 响应 |
| 3 | 5 个工具全部可调用 | 手动调用每个工具至少一次，结果与 v1.5.1 等价 |
| 4 | Claude CLI 独立 session 工具可见 | 重启 `claude`，列出 MCP 工具能看到 5 个 |
| 5 | VS Code 插件内工具可调用 | 重启插件面板，调用无 `Connection closed` |
| 6 | 代码精简 | `src/server.ts` + `src/types.ts` 总行数 ≤ v1.5.1 的 70% |
| 7 | 三种认证模式向后兼容 | API Key / Vertex JSON / ADC 三个模式依次验证 |

---

## 13. 风险与回滚

### 13.1 风险矩阵

| 风险 | 等级 | 缓解 |
|---|---|---|
| Zod schema 转换错误（字段类型、必填约束） | 中 | 每个工具转完立刻用 `test-gemini-adc.mjs` 单独验证 |
| SDK 版本与业务代码兼容性 | 低 | 选 RLabs-Inc 同版本 `@modelcontextprotocol/sdk@1.22.0` |
| 业务行为静默变化（错误消息文本、返回结构细节） | 低 | 保留 `utils/error-handler.ts` 不动，只改协议包装层 |
| 迁移过程影响 v1 用户 | 低 | 独立分支开发；v1.5.1 打 tag 保留；v2 单独发布 |
| ADC 凭证处理在 SDK 下有行为差异 | 低 | 迁移后立即用本地 `test-gemini-adc.mjs` 验证，对比输出 |

### 13.2 回滚方案

如 v2.0.0 发布后发现问题：

1. 用户侧：`npm install @lkbaba/mcp-server-gemini@1.5.1` 回到 v1 最后稳定版
2. 源码侧：`main` 分支保留 `v1.5.1` tag，随时可 checkout
3. npm 侧：v2 可标记 deprecated，主推 v1.5.1 直到修复再发 v2.0.1

---

## 14. 启动前置条件

以下两项必须**先完成**才能启动 Part II 的 P1：

| # | 条件 | 当前状态 |
|---|---|---|
| 1 | v1 notification 修复完成（代码层面） | ✅ 已完成 |
| 2 | v1 回归测试通过（Session A + Session B 都通） | ⏳ **待用户操作**（见第 5 节）|

**如条件 2 失败**：说明 notification 违规不是用户困扰的唯一根因，优先排查其他问题，**暂缓启动 v2 迁移**，否则会在有未知 bug 叠加的状态下做架构重写。

---

## 15. 参考资源

| 来源 | 价值 |
|---|---|
| `E:/Github/Grok-mcp/src/index.ts` | **同作者的 SDK 版 MCP**，最贴近 Gemini-mcp 迁移风格的模板 |
| `E:/Github/Claude-code-ChatInWindows/reference/gemini-mcp/src/` | Gemini + SDK 的成熟参考实现（含工具 Zod schema 写法、双模式入口、测试组织） |
| `https://github.com/modelcontextprotocol/typescript-sdk` | 官方 SDK 仓库（README、examples、release notes） |
| `https://modelcontextprotocol.io/` | MCP 协议规范官网 |

---

## 16. 后续产出

启动 Part II 时，建议产出：

- `specs/updatePRDv7-PLAN.md` — 逐文件级实施计划（列每个文件的 before/after 代码示例）
- `E:/Github/Gemini-mcp/CHANGELOG.md` — v2.0.0 变更日志（面向用户的 breaking change 说明，即使行为兼容也要标 major 因为架构重写）
- `E:/Github/Gemini-mcp/MIGRATION.md`（可选） — 如果有用户自己 fork 了 v1 代码，给他们的迁移说明

---

**文档生成时间**：2026-04-20
**相关 session**：本次诊断过程见主对话，Session A 独立诊断见用户粘贴的 `claude --resume 504a8598-0bfa-446f-8b5c-d0fb6a253ea6` 记录
