# 官方文档页面清单（2026-09 盘点）

> 盘点日期：2026-09-24 ｜ CLI 基线：2.1.280 ｜ 依据：updatePRDv3 §3.3.2 第 1 步（检查点 C1）
> 方法：Playwright（headless，viewport 1920×1080）逐个打开 8 个顶部标签页，循环点开侧边栏所有折叠分组（每个标签结束时 `aria-expanded="false"` 剩余 0），从 DOM 提取链接。**所有 URL 均取自导航**，再与官方 `llms.txt` 交叉核对。

## 0. 汇总

| 站点 | 页数 | 与 llms.txt 核对 |
|---|---|---|
| Claude Code（`https://code.claude.com/docs/en/`） | **197** | 侧边栏 194 页 + 3 个分组落地页（只在 llms.txt，已逐个验证 HTTP 200、内容真实）；`whats-new` 与 `whats-new/index` 为同一页 |
| Claude API 子集（`https://platform.claude.com/docs/en/`） | **46**（从全站 634 页中筛选，含 C1 后补充的 8 个模型子页） | ⚠️ platform 的 llms.txt **过时**：缺 Opus 5.5 页，侧边栏里有 |

**级别图例**：`P0` 决定插件能否正常工作 ｜ `P1` 插件已有对应功能、需要对齐 ｜ `P2` 新玩法来源 ｜ `CL` 变更记录（CHANGES 的主要依据） ｜ `—` 建议不抓（与插件无关：企业部署、云端/桌面/移动端、TUI 专属界面等；如需要可在 C1 调整）

**级别统计**：见文末 §4。

### 盘点中的发现

1. **Agent SDK 已并入 Claude Code 文档站**（`/docs/en/agent-sdk/*`），不再位于 API 文档站
2. **旧的 SDK "Slash Commands" 页已合并进 Skills**：`/agent-sdk/slash-commands` 重定向到 "Extend agents with skills"，不在导航中
3. **platform 的 llms.txt 缺少 Opus 5.5**：`/models/opus-5-5/overview` 只在侧边栏里有。印证了 PRD"URL 以导航为准"的要求
4. **每个页面都提供官方 Markdown 导出**（在 URL 后加 `.md`，`Content-Type: text/markdown`）。经抽样，导出内容**包含全部语言 Tab 的代码**，比逐个点击 Tab 更可靠（见 C1 汇报中的方案建议）
5. **What's New 周报覆盖 2026-W13～W37（3/23～9/11）**，正好覆盖本地文档过时的 6 个月（W31 缺失，官方未发布）
6. `/agent-sdk/typescript-v2-preview` 在导航中标注为 "(removed)"
7. **模型子页只在打开该模型页面时才出现在侧边栏**（上下文相关导航）。C1 首轮只在 Models overview 页盘点，漏了 8 个子页（含 Opus 5.5 的 What's new 与 Migration guide）；抓取阶段逐个模型页复查后补齐

---

## 1. Claude Code 文档站（197 页）

URL 前缀：`https://code.claude.com/docs/en/`

### 1.1 Getting started（40）

