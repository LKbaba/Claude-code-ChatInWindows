# 官方文档索引（2026-09 同步）

> 抓取日期：2026-09-24 ｜ CLI 基线：2.1.280 ｜ 共 **166** 页（P0 36 / P1 50 / P2 54 / CL 26），约 8.8 MB
> 范围依据：`_inventory-2026-09.md`（官方导航盘点，含未抓取页面及理由） ｜ 旧文档：`_archive/2026-03-30/`

## 说明

- **原文**：各目录下的文件 = 我们加的 front matter（来源 URL、抓取日期、CLI 基线、级别）+ 官方 Markdown 导出原文（URL 后加 `.md`），原文未做任何改动。
- **中文理解只写在这里和 CHANGES 文档里**，原文文件中不掺杂任何中文。
- **原文目录不进 git**：`claude-code/`、`agent-sdk/`、`api/` 已加入 `.gitignore`，只作本地离线参考，不随公开仓库发布。需要重新同步时，重跑 `.tmp-docsync/fetch-docs.js`。
- **完整性核验**：166 页全部 HTTP 200 + `text/markdown`；代码块围栏全部成对；3 页抽样（agent-sdk/mcp、agent-sdk/user-input、models/opus-5-5/migration-guide）逐个点开全部语言 Tab 后，页面渲染的不重复代码块数与 `.md` 完全一致（34/34、27/27、111/111）。其中 API 站只渲染当前 Tab（初始可见仅 15 个），证明按可见文本抓取会丢代码，`.md` 导出则完整。截图见 `CCimages/screenshots/docs-sync-2026-09/`。
- **级别**：P0 决定插件能否正常工作 ｜ P1 插件已有对应功能 ｜ P2 新玩法来源 ｜ CL 变更记录

## Claude Code（`code.claude.com/docs/en/`） — 96 页

