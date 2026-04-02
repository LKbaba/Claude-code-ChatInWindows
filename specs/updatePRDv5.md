# updatePRDv5 — Codex MCP 模板集成

> 版本：v4.0.8 | 创建日期：2026-04-02 | 状态：**进行中** 🚧

## 1. 背景与动机

### 1.1 触发事件

社区中 "Claude 做架构师 + Codex 做执行者" 的工作流日趋成熟。OpenAI 的 Codex CLI 提供了官方 MCP Server（`codex mcp-server`），可以让 Claude 通过 MCP 协议直接委派编码任务给 Codex，无需手动切换终端。

当前插件已有 6 个 MCP 模板（sequential-thinking、context7、playwright、shadcn、grok-assistant、gemini-assistant），但缺少 Codex 模板，用户需要手动填写配置。

### 1.2 社区最佳实践（Grok 搜索 2026-04-02）

- **角色分工**：Claude 擅长架构设计、复杂推理、规划；Codex 擅长明确范围的实现任务、代码审查、调试
- **核心工作流**：Claude 输出 plan/spec → 通过 MCP 委派给 Codex → Codex 自主执行 → Claude 审查整合
- **关键参数**：
  - `sandbox`：控制 Codex 文件系统权限（read-only / workspace-write / danger-full-access）
  - `approval-policy`：控制 shell 命令审批（untrusted / on-failure / on-request / never）
  - `developer-instructions`：传递项目上下文和约束
  - `codex-reply`：支持多轮对话迭代
- **推荐默认**：`sandbox='workspace-write'` + `approval-policy='on-failure'`（平衡自主性与安全性）

### 1.3 不在范围内

- Codex CLI 安装引导（用户自行安装 `npm i -g @openai/codex`）
- OPENAI_API_KEY 配置 UI（用户自行配置环境变量）
- 自动在 settings.json 里注入 codex MCP 配置（由用户通过模板按钮手动添加）

---

## 2. 需求列表

### 2.1 P0 — MCP 模板增加 Codex

**涉及文件**：

| 文件 | 修改内容 |
|------|---------|
| `src/ui-v2/getBodyContent.ts` | 在 Global 和 Workspace 两个 `<select>` 下拉菜单中各增加 `<option value="codex-official">Codex</option>` |
| `src/ui-v2/ui-script.ts` | 在 `addMcpFromTemplate()` 的 `templates` 对象中增加 `codex-official` 条目 |
| `src/utils/mcpPrompts.ts` | 在 `MCP_SYSTEM_PROMPTS` 中增加 `codex-official` 的系统提示词 |

**模板数据**：

```javascript
'codex-official': {
    name: 'codex-official',
    command: 'codex',
    args: ['mcp-server'],
    env: {}
}
```

**系统提示词**：

```
## Codex (OpenAI)
**Purpose**: Autonomous coding agent — delegate implementation, review, and debugging tasks
**Core Tools**:
- `codex` - Start a session with prompt + sandbox/approval settings
  - sandbox: read-only | workspace-write | danger-full-access
  - approval-policy: untrusted | on-failure | on-request | never
  - Supports: model override, cwd, developer-instructions
- `codex-reply` - Continue a session by threadId for iterative refinement

**Workflow**: Claude architects the plan → delegate scoped tasks to Codex → review results
**Best practice**: Pass project context via `developer-instructions`, use `codex-reply` for multi-turn tasks
**Defaults**: sandbox='workspace-write', approval-policy='on-failure' for balanced autonomy and safety
**Note**: Requires `npm i -g @openai/codex` and OPENAI_API_KEY
```

---

### 2.2 P1 — CLAUDE.md 自动注入 Codex 使用指南

**涉及文件**：`src/utils/utils.ts` — `updateClaudeMdWithPlatformInfo()`

**现状**：当用户启用 Playwright MCP 模板后，函数会在项目 CLAUDE.md 中注入 Playwright 使用指南段落。Codex 同样重要，需要类似的注入逻辑。

**方案**：

1. 新增 `codexSection` 常量，包含 Codex MCP 使用指南
2. 检测 `mcpServers` 中是否包含 `codex-official`，仅在启用时注入
3. 同步改造 Playwright 段落的注入逻辑，使其也基于 `mcpServers` 做条件判断（保持一致性）
4. 检测 CLAUDE.md 中是否已存在 `Codex MCP` 字样，避免重复注入

**注入内容**：

```markdown
## Codex MCP Guide

Codex is an autonomous coding agent by OpenAI, integrated via MCP.

Workflow: Claude plans architecture → delegate scoped tasks to Codex → review results
- `codex` tool: start a session with prompt, sandbox, approval-policy
- `codex-reply` tool: continue a session by threadId for multi-turn tasks
- Pass project context via `developer-instructions` parameter
- Recommended: sandbox='workspace-write', approval-policy='on-failure'

Prerequisite: `npm i -g @openai/codex`, OPENAI_API_KEY configured
```

---

## 3. 版本发布检查

按 CLAUDE.md 中的 Version Release Checklist：

1. `package.json` → `"version": "4.0.8"`
2. `src/ui-v2/getBodyContent.ts` → 版本显示字符串更新为 `v4.0.8`
3. `CHANGELOG.md` → 新增 v4.0.8 版本条目
4. 编译：`npm run compile`
5. 打包：`cmd //c "npx @vscode/vsce package --no-dependencies"`

---

## 4. 测试验证

| 测试项 | 验证方法 |
|--------|---------|
| 模板下拉菜单显示 Codex 选项 | 打开 MCP 设置面板，Global/Workspace 下拉菜单中均可见 "Codex" |
| 选择模板后正确填充配置 | 选择 Codex 模板后，服务器名称为 `codex-official`，命令为 `codex`，参数为 `mcp-server` |
| 系统提示词正确注入 | 启用 codex-official 后启动会话，检查 `--append-system-prompt` 包含 Codex 提示词 |
| CLAUDE.md 条件注入 | 启用 codex-official 后打开面板，检查 CLAUDE.md 中出现 "Codex MCP Guide" 段落 |
| CLAUDE.md 不重复注入 | 再次打开面板，确认 CLAUDE.md 中 "Codex MCP Guide" 只出现一次 |
| 未启用时不注入 | 不配置 codex-official MCP，确认 CLAUDE.md 中不出现 Codex 段落 |
| Playwright 条件注入一致性 | 未启用 playwright MCP 时，CLAUDE.md 中不出现 Playwright 段落 |