| 分组 | 页面 | 路径 | 级别 | 说明 |
|---|---|---|---|---|
| Getting started | Overview | `overview` | — | 产品介绍 |
| | Quickstart | `quickstart` | — | 新手上手 |
| | Changelog | `changelog` | **CL** | CLI 版本变更记录，查模型最低版本、flag 变化的关键来源 |
| Core concepts | How Claude Code works | `how-claude-code-works` | P2 | 整体机制 |
| | Extend Claude Code | `features-overview` | P2 | 扩展能力总览 |
| | Explore the .claude directory | `claude-directory` | P1 | `.claude/` 目录结构，与插件读写 session/配置有关 |
| | Explore the context window | `context-window` | **P0** | 上下文窗口机制，直接关系上下文指示器（Gotcha #8） |
| | Prompt caching | `prompt-caching` | P1 | CLI 侧缓存行为，关系计价 |
| Use Claude Code | Store instructions and memories | `memory` | P1 | CLAUDE.md / memory |
| | Manage sessions | `sessions` | P1 | 会话管理，对照插件 resume |
| | Common workflows | `common-workflows` | P2 | |
| | Prompt library | `prompt-library` | — | |
| | Best practices | `best-practices` | P2 | |
| Platforms and integrations | Overview | `platforms` | — | |
| | Remote Control | `remote-control` | P2 | |
| ↳ Claude Code in the cloud | Get started | `web-quickstart` | — | 云端版 |
| | Reference | `claude-code-on-the-web` | — | |
| | Routines | `routines` | — | |
| | Ultrareview | `ultrareview` | — | |
| | Projects | `claude-projects` | — | |
| ↳ Claude Code on desktop | Get started | `desktop-quickstart` | — | 桌面版 |
| | Reference | `desktop` | — | |
| | Linux (beta) | `desktop-linux` | — | |
| | Windows (WSL) | `desktop-wsl` | — | |
| | Scheduled tasks | `desktop-scheduled-tasks` | — | |
| | iOS simulator (beta) | `desktop-ios-simulator` | — | |
| | Mobile | `mobile` | — | |
| | Chrome extension | `chrome` | — | |
| | Computer use (preview) | `computer-use` | — | |
| | Visual Studio Code | `vs-code` | P1 | **官方 VS Code 扩展**，功能对照/差异化的参照物 |
| | JetBrains IDEs | `jetbrains` | — | |
| ↳ Code review & CI/CD | Security guidance plugin | `security-guidance` | — | |
| | Claude Security plugin | `claude-security` | — | |
| | Code Review | `code-review` | — | |
| | GitHub Actions | `github-actions` | — | |
| | GitHub Actions cloud providers | `github-actions-cloud-providers` | — | |
| | GitHub Enterprise Server | `github-enterprise-server` | — | |
| | GitLab CI/CD | `gitlab-ci-cd` | — | |
| | Claude Code in Slack | `slack` | — | |
| | Claude Tag | `claude-tag` | — | |

### 1.2 Build with Claude Code（25）

| 分组 | 页面 | 路径 | 级别 | 说明 |
|---|---|---|---|---|
| Agents and parallel work | Overview | `agents` | P2 | |
| | Create custom subagents | `sub-agents` | P1 | subagent 配置 |
| | Agent view | `agent-view` | P2 | |
| | Run agent teams | `agent-teams` | P2 | |
| | Cross-session messaging | `cross-session-messaging` | P2 | 多会话玩法 |
| | Dynamic workflows | `workflows` | P2 | |
| | Isolate sessions with worktrees | `worktrees` | P2 | |
| MCP | Quickstart | `mcp-quickstart` | P1 | |
| | Reference | `mcp` | P1 | MCP 配置格式、scope，对照插件 MCP 双面板 |
| Skills | Extend Claude with skills | `skills` | P1 | |
| Plugins | Discover and install prebuilt plugins | `discover-plugins` | P1 | 对照插件的 PluginManager |
| | Create plugins | `plugins` | P1 | |
| | Test plugins with evals | `plugin-evals` | — | |
| Artifacts | Share session output as artifacts | `artifacts` | P2 | |
| Automation | Automate with hooks | `hooks-guide` | P1 | 对照 HooksConfigManager |
| | Push external events to Claude | `channels` | P2 | |
| | Run prompts on a schedule | `scheduled-tasks` | P2 | |
| | Goals | `goal` | P2 | |
| | Programmatic usage | `headless` | **P0** | headless / `-p` 模式，插件的运行方式 |
| | Launch sessions from links | `deep-links` | P2 | |
| Guides | Monorepos and large repos | `large-codebases` | — | |
| Troubleshooting | Troubleshoot installation and login | `troubleshoot-install` | P2 | Windows 安装问题 |
| | Troubleshoot performance and stability | `troubleshooting` | P2 | |
| | Debug configuration | `debug-your-config` | P1 | |
| | Error reference | `errors` | **P0** | 错误信息对照，如 `claude_code_version_too_old` |

### 1.3 Administration（39 = 侧边栏 37 + 落地页 2）