| 级别 | 标题 | 本地文件 | 官方页面 | 说明 |
|---|---|---|---|---|
| P0 | CLI reference | [cli-reference.md](claude-code/cli-reference.md) | [链接](https://code.claude.com/docs/en/cli-reference) | 全部 CLI 命令与 flag。已核实：插件用的 10 个 flag 中 --mcp-server、--custom-instructions 在 2.1.280 文档里已不存在，其余 8 个仍在 |
| P0 | Explore the context window | [context-window.md](claude-code/context-window.md) | [链接](https://code.claude.com/docs/en/context-window) | 上下文窗口机制，直接关系上下文指示器（Gotcha #8） |
| P0 | Environment variables | [env-vars.md](claude-code/env-vars.md) | [链接](https://code.claude.com/docs/en/env-vars) | 全部环境变量 |
| P0 | Error reference | [errors.md](claude-code/errors.md) | [链接](https://code.claude.com/docs/en/errors) | 错误信息对照，如 `claude_code_version_too_old` |
| P0 | Run Claude Code programmatically | [headless.md](claude-code/headless.md) | [链接](https://code.claude.com/docs/en/headless) | headless / `-p` 模式，插件的运行方式 |
| P0 | Model configuration | [model-config.md](claude-code/model-config.md) | [链接](https://code.claude.com/docs/en/model-config) | 模型别名、1M、effort |
| P0 | Choose a permission mode | [permission-modes.md](claude-code/permission-modes.md) | [链接](https://code.claude.com/docs/en/permission-modes) | 替代 `--dangerously-skip-permissions` 的依据 |
| P0 | Configure permissions | [permissions.md](claude-code/permissions.md) | [链接](https://code.claude.com/docs/en/permissions) | 细粒度权限规则、权限模式与托管策略 |
| P0 | Settings files and precedence | [settings.md](claude-code/settings.md) | [链接](https://code.claude.com/docs/en/settings) | settings 层级与优先级 |
| P0 | All settings | [settings-reference.md](claude-code/settings-reference.md) | [链接](https://code.claude.com/docs/en/settings-reference) | 全部配置项 |
| P0 | Tools reference | [tools-reference.md](claude-code/tools-reference.md) | [链接](https://code.claude.com/docs/en/tools-reference) | 内置工具名/参数，插件的工具调用展示依赖它 |
| P1 | Authentication | [authentication.md](claude-code/authentication.md) | [链接](https://code.claude.com/docs/en/authentication) | API key / 登录方式，对照插件 API key 功能 |
| P1 | Checkpointing | [checkpointing.md](claude-code/checkpointing.md) | [链接](https://code.claude.com/docs/en/checkpointing) | 对照 UndoRedoManager |
| P1 | Explore the .claude directory | [claude-directory.md](claude-code/claude-directory.md) | [链接](https://code.claude.com/docs/en/claude-directory) | `.claude/` 目录结构，与插件读写 session/配置有关 |
| P1 | Commands | [commands.md](claude-code/commands.md) | [链接](https://code.claude.com/docs/en/commands) | 斜杠命令，对照插件的 slash command 列表 |
| P1 | Manage costs effectively | [costs.md](claude-code/costs.md) | [链接](https://code.claude.com/docs/en/costs) | 对照插件统计页 |
| P1 | Data usage | [data-usage.md](claude-code/data-usage.md) | [链接](https://code.claude.com/docs/en/data-usage) | Anthropic 数据使用政策（遥测、上报与关闭方式） |
| P1 | Debug your configuration | [debug-your-config.md](claude-code/debug-your-config.md) | [链接](https://code.claude.com/docs/en/debug-your-config) | 排查 CLAUDE.md / settings / hooks / MCP / skills 不生效（/context、/doctor 等） |
| P1 | Discover and install prebuilt plugins through marketplaces | [discover-plugins.md](claude-code/discover-plugins.md) | [链接](https://code.claude.com/docs/en/discover-plugins) | 对照插件的 PluginManager |
| P1 | Speed up responses with fast mode | [fast-mode.md](claude-code/fast-mode.md) | [链接](https://code.claude.com/docs/en/fast-mode) | CLI 中开启 fast mode 获得更快的 Opus 响应 |
| P1 | Run Claude Code through a gateway | [gateways.md](claude-code/gateways.md) | [链接](https://code.claude.com/docs/en/gateways) | 对照插件"Custom API Endpoint" |
| P1 | Hooks reference | [hooks.md](claude-code/hooks.md) | [链接](https://code.claude.com/docs/en/hooks) | hooks 完整参考：事件、配置结构、JSON 输入输出、退出码、HTTP/prompt hooks |
| P1 | Automate actions with hooks | [hooks-guide.md](claude-code/hooks-guide.md) | [链接](https://code.claude.com/docs/en/hooks-guide) | 对照 HooksConfigManager |
| P1 | Other LLM gateways | [llm-gateway.md](claude-code/llm-gateway.md) | [链接](https://code.claude.com/docs/en/llm-gateway) | 通过组织已有的 LLM 网关转发 Claude Code 流量（总览） |
| P1 | Connect Claude Code to an LLM gateway | [llm-gateway-connect.md](claude-code/llm-gateway-connect.md) | [链接](https://code.claude.com/docs/en/llm-gateway-connect) | 自定义 endpoint 的环境变量 |
| P1 | Claude Code gateway compatibility guide | [llm-gateway-protocol.md](claude-code/llm-gateway-protocol.md) | [链接](https://code.claude.com/docs/en/llm-gateway-protocol) | 网关协议兼容要求 |
| P1 | Connect Claude Code to tools via MCP | [mcp.md](claude-code/mcp.md) | [链接](https://code.claude.com/docs/en/mcp) | MCP 配置格式、scope，对照插件 MCP 双面板 |
| P1 | Connect to MCP servers | [mcp-quickstart.md](claude-code/mcp-quickstart.md) | [链接](https://code.claude.com/docs/en/mcp-quickstart) | 添加 MCP 服务器、验证连接、配置文件位置 |
| P1 | How Claude remembers your project | [memory.md](claude-code/memory.md) | [链接](https://code.claude.com/docs/en/memory) | CLAUDE.md / AGENTS.md 持久指令与自动记忆（auto memory） |
| P1 | Enterprise network configuration | [network-config.md](claude-code/network-config.md) | [链接](https://code.claude.com/docs/en/network-config) | 代理配置，插件 spawn 时会传代理环境变量 |
| P1 | Create plugins | [plugins.md](claude-code/plugins.md) | [链接](https://code.claude.com/docs/en/plugins) | 创建插件（打包 skills / agents / hooks / MCP） |
| P1 | Plugins reference | [plugins-reference.md](claude-code/plugins-reference.md) | [链接](https://code.claude.com/docs/en/plugins-reference) | 插件系统完整技术参考：schema、CLI 命令、组件规范 |
| P1 | How Claude Code uses prompt caching | [prompt-caching.md](claude-code/prompt-caching.md) | [链接](https://code.claude.com/docs/en/prompt-caching) | CLI 如何自动管理缓存：为何换模型会导致一轮无缓存、/compact 的代价等，直接关系计价 |
| P1 | Manage sessions | [sessions.md](claude-code/sessions.md) | [链接](https://code.claude.com/docs/en/sessions) | 会话管理，对照插件 resume |
| P1 | Example settings files | [settings-example.md](claude-code/settings-example.md) | [链接](https://code.claude.com/docs/en/settings-example) | 个人 / 团队 / 组织三种 settings.json 示例 |
| P1 | Advanced setup | [setup.md](claude-code/setup.md) | [链接](https://code.claude.com/docs/en/setup) | 安装/系统要求（含 Windows），对照 WindowsCompatibility |
| P1 | Extend Claude with skills | [skills.md](claude-code/skills.md) | [链接](https://code.claude.com/docs/en/skills) | 创建、管理、分享 skills（含自定义命令与内置 skills） |
| P1 | Create custom subagents | [sub-agents.md](claude-code/sub-agents.md) | [链接](https://code.claude.com/docs/en/sub-agents) | subagent 配置 |
| P1 | Use Claude Code in VS Code | [vs-code.md](claude-code/vs-code.md) | [链接](https://code.claude.com/docs/en/vs-code) | 官方 VS Code 扩展的安装与功能（inline diff、@ 引用、计划审阅），本插件的对照物 |
| P2 | Escalate hard decisions with the advisor tool | [advisor.md](claude-code/advisor.md) | [链接](https://code.claude.com/docs/en/advisor) | 主模型遇到关键决策时咨询更强的 advisor 模型 |
| P2 | Orchestrate teams of Claude Code sessions | [agent-teams.md](claude-code/agent-teams.md) | [链接](https://code.claude.com/docs/en/agent-teams) | 多个实例组队协作：共享任务、互相发消息 |
| P2 | Manage multiple agents with agent view | [agent-view.md](claude-code/agent-view.md) | [链接](https://code.claude.com/docs/en/agent-view) | 一屏管理多个会话、查看哪些需要输入 |
| P2 | Run agents in parallel | [agents.md](claude-code/agents.md) | [链接](https://code.claude.com/docs/en/agents) | 多任务并行方式对比：subagent、agent view、agent teams、dynamic workflows、projects |
| P2 | Share session output as artifacts | [artifacts.md](claude-code/artifacts.md) | [链接](https://code.claude.com/docs/en/artifacts) | 把会话产出变成 claude.ai 上可分享的交互页面 |
| P2 | Configure auto mode | [auto-mode-config.md](claude-code/auto-mode-config.md) | [链接](https://code.claude.com/docs/en/auto-mode-config) | auto 权限模式 |
| P2 | Best practices for Claude Code | [best-practices.md](claude-code/best-practices.md) | [链接](https://code.claude.com/docs/en/best-practices) | 使用技巧与模式，从环境配置到并行会话 |
| P2 | Push events into a running session with channels | [channels.md](claude-code/channels.md) | [链接](https://code.claude.com/docs/en/channels) | 通过 MCP 服务器向会话推送外部消息、告警、webhook |
| P2 | Channels reference | [channels-reference.md](claude-code/channels-reference.md) | [链接](https://code.claude.com/docs/en/channels-reference) | 编写向会话推送消息的 MCP 服务器：channel 协议参考 |
| P2 | Common workflows | [common-workflows.md](claude-code/common-workflows.md) | [链接](https://code.claude.com/docs/en/common-workflows) | 日常任务（读代码、修 bug、重构、测试）的操作指南 |
| P2 | Message your other Claude Code sessions | [cross-session-messaging.md](claude-code/cross-session-messaging.md) | [链接](https://code.claude.com/docs/en/cross-session-messaging) | 多会话玩法 |
| P2 | Launch sessions from links | [deep-links.md](claude-code/deep-links.md) | [链接](https://code.claude.com/docs/en/deep-links) | claude-cli:// 链接一键打开会话 |
| P2 | Feature availability | [feature-availability.md](claude-code/feature-availability.md) | [链接](https://code.claude.com/docs/en/feature-availability) | 各平台功能差异 |
| P2 | Extend Claude Code | [features-overview.md](claude-code/features-overview.md) | [链接](https://code.claude.com/docs/en/features-overview) | 扩展能力总览 |
| P2 | Glossary | [glossary.md](claude-code/glossary.md) | [链接](https://code.claude.com/docs/en/glossary) | 术语表：agentic loop、compaction、hooks、subagent 等 |
| P2 | Keep Claude working toward a goal | [goal.md](claude-code/goal.md) | [链接](https://code.claude.com/docs/en/goal) | /goal 设定完成条件，Claude 持续工作直到达成 |
| P2 | How Claude Code works | [how-claude-code-works.md](claude-code/how-claude-code-works.md) | [链接](https://code.claude.com/docs/en/how-claude-code-works) | 整体机制 |
| P2 | Interactive mode | [interactive-mode.md](claude-code/interactive-mode.md) | [链接](https://code.claude.com/docs/en/interactive-mode) | 主要是 TUI，但含内置命令说明 |
| P2 | Monitoring | [monitoring-usage.md](claude-code/monitoring-usage.md) | [链接](https://code.claude.com/docs/en/monitoring-usage) | OTEL |
| P2 | Output styles | [output-styles.md](claude-code/output-styles.md) | [链接](https://code.claude.com/docs/en/output-styles) | 切换 / 自定义输出风格（Concise、Explanatory 等） |
| P2 | Create and distribute a plugin marketplace | [plugin-marketplaces.md](claude-code/plugin-marketplaces.md) | [链接](https://code.claude.com/docs/en/plugin-marketplaces) | 搭建和托管插件市场 |
| P2 | Continue local sessions from any device with Remote Control | [remote-control.md](claude-code/remote-control.md) | [链接](https://code.claude.com/docs/en/remote-control) | 用手机/浏览器接管本地会话 |
| P2 | Configure the sandboxed Bash tool | [sandboxing.md](claude-code/sandboxing.md) | [链接](https://code.claude.com/docs/en/sandboxing) | Bash 沙箱：文件系统与网络隔离 |
| P2 | Run prompts on a schedule | [scheduled-tasks.md](claude-code/scheduled-tasks.md) | [链接](https://code.claude.com/docs/en/scheduled-tasks) | /loop 与 cron 工具：定时重复执行、轮询、一次性提醒 |
| P2 | Security | [security.md](claude-code/security.md) | [链接](https://code.claude.com/docs/en/security) | 安全防护机制与安全使用建议 |
| P2 | Customize your status line | [statusline.md](claude-code/statusline.md) | [链接](https://code.claude.com/docs/en/statusline) | 自定义状态栏：显示上下文用量、成本、git 状态 |
| P2 | Enterprise deployment overview | [third-party-integrations.md](claude-code/third-party-integrations.md) | [链接](https://code.claude.com/docs/en/third-party-integrations) | 企业部署：各云平台与第三方基础设施集成总览 |
| P2 | Troubleshoot installation and login | [troubleshoot-install.md](claude-code/troubleshoot-install.md) | [链接](https://code.claude.com/docs/en/troubleshoot-install) | Windows 安装问题 |
| P2 | Troubleshooting | [troubleshooting.md](claude-code/troubleshooting.md) | [链接](https://code.claude.com/docs/en/troubleshooting) | CPU/内存占用高、卡死、auto-compact 反复触发等性能问题排查 |
| P2 | Orchestrate subagents at scale with dynamic workflows | [workflows.md](claude-code/workflows.md) | [链接](https://code.claude.com/docs/en/workflows) | 由 Claude 生成可重跑脚本、编排大量 subagent 的动态工作流 |
| P2 | Run parallel sessions with worktrees | [worktrees.md](claude-code/worktrees.md) | [链接](https://code.claude.com/docs/en/worktrees) | 用 git worktree 隔离并行会话（--worktree 等） |
| CL | Claude Code changelog | [changelog.md](claude-code/changelog.md) | [链接](https://code.claude.com/docs/en/changelog) | CLI 按版本的变更记录；查模型最低 CLI 版本、flag 增删的第一来源 |
| CL | Week 13 · March 23–27, 2026 | [whats-new__2026-w13.md](claude-code/whats-new__2026-w13.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w13) | 官方周报 2026 第 13 周：该周新功能与变化 |
| CL | Week 14 · March 30 – April 3, 2026 | [whats-new__2026-w14.md](claude-code/whats-new__2026-w14.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w14) | 官方周报 2026 第 14 周：该周新功能与变化 |
| CL | Week 15 · April 6–10, 2026 | [whats-new__2026-w15.md](claude-code/whats-new__2026-w15.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w15) | 官方周报 2026 第 15 周：该周新功能与变化 |
| CL | Week 16 · April 13–17, 2026 | [whats-new__2026-w16.md](claude-code/whats-new__2026-w16.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w16) | 官方周报 2026 第 16 周：该周新功能与变化 |
| CL | Week 17 · April 20–24, 2026 | [whats-new__2026-w17.md](claude-code/whats-new__2026-w17.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w17) | 官方周报 2026 第 17 周：该周新功能与变化 |
| CL | Week 18 · April 27 – May 1, 2026 | [whats-new__2026-w18.md](claude-code/whats-new__2026-w18.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w18) | 官方周报 2026 第 18 周：该周新功能与变化 |
| CL | Week 19 · May 4–8, 2026 | [whats-new__2026-w19.md](claude-code/whats-new__2026-w19.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w19) | 官方周报 2026 第 19 周：该周新功能与变化 |
| CL | Week 20 · May 11–15, 2026 | [whats-new__2026-w20.md](claude-code/whats-new__2026-w20.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w20) | 官方周报 2026 第 20 周：该周新功能与变化 |
| CL | Week 21 · May 18–22, 2026 | [whats-new__2026-w21.md](claude-code/whats-new__2026-w21.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w21) | 官方周报 2026 第 21 周：该周新功能与变化 |
| CL | Week 22 · May 25–29, 2026 | [whats-new__2026-w22.md](claude-code/whats-new__2026-w22.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w22) | 官方周报 2026 第 22 周：该周新功能与变化 |
| CL | Week 23 · June 1–5, 2026 | [whats-new__2026-w23.md](claude-code/whats-new__2026-w23.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w23) | 官方周报 2026 第 23 周：该周新功能与变化 |
| CL | Week 24 · June 8–12, 2026 | [whats-new__2026-w24.md](claude-code/whats-new__2026-w24.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w24) | 官方周报 2026 第 24 周：该周新功能与变化 |
| CL | Week 25 · June 15–19, 2026 | [whats-new__2026-w25.md](claude-code/whats-new__2026-w25.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w25) | 官方周报 2026 第 25 周：该周新功能与变化 |
| CL | Week 26 · June 22–26, 2026 | [whats-new__2026-w26.md](claude-code/whats-new__2026-w26.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w26) | 官方周报 2026 第 26 周：该周新功能与变化 |
| CL | Week 27 · June 29 – July 3, 2026 | [whats-new__2026-w27.md](claude-code/whats-new__2026-w27.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w27) | 官方周报 2026 第 27 周：该周新功能与变化 |
| CL | Week 28 · July 6–10, 2026 | [whats-new__2026-w28.md](claude-code/whats-new__2026-w28.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w28) | 官方周报 2026 第 28 周：该周新功能与变化 |
| CL | Week 29 · July 13–17, 2026 | [whats-new__2026-w29.md](claude-code/whats-new__2026-w29.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w29) | 官方周报 2026 第 29 周：该周新功能与变化 |
| CL | Week 30 · July 20–24, 2026 | [whats-new__2026-w30.md](claude-code/whats-new__2026-w30.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w30) | 官方周报 2026 第 30 周：该周新功能与变化 |
| CL | Week 32 · August 3–7, 2026 | [whats-new__2026-w32.md](claude-code/whats-new__2026-w32.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w32) | 官方周报 2026 第 32 周：该周新功能与变化 |
| CL | Week 33 · August 10–14, 2026 | [whats-new__2026-w33.md](claude-code/whats-new__2026-w33.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w33) | 官方周报 2026 第 33 周：该周新功能与变化 |
| CL | Week 34 · August 17–21, 2026 | [whats-new__2026-w34.md](claude-code/whats-new__2026-w34.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w34) | 官方周报 2026 第 34 周：该周新功能与变化 |
| CL | Week 35 · August 24–28, 2026 | [whats-new__2026-w35.md](claude-code/whats-new__2026-w35.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w35) | 官方周报 2026 第 35 周：该周新功能与变化 |
| CL | Week 36 · August 31 – September 4, 2026 | [whats-new__2026-w36.md](claude-code/whats-new__2026-w36.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w36) | 官方周报 2026 第 36 周：该周新功能与变化 |
| CL | Week 37 · September 7–11, 2026 | [whats-new__2026-w37.md](claude-code/whats-new__2026-w37.md) | [链接](https://code.claude.com/docs/en/whats-new/2026-w37) | 官方周报 2026 第 37 周：该周新功能与变化 |
| CL | What's new | [whats-new__index.md](claude-code/whats-new__index.md) | [链接](https://code.claude.com/docs/en/whats-new/index) | `whats-new` |

## Agent SDK（`code.claude.com/docs/en/agent-sdk/`） — 31 页

| 级别 | 标题 | 本地文件 | 官方页面 | 说明 |
|---|---|---|---|---|
| P0 | How the agent loop works | [agent-loop.md](agent-sdk/agent-loop.md) | [链接](https://code.claude.com/docs/en/agent-sdk/agent-loop) | 消息流转顺序 |
| P0 | Configure your agent | [configuration.md](agent-sdk/configuration.md) | [链接](https://code.claude.com/docs/en/agent-sdk/configuration) | Options ↔ CLI flag 对应 |
| P0 | Track cost and usage | [cost-tracking.md](agent-sdk/cost-tracking.md) | [链接](https://code.claude.com/docs/en/agent-sdk/cost-tracking) | usage 字段，MessageProcessor 的 token/成本计算依赖它 |
| P0 | Modifying system prompts | [modifying-system-prompts.md](agent-sdk/modifying-system-prompts.md) | [链接](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts) | 插件用 `--append-system-prompt` |
| P0 | Agent SDK overview | [overview.md](agent-sdk/overview.md) | [链接](https://code.claude.com/docs/en/agent-sdk/overview) | Agent SDK 总览：把 Claude Code 当库来用 |
| P0 | Configure permissions | [permissions.md](agent-sdk/permissions.md) | [链接](https://code.claude.com/docs/en/agent-sdk/permissions) | 权限模式、hooks、allow/deny 规则控制工具使用 |
| P0 | Work with sessions | [sessions.md](agent-sdk/sessions.md) | [链接](https://code.claude.com/docs/en/agent-sdk/sessions) | resume / fork |
| P0 | Stream responses in real-time | [streaming-output.md](agent-sdk/streaming-output.md) | [链接](https://code.claude.com/docs/en/agent-sdk/streaming-output) | 流式输出、partial messages |
| P0 | Streaming Input | [streaming-vs-single-mode.md](agent-sdk/streaming-vs-single-mode.md) | [链接](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) | `--input-format stream-json` |
| P0 | Agent SDK reference - TypeScript | [typescript.md](agent-sdk/typescript.md) | [链接](https://code.claude.com/docs/en/agent-sdk/typescript) | TypeScript SDK 完整 API 参考，含全部消息类型（stream-json 协议说明书） |
| P0 | Handle approvals and user input | [user-input.md](agent-sdk/user-input.md) | [链接](https://code.claude.com/docs/en/agent-sdk/user-input) | 权限请求交互 |
| P1 | Use Claude Code features in the SDK | [claude-code-features.md](agent-sdk/claude-code-features.md) | [链接](https://code.claude.com/docs/en/agent-sdk/claude-code-features) | 在 SDK 中加载项目指令、skills、hooks 等 Claude Code 功能 |
| P1 | Rewind file changes with checkpointing | [file-checkpointing.md](agent-sdk/file-checkpointing.md) | [链接](https://code.claude.com/docs/en/agent-sdk/file-checkpointing) | 对照 UndoRedoManager |
| P1 | Intercept and control agent behavior with hooks | [hooks.md](agent-sdk/hooks.md) | [链接](https://code.claude.com/docs/en/agent-sdk/hooks) | SDK 中用 hooks 拦截和定制关键执行节点 |
| P1 | Connect to external tools with MCP | [mcp.md](agent-sdk/mcp.md) | [链接](https://code.claude.com/docs/en/agent-sdk/mcp) | SDK 中配置 MCP：传输类型、tool search、认证、错误处理 |
| P1 | Migrate to Claude Agent SDK | [migration-guide.md](agent-sdk/migration-guide.md) | [链接](https://code.claude.com/docs/en/agent-sdk/migration-guide) | 从 Claude Code SDK 迁移到 Claude Agent SDK |
| P1 | Plugins in the SDK | [plugins.md](agent-sdk/plugins.md) | [链接](https://code.claude.com/docs/en/agent-sdk/plugins) | SDK 中加载插件 |
| P1 | Agent SDK reference - Python | [python.md](agent-sdk/python.md) | [链接](https://code.claude.com/docs/en/agent-sdk/python) | 与 TS 版类型基本重复，用于核对 |
| P1 | Extend agents with skills | [skills.md](agent-sdk/skills.md) | [链接](https://code.claude.com/docs/en/agent-sdk/skills) | 已吸收旧的 Slash Commands 页 |
| P1 | Subagents in the SDK | [subagents.md](agent-sdk/subagents.md) | [链接](https://code.claude.com/docs/en/agent-sdk/subagents) | SDK 中定义和调用 subagent：隔离上下文、并行执行 |
| P1 | Track todos | [todo-tracking.md](agent-sdk/todo-tracking.md) | [链接](https://code.claude.com/docs/en/agent-sdk/todo-tracking) | 跟踪 todo 并在应用中渲染进度（对照插件 todo 展示） |
| P2 | Give Claude custom tools | [custom-tools.md](agent-sdk/custom-tools.md) | [链接](https://code.claude.com/docs/en/agent-sdk/custom-tools) | 用进程内 MCP 服务器定义自定义工具 |
| P2 | Examples | [examples.md](agent-sdk/examples.md) | [链接](https://code.claude.com/docs/en/agent-sdk/examples) | 可运行的示例项目与 Cookbook 索引 |
| P2 | Hosting the Agent SDK | [hosting.md](agent-sdk/hosting.md) | [链接](https://code.claude.com/docs/en/agent-sdk/hosting) | 生产部署：子进程架构、会话持久化、扩展与多租户隔离 |
| P2 | Observability with OpenTelemetry | [observability.md](agent-sdk/observability.md) | [链接](https://code.claude.com/docs/en/agent-sdk/observability) | 用 OpenTelemetry 导出 trace / 指标 / 事件 |
| P2 | Quickstart | [quickstart.md](agent-sdk/quickstart.md) | [链接](https://code.claude.com/docs/en/agent-sdk/quickstart) | Python / TypeScript SDK 快速上手 |
| P2 | Securely deploying AI agents | [secure-deployment.md](agent-sdk/secure-deployment.md) | [链接](https://code.claude.com/docs/en/agent-sdk/secure-deployment) | 安全部署：隔离、凭据管理、网络控制 |
| P2 | Persist sessions to external storage | [session-storage.md](agent-sdk/session-storage.md) | [链接](https://code.claude.com/docs/en/agent-sdk/session-storage) | 把会话记录镜像到外部存储，支持跨主机 resume |
| P2 | Get structured output from agents | [structured-outputs.md](agent-sdk/structured-outputs.md) | [链接](https://code.claude.com/docs/en/agent-sdk/structured-outputs) | 用 JSON Schema / Zod / Pydantic 返回校验过的结构化结果 |
| P2 | Scale to many tools with tool search | [tool-search.md](agent-sdk/tool-search.md) | [链接](https://code.claude.com/docs/en/agent-sdk/tool-search) | 按需发现和加载工具，支持海量工具 |
| P2 | Troubleshoot the Agent SDK | [troubleshooting.md](agent-sdk/troubleshooting.md) | [链接](https://code.claude.com/docs/en/agent-sdk/troubleshooting) | 按报错信息查原因与修复（TS / Python） |

## Claude API 子集（`platform.claude.com/docs/en/`） — 39 页

| 级别 | 标题 | 本地文件 | 官方页面 | 说明 |
|---|---|---|---|---|
| P0 | Model IDs and versioning | [about-claude__models__model-ids-and-versions.md](api/about-claude__models__model-ids-and-versions.md) | [链接](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions) | 模型 ID 与别名 |
| P0 | Pricing | [about-claude__pricing.md](api/about-claude__pricing.md) | [链接](https://platform.claude.com/docs/en/about-claude/pricing) | 计价表的依据（含 cache read/write、5m/1h） |
| P0 | Claude API errors | [api__errors.md](api/api__errors.md) | [链接](https://platform.claude.com/docs/en/api/errors) | 错误码 |
| P0 | Context windows | [build-with-claude__context-windows.md](api/build-with-claude__context-windows.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/context-windows) | 1M 窗口 |
| P0 | Effort | [build-with-claude__effort.md](api/build-with-claude__effort.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/effort) | Backlog B1 |
| P0 | Request 2 caches its request content (not the response) | [build-with-claude__prompt-caching.md](api/build-with-claude__prompt-caching.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) | Backlog B3 缓存计价 |
| P0 | Thinking | [build-with-claude__thinking.md](api/build-with-claude__thinking.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/thinking) | 插件的思考强度设置 |
| P0 | Claude Fable 5.1 | [models__fable-5-1__overview.md](api/models__fable-5-1__overview.md) | [链接](https://platform.claude.com/docs/en/models/fable-5-1/overview) | 插件已支持 |
| P0 | What's new in Claude Fable 5.1 | [models__fable-5-1__whats-new-fable-5-1.md](api/models__fable-5-1__whats-new-fable-5-1.md) | [链接](https://platform.claude.com/docs/en/models/fable-5-1/whats-new-fable-5-1) | Fable 5.1 新特性 |
| P0 | Migrating to Claude Opus 5.5 | [models__opus-5-5__migration-guide.md](api/models__opus-5-5__migration-guide.md) | [链接](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide) | 迁移到 Opus 5.5 的注意事项 |
| P0 | Claude Opus 5.5 | [models__opus-5-5__overview.md](api/models__opus-5-5__overview.md) | [链接](https://platform.claude.com/docs/en/models/opus-5-5/overview) | 插件已支持（llms.txt 缺失此页） |
| P0 | What's new in Claude Opus 5.5 | [models__opus-5-5__whats-new-opus-5-5.md](api/models__opus-5-5__whats-new-opus-5-5.md) | [链接](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5) | Opus 5.5 新特性（effort 等官方技巧） |
| P0 | Models overview | [models__overview.md](api/models__overview.md) | [链接](https://platform.claude.com/docs/en/models/overview) | 模型总表 |
| P0 | Claude Sonnet 5 | [models__sonnet-5__overview.md](api/models__sonnet-5__overview.md) | [链接](https://platform.claude.com/docs/en/models/sonnet-5/overview) | 插件已支持 |
| P1 | Model deprecations | [about-claude__model-deprecations.md](api/about-claude__model-deprecations.md) | [链接](https://platform.claude.com/docs/en/about-claude/model-deprecations) | 退役时间表，决定何时隐藏旧模型 |
| P1 | Rate limits | [api__rate-limits.md](api/api__rate-limits.md) | [链接](https://platform.claude.com/docs/en/api/rate-limits) | 429 处理 |
| P1 | Compaction overview | [build-with-claude__compaction.md](api/build-with-claude__compaction.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/compaction) | 对照 `compact_boundary` 处理 |
| P1 | Fast mode (research preview) | [build-with-claude__fast-mode.md](api/build-with-claude__fast-mode.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/fast-mode) | API 侧 fast mode：Opus 输出速度最高 2.5 倍 |
| P1 | Streaming messages | [build-with-claude__streaming.md](api/build-with-claude__streaming.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/streaming) | Messages API 的 SSE 流式事件（文本、工具、thinking 增量） |
| P1 | Or, for the Project Glasswing model with the same capabilities: | [models__fable-5-1__migration-guide.md](api/models__fable-5-1__migration-guide.md) | [链接](https://platform.claude.com/docs/en/models/fable-5-1/migration-guide) | 迁移到 Fable 5.1 的注意事项 |
| P1 | Claude Fable 5 | [models__fable-5__overview.md](api/models__fable-5__overview.md) | [链接](https://platform.claude.com/docs/en/models/fable-5/overview) | 插件已支持 |
| P1 | Claude Haiku 4.5 | [models__haiku-4-5__overview.md](api/models__haiku-4-5__overview.md) | [链接](https://platform.claude.com/docs/en/models/haiku-4-5/overview) | 插件已支持 |
| P1 | Claude Opus 4.8 | [models__opus-4-8__overview.md](api/models__opus-4-8__overview.md) | [链接](https://platform.claude.com/docs/en/models/opus-4-8/overview) | 插件已支持 |
| P1 | Claude Sonnet 4.6 | [models__sonnet-4-6__overview.md](api/models__sonnet-4-6__overview.md) | [链接](https://platform.claude.com/docs/en/models/sonnet-4-6/overview) | 插件已支持 |
| P1 | Sonnet migration | [models__sonnet-5__migration-guide.md](api/models__sonnet-5__migration-guide.md) | [链接](https://platform.claude.com/docs/en/models/sonnet-5/migration-guide) | 迁移到 Sonnet 5 的注意事项 |
| P1 | What's new in Claude Sonnet 5 | [models__sonnet-5__whats-new-sonnet-5.md](api/models__sonnet-5__whats-new-sonnet-5.md) | [链接](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5) | Sonnet 5 新特性 |
| P2 | Choosing the right model | [about-claude__models__choosing-a-model.md](api/about-claude__models__choosing-a-model.md) | [链接](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model) | 如何在能力、速度、成本之间选模型 |
| P2 | Migration guides | [about-claude__models__migration-guide.md](api/about-claude__models__migration-guide.md) | [链接](https://platform.claude.com/docs/en/about-claude/models/migration-guide) | 各模型迁移指南的索引页 |
| P2 | Optimizing for cost and intelligence | [about-claude__models__optimizing-for-cost-and-intelligence.md](api/about-claude__models__optimizing-for-cost-and-intelligence.md) | [链接](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence) | 缓存、effort、模型选择等降本策略的实测数据 |
| P2 | Fine-grained tool streaming | [agents-and-tools__tool-use__fine-grained-tool-streaming.md](api/agents-and-tools__tool-use__fine-grained-tool-streaming.md) | [链接](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming) | 工具输入的细粒度流式传输 |
| P2 | Tool use with prompt caching | [agents-and-tools__tool-use__tool-use-with-prompt-caching.md](api/agents-and-tools__tool-use__tool-use-with-prompt-caching.md) | [链接](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching) | 工具定义的缓存及失效原因 |
| P2 | Cache diagnostics | [build-with-claude__cache-diagnostics.md](api/build-with-claude__cache-diagnostics.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics) | 诊断缓存未命中：对比相邻请求找出前缀分歧点 |
| P2 | Build an orchestration mode | [build-with-claude__mid-conversation-effort-example.md](api/build-with-claude__mid-conversation-effort-example.md) | [链接](https://platform.claude.com/docs/en/build-with-claude/mid-conversation-effort-example) | 会话中途切换 effort 的示例 |
| P2 | Introducing Claude Fable 5 and Claude Mythos 5 | [models__fable-5__introducing-claude-fable-5-and-claude-mythos-5.md](api/models__fable-5__introducing-claude-fable-5-and-claude-mythos-5.md) | [链接](https://platform.claude.com/docs/en/models/fable-5/introducing-claude-fable-5-and-claude-mythos-5) | Fable 5 / Mythos 5 发布介绍 |
| P2 | From Haiku 3.5 | [models__haiku-4-5__migration-guide.md](api/models__haiku-4-5__migration-guide.md) | [链接](https://platform.claude.com/docs/en/models/haiku-4-5/migration-guide) | 迁移到 Haiku 4.5 |
| P2 | Claude Mythos 5.1 | [models__mythos-5-1__overview.md](api/models__mythos-5-1__overview.md) | [链接](https://platform.claude.com/docs/en/models/mythos-5-1/overview) | 邀请制 |
| P2 | Claude Mythos 5 | [models__mythos-5__overview.md](api/models__mythos-5__overview.md) | [链接](https://platform.claude.com/docs/en/models/mythos-5/overview) | 邀请制 |
| P2 | Claude Opus 5 | [models__opus-5__overview.md](api/models__opus-5__overview.md) | [链接](https://platform.claude.com/docs/en/models/opus-5/overview) | 插件未支持，Phase 2 可评估 |
| P2 | Handle streaming refusals | [test-and-evaluate__strengthen-guardrails__handle-streaming-refusals.md](api/test-and-evaluate__strengthen-guardrails__handle-streaming-refusals.md) | [链接](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/handle-streaming-refusals) | 流式中途拒绝的处理 |

## 待办

- [x] ~~`CHANGES-2026-03-to-09.md`~~：改由对比报告 `specs/SDK功能对比-2026-09.html` 承担（2026-09-24）；旧文档 → 新页面映射见 `_inventory-2026-09.md` §3
