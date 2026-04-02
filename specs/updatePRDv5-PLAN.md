# updatePRDv5-PLAN — Codex MCP 模板集成 开发计划

> 基于：`specs/updatePRDv5.md` v4.0.8 | 创建日期：2026-04-02 | 状态：**进行中** 🚧

---

## 任务总览

| # | 任务 | 文件 | 依赖 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 1 | MCP 模板 UI 选项 + 模板数据 | `getBodyContent.ts`, `ui-script.ts` | 无 | P0 | [x] |
| 2 | MCP 系统提示词 | `mcpPrompts.ts` | 无 | P0 | [x] |
| 3 | CLAUDE.md 条件注入改造 | `utils.ts` | 无 | P1 | [x] |
| 4 | 版本发布 + CHANGELOG | `package.json`, `getBodyContent.ts`, `CHANGELOG.md` | Task 1-3 | — | [ ] |

**总任务数**：4 个
**预计总时间**：约 30 分钟

---

## Task 1：MCP 模板 UI 选项 + 模板数据

**预计时间**：10 分钟
**依赖**：无
**关联需求**：PRD 2.1
**状态**：[ ]

**上下文摘要**：
> 当前有 6 个 MCP 模板。UI 下拉菜单在 `getBodyContent.ts` 中有 Global 和 Workspace 两处 `<select>`，模板数据在 `ui-script.ts` 的 `addMcpFromTemplate()` 函数中定义为内联对象。Codex 配置非常简单：command 为 `codex`，args 为 `['mcp-server']`，无需环境变量。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code Webview UI 开发。ultrathink

请在 MCP 模板系统中添加 Codex 模板。

## 背景

当前插件有 6 个 MCP 模板。UI 下拉菜单在 `src/ui-v2/getBodyContent.ts` 中定义（Global: 行 375-383，Workspace: 行 403-411）。模板数据在 `src/ui-v2/ui-script.ts` 的 `addMcpFromTemplate()` 函数中定义（行 5106-5151）。

## 需求

### 1. `src/ui-v2/getBodyContent.ts`

在 **两处** `<select>` 下拉菜单（`mcpGlobalTemplateSelector` 和 `mcpWorkspaceTemplateSelector`）中，分别在 `gemini-assistant` 选项**之后**添加：

```html
<option value="codex-official">Codex</option>
```

### 2. `src/ui-v2/ui-script.ts`

在 `addMcpFromTemplate()` 函数的 `templates` 对象中，在 `gemini-assistant` 条目**之后**添加：

```javascript
// Codex autonomous coding agent - delegate implementation, review, debugging
'codex-official': {
    name: 'codex-official',
    command: 'codex',
    args: ['mcp-server'],
    env: {}
}
```

## 技术要求

- 注意 `ui-script.ts` 是 template literal，但这里添加的内容不含特殊转义字符，无需额外处理
- `gemini-assistant` 条目的闭合 `}` 后面需要确认有逗号分隔
- 代码注释用英文

## 约束条件

- 不要修改任何已有模板的数据
- 不要修改 `addMcpFromTemplate()` 函数的其他逻辑
- 下拉菜单中的显示名称为 `Codex`，value 为 `codex-official`

**验收标准**：
- [ ] 编译零错误
- [ ] Global 下拉菜单中出现 "Codex" 选项
- [ ] Workspace 下拉菜单中出现 "Codex" 选项
- [ ] 选择 Codex 模板后，填充 name=`codex-official`、command=`codex`、args=`mcp-server`

---

## Task 2：MCP 系统提示词

**预计时间**：5 分钟
**依赖**：无
**关联需求**：PRD 2.1
**状态**：[ ]

**上下文摘要**：
> `src/utils/mcpPrompts.ts` 中的 `MCP_SYSTEM_PROMPTS` 记录了每个 MCP 服务器的系统提示词。当 Claude CLI 启动时，`getMcpSystemPrompts()` 匹配已启用的服务器名称，拼接对应的提示词通过 `--append-system-prompt` 传入。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 Claude Code CLI 的系统提示词架构。

请在 `MCP_SYSTEM_PROMPTS` 中添加 Codex 的系统提示词。

## 背景

`src/utils/mcpPrompts.ts` 中的 `MCP_SYSTEM_PROMPTS` 是一个 `Record<string, string>`，key 为 MCP 服务器名称，value 为 markdown 格式的使用指南。当用户启用 `codex-official` MCP 服务器后，`getMcpSystemPrompts()` 会在 CLI 启动参数中注入对应的提示词。