| 分组 | 页面 | 路径 | 级别 | 说明 |
|---|---|---|---|---|
| Setup and access | Administration overview | `admin-setup` | — | |
| | Advanced setup | `setup` | P1 | 安装/系统要求（含 Windows），对照 WindowsCompatibility |
| | Authentication | `authentication` | P1 | API key / 登录方式，对照插件 API key 功能 |
| | Managed settings | `managed-settings` | — | 企业 |
| | Server-managed settings | `server-managed-settings` | — | 企业 |
| | Managed MCP configuration | `managed-mcp` | — | 企业 |
| | Auto mode | `auto-mode-config` | P2 | auto 权限模式 |
| Deployment | Overview | `third-party-integrations` | P2 | |
| | Feature availability | `feature-availability` | P2 | 各平台功能差异 |
| | Amazon Bedrock | `amazon-bedrock` | — | |
| | Claude Platform on AWS | `claude-platform-on-aws` | — | |
| | Google Cloud's Agent Platform | `google-vertex-ai` | — | |
| | Microsoft Foundry | `microsoft-foundry` | — | |
| | Network configuration | `network-config` | P1 | 代理配置，插件 spawn 时会传代理环境变量 |
| | Corporate launcher | `corporate-launcher` | — | |
| | Development containers | `devcontainer` | — | |
| Gateways | Overview | `gateways` | P1 | 对照插件"Custom API Endpoint" |
| ↳ Claude apps gateway | （分组落地页，仅 llms.txt） | `claude-apps-gateway` | — | 企业网关 |
| | Configuration | `claude-apps-gateway-config` | — | |
| | Spend limits | `claude-apps-gateway-spend-limits` | — | |
| | Deployment | `claude-apps-gateway-deploy` | — | |
| | Deployment example: AWS | `claude-apps-gateway-on-aws` | — | |
| | Deployment example: Google Cloud | `claude-apps-gateway-on-gcp` | — | |
| ↳ Other gateways | （分组落地页，仅 llms.txt） | `llm-gateway` | P1 | |
| | Connect to a gateway | `llm-gateway-connect` | P1 | 自定义 endpoint 的环境变量 |
| | Organization rollout | `llm-gateway-rollout` | — | |
| | Compatibility guide | `llm-gateway-protocol` | P1 | 网关协议兼容要求 |
| Usage and costs | Monitoring | `monitoring-usage` | P2 | OTEL |
| | Costs | `costs` | P1 | 对照插件统计页 |
| | Track team usage with analytics | `analytics` | — | |
| Plugin distribution | Create and distribute a plugin marketplace | `plugin-marketplaces` | P2 | |
| | Plugin dependency versions | `plugin-dependencies` | — | |
| | Recommend your plugin from your CLI | `plugin-hints` | — | |
| | Recommend plugins for your org | `plugin-relevance` | — | |
| Security and data | Security | `security` | P2 | |
| | Data usage | `data-usage` | P1 | **遥测/数据上报及关闭方式**（维护者关心的隐私问题） |
| | Zero data retention | `zero-data-retention` | — | |
| Adoption | Communications kit | `communications-kit` | — | |
| | Champion kit | `champion-kit` | — | |

### 1.4 Configuration（25 = 侧边栏 24 + 落地页 1）