## 需求

在 `MCP_SYSTEM_PROMPTS` 对象中，`gemini-assistant` 条目**之后**添加：

```typescript
// Codex autonomous coding agent - delegate implementation, review, debugging to OpenAI Codex
'codex-official': `
## Codex (OpenAI)
**Purpose**: Autonomous coding agent — delegate implementation, review, and debugging tasks
**Core Tools**:
- \`codex\` - Start a session with prompt + sandbox/approval settings
  - sandbox: read-only | workspace-write | danger-full-access
  - approval-policy: untrusted | on-failure | on-request | never
  - Supports: model override, cwd, developer-instructions
- \`codex-reply\` - Continue a session by threadId for iterative refinement

**Workflow**: Claude architects the plan → delegate scoped tasks to Codex → review results
**Best practice**: Pass project context via \`developer-instructions\`, use \`codex-reply\` for multi-turn tasks
**Defaults**: sandbox='workspace-write', approval-policy='on-failure' for balanced autonomy and safety
**Note**: Requires \`npm i -g @openai/codex\` and OPENAI_API_KEY`
```

## 技术要求

- 文件：`src/utils/mcpPrompts.ts`
- key 必须为 `codex-official`（与模板名称匹配）
- 反引号内的 backtick 字符需要用 `\`` 转义
- 代码注释用英文

## 约束条件

- 不要修改 `getMcpSystemPrompts()` 函数逻辑
- 不要修改任何已有的 prompt 内容

**验收标准**：
- [ ] 编译零错误
- [ ] `MCP_SYSTEM_PROMPTS['codex-official']` 返回非空字符串
- [ ] 启用 codex-official 后启动会话，`--append-system-prompt` 中包含 Codex 提示词

---

## Task 3：CLAUDE.md 条件注入改造

**预计时间**：10 分钟
**依赖**：无
**关联需求**：PRD 2.2
**状态**：[ ]

**上下文摘要**：
> `src/utils/utils.ts` 的 `updateClaudeMdWithPlatformInfo()` 接收 `mcpServers` 参数。当前 Playwright 段落基于 `mcpServers` 中是否包含 playwright 来决定是否注入。需要新增 Codex 段落，同样基于 `mcpServers` 做条件判断。

**AI 提示词**：

你是一位资深 TypeScript 开发专家，精通 VS Code 扩展和文件系统操作。ultrathink

请在 `updateClaudeMdWithPlatformInfo()` 中添加 Codex MCP 的 CLAUDE.md 条件注入，并改造 Playwright 的注入逻辑使其也基于 `mcpServers` 做条件判断。

## 背景

`src/utils/utils.ts` 的 `updateClaudeMdWithPlatformInfo(workspaceFolder, mcpServers)` 函数管理项目 CLAUDE.md 的自动内容注入。当前有两个段落：
- `platformSection`：平台环境信息（Windows/macOS）—— 无条件注入
- `playwrightSection`：Playwright 使用指南 —— 需改为条件注入

## 需求

### 1. 新增 Codex 段落常量

在 `playwrightSection` 定义之后添加：

```typescript
// Codex MCP
const codexSection = `## Codex MCP Guide

Codex is an autonomous coding agent by OpenAI, integrated via MCP.

Workflow: Claude plans architecture → delegate scoped tasks to Codex → review results
- \`codex\` tool: start a session with prompt, sandbox, approval-policy
- \`codex-reply\` tool: continue a session by threadId for multi-turn tasks
- Pass project context via \`developer-instructions\` parameter
- Recommended: sandbox='workspace-write', approval-policy='on-failure'

Prerequisite: \`npm i -g @openai/codex\`, OPENAI_API_KEY configured`;
```

### 2. 添加 MCP 服务器检测辅助逻辑

在 `try` 块内、读取 CLAUDE.md 内容之后，添加服务器检测：

```typescript
const hasPlaywrightServer = mcpServers?.some(s => s.name === 'playwright') ?? false;
const hasCodexServer = mcpServers?.some(s => s.name === 'codex-official') ?? false;
```

### 3. 改造 Playwright 注入逻辑

将现有的：
```typescript
if (!hasPlaywrightInfo) {
    // ... inject playwright section
}
```

改为：
```typescript
if (!hasPlaywrightInfo && hasPlaywrightServer) {
    // ... inject playwright section
}
```

### 4. 新增 Codex 注入逻辑

在 Playwright 注入逻辑之后，添加：

```typescript
// Add Codex MCP information (if enabled and not present)
let hasCodexInfo = content.includes('Codex MCP');
if (!hasCodexInfo && hasCodexServer) {
    if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n';
    }
    content += '\n' + codexSection + '\n';
    needsUpdate = true;
    updatedSections.push('Codex MCP guide');
}
```

### 5. 更新 `hasPlaywrightInfo` 的初始化位置

将 `hasPlaywrightInfo` 的声明移到 `hasCodexInfo` 旁边（保持变量声明一致性），并添加 `hasCodexInfo`：

```typescript
let hasPlaywrightInfo = false;
let hasCodexInfo = false;