| 分组 | 页面 | 路径 | 级别 | 说明 |
|---|---|---|---|---|
| Settings | Settings files and precedence | `settings` | **P0** | settings 层级与优先级 |
| | All settings | `settings-reference` | **P0** | 全部配置项 |
| | Example settings files | `settings-example` | P1 | |
| Permissions and sandboxing | Permissions | `permissions` | **P0** | |
| | Permission modes | `permission-modes` | **P0** | 替代 `--dangerously-skip-permissions` 的依据 |
| | Bash sandbox | `sandboxing` | P2 | |
| | Sandbox environments | `sandbox-environments` | — | |
| Environments | Cloud environments | `cloud-environments` | — | |
| ↳ Self-hosted environments | （分组落地页，仅 llms.txt） | `self-hosted-environments` | — | |
| | Quickstart | `self-hosted-environments-quickstart` | — | |
| | Deploy to production | `self-hosted-environments-deploy` | — | |
| | Customize sessions | `self-hosted-environments-configuration` | — | |
| | Test end to end | `self-hosted-environments-testing` | — | |
| | Reference | `self-hosted-environments-reference` | — | |
| | Session identity | `self-hosted-environments-identity` | — | |
| Model and responses | Model configuration | `model-config` | **P0** | 模型别名、1M、effort |
| | Speed up responses with fast mode | `fast-mode` | P1 | |
| | Escalate hard decisions with the advisor tool | `advisor` | P2 | |
| | Output styles | `output-styles` | P2 | |
| Interface | Terminal configuration | `terminal-config` | — | TUI 专属 |
| | Fullscreen rendering | `fullscreen` | — | TUI 专属 |
| | Screen reader mode | `accessibility` | — | TUI 专属 |
| | Voice dictation | `voice-dictation` | — | TUI 专属 |
| | Customize status line | `statusline` | P2 | |
| | Customize keyboard shortcuts | `keybindings` | — | TUI 专属 |

### 1.5 Reference（10）

| 分组 | 页面 | 路径 | 级别 | 说明 |
|---|---|---|---|---|
| Reference | CLI reference | `cli-reference` | **P0** | 全部 flag，核实 `--custom-instructions` / `--mcp-server` 是否还有效 |
| | Commands | `commands` | P1 | 斜杠命令，对照插件的 slash command 列表 |
| | Environment variables | `env-vars` | **P0** | 全部环境变量 |
| | Tools reference | `tools-reference` | **P0** | 内置工具名/参数，插件的工具调用展示依赖它 |
| | Interactive mode | `interactive-mode` | P2 | 主要是 TUI，但含内置命令说明 |
| | Checkpointing | `checkpointing` | P1 | 对照 UndoRedoManager |
| | Hooks reference | `hooks` | P1 | |
| | Plugins reference | `plugins-reference` | P1 | |
| | Channels reference | `channels-reference` | P2 | |
| Glossary | Glossary | `glossary` | P2 | |

### 1.6 Agent SDK（32）

| 分组 | 页面 | 路径 | 级别 | 说明 |
|---|---|---|---|---|
| Agent SDK | Overview | `agent-sdk/overview` | **P0** | |
| | Quickstart | `agent-sdk/quickstart` | P2 | |
| | Migration Guide | `agent-sdk/migration-guide` | P1 | |
| | Troubleshooting | `agent-sdk/troubleshooting` | P2 | |
| Build agents | Configure your agent | `agent-sdk/configuration` | **P0** | Options ↔ CLI flag 对应 |
| | Examples | `agent-sdk/examples` | P2 | |
| Core concepts | How the agent loop works | `agent-sdk/agent-loop` | **P0** | 消息流转顺序 |
| | Use Claude Code features | `agent-sdk/claude-code-features` | P1 | |
| | Work with sessions | `agent-sdk/sessions` | **P0** | resume / fork |
| | Persist sessions to external storage | `agent-sdk/session-storage` | P2 | |
| Input and output | Streaming Input | `agent-sdk/streaming-vs-single-mode` | **P0** | `--input-format stream-json` |
| | Handle approvals and user input | `agent-sdk/user-input` | **P0** | 权限请求交互 |
| | Stream responses in real-time | `agent-sdk/streaming-output` | **P0** | 流式输出、partial messages |
| | Get structured output from agents | `agent-sdk/structured-outputs` | P2 | |
| Extend with tools | Give Claude custom tools | `agent-sdk/custom-tools` | P2 | |
| | Connect to external tools with MCP | `agent-sdk/mcp` | P1 | |
| | Scale to many tools with tool search | `agent-sdk/tool-search` | P2 | |
| | Subagents in the SDK | `agent-sdk/subagents` | P1 | |
| Customize behavior | Modifying system prompts | `agent-sdk/modifying-system-prompts` | **P0** | 插件用 `--append-system-prompt` |
| | Extend agents with skills | `agent-sdk/skills` | P1 | 已吸收旧的 Slash Commands 页 |
| | Plugins in the SDK | `agent-sdk/plugins` | P1 | |
| Control and observability | Configure permissions | `agent-sdk/permissions` | **P0** | |
| | Intercept and control agent behavior with hooks | `agent-sdk/hooks` | P1 | |
| | Rewind file changes with checkpointing | `agent-sdk/file-checkpointing` | P1 | 对照 UndoRedoManager |
| | Track cost and usage | `agent-sdk/cost-tracking` | **P0** | usage 字段，MessageProcessor 的 token/成本计算依赖它 |
| | Observability with OpenTelemetry | `agent-sdk/observability` | P2 | |
| | Track todos | `agent-sdk/todo-tracking` | P1 | |
| Deployment | Hosting the Agent SDK | `agent-sdk/hosting` | P2 | |
| | Securely deploying AI agents | `agent-sdk/secure-deployment` | P2 | |
| SDK references | TypeScript SDK | `agent-sdk/typescript` | **P0** | **消息类型的完整定义**（stream-json 协议说明书） |
| | TypeScript V2 (removed) | `agent-sdk/typescript-v2-preview` | — | 已移除 |
| | Python SDK | `agent-sdk/python` | P1 | 与 TS 版类型基本重复，用于核对 |