if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, 'utf8');
    hasPlatformInfo = content.includes('Development Environment') &&
        (content.includes('Windows') || content.includes('macOS'));
    hasPlaywrightInfo = content.includes('Playwright MCP');
    hasCodexInfo = content.includes('Codex MCP');
}
```

## 技术要求

- 文件：`src/utils/utils.ts`
- `mcpServers` 参数是可选的，用 `?.some()` + `?? false` 安全访问
- 注入顺序：平台信息 → Playwright → Codex（追加到文件末尾）
- 代码注释用英文

## 约束条件

- 不要修改 `platformSection` 的注入逻辑（它仍是无条件的）
- 不要修改段落内容的格式（换行、缩进）
- 不要修改函数签名
- 不要修改 `ClaudeChatProvider.ts` 中的调用方式

**验收标准**：
- [ ] 编译零错误
- [ ] 启用 codex-official 后，CLAUDE.md 出现 "Codex MCP Guide" 段落
- [ ] 未启用 codex-official 时，CLAUDE.md 中无 Codex 段落
- [ ] 启用 playwright 后，CLAUDE.md 出现 "Playwright MCP Guide" 段落
- [ ] 未启用 playwright 时，CLAUDE.md 中无 Playwright 段落
- [ ] 重复打开面板不会导致段落重复注入

---

## Task 4：版本发布 + CHANGELOG

**预计时间**：5 分钟
**依赖**：Task 1-3
**关联需求**：PRD 3. 版本发布检查
**状态**：[ ]

**上下文摘要**：
> 所有功能完成后，更新版本号、CHANGELOG，编译打包。

**AI 提示词**：

你是一位资深 VS Code 扩展开发专家，熟悉版本发布流程。

请完成 v4.0.8 的版本发布。

## 需求

1. `package.json` → `"version": "4.0.8"`
2. `src/ui-v2/getBodyContent.ts` → 找到版本显示字符串，更新为 `v4.0.8`
3. `CHANGELOG.md` → 在顶部添加 v4.0.8 条目：

```markdown
## v4.0.8 — Codex MCP 模板集成 (2026-04-02)

### New Features
- **MCP Template**: Added Codex (OpenAI) template — one-click setup for `codex mcp-server`
- **System Prompt**: Auto-inject Codex usage guide when Codex MCP is enabled
- **CLAUDE.md**: Auto-inject Codex MCP Guide section when codex-official server is active

### Improvements
- **CLAUDE.md Injection**: Playwright and Codex sections are now conditionally injected based on active MCP servers (previously Playwright was always injected)
```

4. 编译：`npm run compile` → 确认零错误
5. 打包：`cmd //c "npx @vscode/vsce package --no-dependencies"`
6. 确认产物：`claude-code-chatui-4.0.8.vsix`

## 约束条件

- CHANGELOG 条目用英文（与现有风格一致）
- 不要修改 .vscodeignore

**验收标准**：
- [ ] 三处版本号一致为 4.0.8
- [ ] 编译零错误
- [ ] VSIX 文件名正确
- [ ] VSIX 体积合理（~320KB 左右）

---

## 验收检查点

- [ ] **Task 1-2 完成后**：模板功能验收 — 打开 MCP 设置面板，从模板添加 Codex，确认配置正确填充、系统提示词正确注入
- [ ] **Task 3 完成后**：CLAUDE.md 注入验收 — 启用/禁用 Codex 和 Playwright MCP，确认条件注入行为正确
- [ ] **Task 4 完成后**：发布验收 — 安装 VSIX，确认版本号 v4.0.8 显示正确，模板功能正常