### 1.7 What's New（25）

全部为 **CL**，是 CHANGES 文档的主要依据。

| 页面 | 路径 |
|---|---|
| What's new（索引，= `whats-new/index`） | `whats-new` |
| Week 37 · Sep 7–11 | `whats-new/2026-w37` |
| Week 36 · Aug 31 – Sep 4 | `whats-new/2026-w36` |
| Week 35 · Aug 24–28 | `whats-new/2026-w35` |
| Week 34 · Aug 17–21 | `whats-new/2026-w34` |
| Week 33 · Aug 10–14 | `whats-new/2026-w33` |
| Week 32 · Aug 3–7 | `whats-new/2026-w32` |
| Week 30 · Jul 20–24 | `whats-new/2026-w30` |
| Week 29 · Jul 13–17 | `whats-new/2026-w29` |
| Week 28 · Jul 6–10 | `whats-new/2026-w28` |
| Week 27 · Jun 29 – Jul 3 | `whats-new/2026-w27` |
| Week 26 · Jun 22–26 | `whats-new/2026-w26` |
| Week 25 · Jun 15–19 | `whats-new/2026-w25` |
| Week 24 · Jun 8–12 | `whats-new/2026-w24` |
| Week 23 · Jun 1–5 | `whats-new/2026-w23` |
| Week 22 · May 25–29 | `whats-new/2026-w22` |
| Week 21 · May 18–22 | `whats-new/2026-w21` |
| Week 20 · May 11–15 | `whats-new/2026-w20` |
| Week 19 · May 4–8 | `whats-new/2026-w19` |
| Week 18 · Apr 27 – May 1 | `whats-new/2026-w18` |
| Week 17 · Apr 20–24 | `whats-new/2026-w17` |
| Week 16 · Apr 13–17 | `whats-new/2026-w16` |
| Week 15 · Apr 6–10 | `whats-new/2026-w15` |
| Week 14 · Mar 30 – Apr 3 | `whats-new/2026-w14` |
| Week 13 · Mar 23–27 | `whats-new/2026-w13` |

### 1.8 Resources（1）

| 页面 | 路径 | 级别 |
|---|---|---|
| Legal and compliance | `legal-and-compliance` | — |

---

## 2. Claude API 子集（46 页）

URL 前缀：`https://platform.claude.com/docs/en/`。全部取自侧边栏（Models / Build with Claude / API Reference 三个分区）。

| 分区 | 页面 | 路径 | 级别 | 说明 |
|---|---|---|---|---|
| Models | Models overview | `models/overview` | **P0** | 模型总表 |
| | Claude Fable 5.1 | `models/fable-5-1/overview` | **P0** | 插件已支持 |
| | ↳ What's new | `models/fable-5-1/whats-new-fable-5-1` | **P0** | Fable 5.1 新特性（C1 后补充，见发现 7） |
| | ↳ Migration guide | `models/fable-5-1/migration-guide` | P1 | 迁移到 Fable 5.1 的注意事项 |
| | Claude Opus 5.5 | `models/opus-5-5/overview` | **P0** | 插件已支持（llms.txt 缺失此页） |
| | ↳ What's new | `models/opus-5-5/whats-new-opus-5-5` | **P0** | Opus 5.5 新特性（effort 等官方用法） |
| | ↳ Migration guide | `models/opus-5-5/migration-guide` | **P0** | 迁移到 Opus 5.5 的注意事项 |
| | Claude Opus 5 | `models/opus-5/overview` | P2 | 插件**未支持**，Phase 2 可评估 |
| | Claude Sonnet 5 | `models/sonnet-5/overview` | **P0** | 插件已支持 |
| | ↳ What's new | `models/sonnet-5/whats-new-sonnet-5` | P1 | Sonnet 5 新特性 |
| | ↳ Migration guide | `models/sonnet-5/migration-guide` | P1 | 迁移到 Sonnet 5 的注意事项 |
| | Claude Haiku 4.5 | `models/haiku-4-5/overview` | P1 | 插件已支持 |
| | ↳ Migration guide | `models/haiku-4-5/migration-guide` | P2 | 迁移到 Haiku 4.5 |
| | Claude Mythos 5.1 | `models/mythos-5-1/overview` | P2 | 邀请制 |
| | Claude Mythos 5 | `models/mythos-5/overview` | P2 | 邀请制 |
| | Claude Fable 5 | `models/fable-5/overview` | P1 | 插件已支持 |
| | ↳ Introducing Fable 5 & Mythos 5 | `models/fable-5/introducing-claude-fable-5-and-claude-mythos-5` | P2 | 发布介绍 |
| | Claude Opus 4.8 | `models/opus-4-8/overview` | P1 | 插件已支持 |
| | Claude Opus 4.7 | `models/opus-4-7/overview` | — | 插件已隐藏 |
| | Claude Opus 4.6 | `models/opus-4-6/overview` | — | 旧模型 |
| | Claude Sonnet 4.6 | `models/sonnet-4-6/overview` | P1 | 插件已支持 |
| | Claude Opus 4.5 | `models/opus-4-5/overview` | — | 插件已隐藏 |
| | Claude Sonnet 4.5 | `models/sonnet-4-5/overview` | — | 插件已隐藏 |
| | Choosing a model | `about-claude/models/choosing-a-model` | P2 | |
| | Optimizing for cost and intelligence | `about-claude/models/optimizing-for-cost-and-intelligence` | P2 | |
| | Upgrade between model versions | `about-claude/models/migration-guide` | P2 | |
| | Model IDs and versioning | `about-claude/models/model-ids-and-versions` | **P0** | 模型 ID 与别名 |
| | Model deprecations | `about-claude/model-deprecations` | P1 | 退役时间表，决定何时隐藏旧模型 |
| | Pricing | `about-claude/pricing` | **P0** | 计价表的依据（含 cache read/write、5m/1h） |
| Build with Claude | Effort | `build-with-claude/effort` | **P0** | Backlog B1 |
| | Build an orchestration mode | `build-with-claude/mid-conversation-effort-example` | P2 | 会话中途切换 effort 的示例 |
| | Thinking | `build-with-claude/thinking` | **P0** | 插件的思考强度设置 |
| | Fast mode (research preview) | `build-with-claude/fast-mode` | P1 | |
| | Context windows | `build-with-claude/context-windows` | **P0** | 1M 窗口 |
| | Prompt caching | `build-with-claude/prompt-caching` | **P0** | Backlog B3 缓存计价 |
| | Cache diagnostics (beta) | `build-with-claude/cache-diagnostics` | P2 | |
| | Tool use with prompt caching | `agents-and-tools/tool-use/tool-use-with-prompt-caching` | P2 | |
| | Compaction | `build-with-claude/compaction` | P1 | 对照 `compact_boundary` 处理 |
| | Token counting | `build-with-claude/token-counting` | — | |
| | Streaming Messages | `build-with-claude/streaming` | P1 | |
| | Fine-grained tool streaming | `agents-and-tools/tool-use/fine-grained-tool-streaming` | P2 | |
| | Streaming refusals | `test-and-evaluate/strengthen-guardrails/handle-streaming-refusals` | P2 | 流式中途拒绝的处理 |
| API Reference | Errors | `api/errors` | **P0** | 错误码 |
| | Rate limits | `api/rate-limits` | P1 | 429 处理 |
| | Service tiers | `api/service-tiers` | — | |
| Resources | Model cards | `resources/overview` | — | |

**有意排除**（按 PRD §3.7）：Managed Agents、Admin API、各语言 SDK 客户端用法、Messages API 端点参考、tool use 全系列、batch、files、prompt engineering 等。
llms.txt 里有、但**不在侧边栏**的旧地址（`extended-thinking`、`compaction-threshold` 等 5 个 compaction 子页、`thinking-*` 4 个子页）不单独列入。

---

## 3. 旧文档 → 新页面映射（用于 CHANGES 逐篇对比）

| 旧文件（`docs/md/`） | 新页面 | 变化 |
|---|---|---|
| `Claude Code NewSDK.md` | `agent-sdk/overview` | — |
| `Claude Code OldSDK.md` | `agent-sdk/migration-guide` | 旧版 SDK，仅做历史对照 |
| `NewSDK/Claude API Overview.md` | （API 概览，不在本次范围） | 建议只归档 |
| `NewSDK/Compaction.md` | `build-with-claude/compaction` | |
| `NewSDK/Custom Tools.md` | `agent-sdk/custom-tools` | |
| `NewSDK/Error Codes.md` | `api/errors` + `errors`（CLI） | 新增 CLI 侧错误页 |
| `NewSDK/Handling Permissions.md` | `agent-sdk/permissions` | |
| `NewSDK/Headless mode.md` | `headless`（改名为 "Programmatic usage"） | 改名 |
| `NewSDK/Hooks Guide.md` | `hooks-guide` + `agent-sdk/hooks` | |
| `NewSDK/MCP in the SDK.md` | `agent-sdk/mcp` | |
| `NewSDK/Models Reference.md` | `models/overview` + `model-config` | 旧文件是中文改写 |
| `NewSDK/Modifying system prompts.md` | `agent-sdk/modifying-system-prompts` | |
| `NewSDK/Prompt Caching.md` | `build-with-claude/prompt-caching` | |
| `NewSDK/Python SDK reference.md` | `agent-sdk/python` | |
| `NewSDK/Session Management.md` | `agent-sdk/sessions` | |
| `NewSDK/Skills.md` | `agent-sdk/skills` | |
| `NewSDK/Slash Commands in the SDK.md` | → `agent-sdk/skills` | **已合并**（原地址重定向） |
| `NewSDK/Streaming Input.md` | `agent-sdk/streaming-vs-single-mode` | |
| `NewSDK/Structured Outputs.md` | `agent-sdk/structured-outputs` | |
| `NewSDK/Subagents in the SDK.md` | `agent-sdk/subagents` | |
| `NewSDK/Thinking and Effort.md` | `build-with-claude/effort` + `build-with-claude/thinking` | 拆成两页 |
| `NewSDK/Todo Lists.md` | `agent-sdk/todo-tracking` | |
| `NewSDK/Tracking Costs and Usage.md` | `agent-sdk/cost-tracking` | |
| `NewSDK/TypeScript SDK reference.md` | `agent-sdk/typescript` | |
| `Claude-CLI-Context-Mechanism.md` | （我们自己写的，原位保留） | Phase 2 按 2.1.280 复核 |

---

## 4. 级别统计

| 级别 | Claude Code 站 | API 子集 | 合计 |
|---|---|---|---|
| **P0** | 22 | 14 | **36** |
| P1 | 38 | 12 | **50** |
| P2 | 41 | 13 | **54** |
| CL | 26 | — | **26** |
| —（不抓） | 70 | 7 | **77** |
| **合计** | **197** | **46** | **243** |

抓取范围 = P0 + P1 + P2 + CL = **166 页**（统计由脚本逐行计数得出），已于 2026-09-24 全部抓取，见 `INDEX.md`。
