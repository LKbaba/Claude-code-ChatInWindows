# Claude Code GUI / ChatUI — VS Code 插件

**Claude Code ChatUI** 是 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 的全功能 GUI 界面插件，支持 VS Code 和 Cursor。**Windows 原生运行（无需 WSL）**，同时支持 **macOS**。兼容官方 Anthropic 账号和**第三方 API**（GUI 界面配置）。核心功能：**MCP 插件管理**、**Skills 系统**、**Hooks 系统**、**实时 Token 消耗追踪**、AI 助手集成（Gemini + Grok），支持中英文界面。持续活跃更新，已有 236+ commits。

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">

  <!-- Badges -->
  <a href="https://marketplace.visualstudio.com/items?itemName=lkbaba.claude-code-chatui"><img src="https://img.shields.io/visual-studio-marketplace/i/lkbaba.claude-code-chatui" alt="VS Code Marketplace 安装量"></a> <a href="https://github.com/LKbaba/Claude-code-ChatInWindows"><img src="https://img.shields.io/github/stars/LKbaba/Claude-code-ChatInWindows.svg" alt="GitHub Stars"></a> <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.94-blue" alt="VS Code ≥ 1.94"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a> <a href="https://www.microsoft.com/windows"><img src="https://img.shields.io/badge/Windows-10%20%7C%2011-blue" alt="Windows 10/11"></a> <a href="https://www.apple.com/macos/"><img src="https://img.shields.io/badge/macOS-支持-blue" alt="macOS 支持"></a> <a href="https://cursor.sh/"><img src="https://img.shields.io/badge/Cursor-兼容-purple" alt="Cursor 兼容"></a>
</div>

**🌐 语言: [English](./README.md) | 简体中文 | [繁體中文](./README.zh-TW.md)**

---

## 为什么选择这个插件？

| 功能 | 官方 Claude Code | Claude Code GUI (MaheshKok) | Claude Code UI (AuraTech) | **本项目** |
|------|-----------------|---------------------------|--------------------------|-----------|
| Windows 免 WSL | ❌ 需要配置 | ❌ 需要 CLI 配置 | WSL 路径映射 | ✅ **原生支持** |
| 第三方 API GUI 配置 | ❌ | ❌ | ❌ | ✅ **独有** |
| MCP 插件 GUI 管理 | 仅 CLI 级别 | ✅ MCP Hub | ✅ MCP 命令 | ✅ GUI 配置（全局 + 工作区） |
| Skills 系统 GUI | 仅 CLI 级别 | ❌ | ❌ | ✅ **独有** |
| Hooks 系统 GUI | 仅 CLI 级别 | ❌ | ❌ | ✅ **独有** |
| AI 助手集成 | ❌ | ❌ | ❌ | ✅ Gemini + Grok |
| 实时 Token 追踪 | ❌ | ✅ 用量仪表盘 | ✅ 成本追踪 | ✅ |
| macOS 支持 | ✅ | ✅ | ✅ | ✅ |
| npm + 原生安装器 | ✅ | ✅ | ✅ | ✅ |
| 持续活跃更新 | ✅ | ✅ | ✅ | ✅ (236+ commits) |

---

## 📸 界面预览

[![主界面](docs/assets/ui.png)](docs/assets/ui.png)

## 📅 更新历史

| 版本 | 日期 | 亮点 |
|------|------|------|
| **v4.1.0** | 2026-04-16 | Opus 4.7 模型支持；xHigh 思考强度；/ultrareview 命令；Compute Mode 恢复 bug 修复 |
| **v4.0.10** | 2026-04-13 | 修复 Cursor 历史切换闪退；修复历史面板 XSS 注入 |
| **v4.0.9** | 2026-04-02 | 项目元数据重写，提升 AI 搜索可发现性 |
| **v4.0.8** | 2026-04-02 | Codex MCP 模板，CLAUDE.md 条件注入 |
| **v4.0.7** | 2026-04-02 | 流解析器升级：6 项 bug 修复，新 CLI 消息类型 |
| **v4.0.5** | 2026-03-30 | AI 助手面板：Grok + Vertex AI 支持；macOS 滚动修复 |
| **v4.0.2** | 2026-03-28 | Hooks GUI 管理面板：26 事件类型、4 类型、5 模板 |
| **v3.1.9** | 2026-03-29 | CSP 安全策略、XSS 修复、Windows 孤儿进程清理 |
| **v3.1.8** | 2026-03-12 | Grok MCP 模板，默认模型 → Sonnet 4.6 |
| **v3.1.7** | 2026-02-18 | Claude Sonnet 4.6 模型支持 |
| **v3.1.4** | 2026-01-29 | 新增 macOS 平台支持 |
| **v3.1.0** | 2026-01-13 | Skills 面板：复制、启用/禁用、插件保护 |
| **v2.0.0** | — | 全新 UI 设计、统计面板、自定义 API 端点 |

完整记录请查看 [CHANGELOG.md](./CHANGELOG.md)。

## 📚 推荐教程

> 🔥 **小白必看！** 如果你是第一次接触 Claude Code，强烈推荐阅读这篇保姆级教程：
>
> **[写给小白的 Claude Code 安装教程（国内直用，Windows 可用）](https://x.com/Gorden_Sun/status/2011837126263112117)** - by [@Gorden_Sun](https://x.com/Gorden_Sun)
>
> 这篇教程详细讲解了从零开始安装 Claude Code 的全过程，包括环境配置、第三方 API 使用等，全程约 30 分钟即可上手。

## 🚀 快速开始

### 第 1 步：环境准备

1. 安装 [Git for Windows](https://git-scm.com/)（自带 Git Bash）
2. 安装 [Node.js](https://nodejs.org/)（推荐 LTS 版本，≥ 18）
3. 以**管理员权限**打开 PowerShell，设置环境变量：

```powershell
setx SHELL "C:\Program Files\Git\bin\bash.exe"
```

1. **重启电脑**（必须重启才能生效）

---

### 第 2 步：安装 Claude Code CLI

重启电脑后，打开新的终端窗口：

```powershell
npm install -g @anthropic-ai/claude-code
```

---

> ⚠️ **VPN 用户**：整个安装和使用过程请确保开启 **TUN 模式**，否则可能无法连接 Claude 服务。

### 第 3 步：登录 Claude Code

#### 使用官方账号

```powershell
claude
```

浏览器会自动打开授权页面，登录后复制 Token 粘贴回终端即可。

#### 使用 🔑 第三方 API 配置

如果你使用第三方 API，需要在插件内进行配置：

1. 按 `Ctrl+Shift+C` 打开聊天界面
2. 点击右上角的设置按钮 ⚙️
3. 勾选 **"Use Custom API Endpoint"**
4. 在 **API Key** 栏填写你的密钥（如 `sk-ant-xxxxxxxxxx`）
5. 在 **Base URL** 栏填写 API 地址（如 `https://v3.codesome.cn`）
6. 设置会自动保存，左下角提示 "Settings updated successfully" 即配置成功

[![API 配置](docs/assets/api.png)](docs/assets/api.png)

**切换回官方账号**：取消勾选 "Use Custom API Endpoint" 即可。

> 💡 **提示**：
>
> - 如果 API 密钥错误，聊天会一直显示 "processing" 直到超时
> - 可以随时通过配置开关在官方账号和第三方 API 之间切换

---

> 💡 本插件支持各种第三方 API 服务（如 [v3.codesome.cn](https://v3.codesome.cn)、[openrouter.ai](https://openrouter.ai)），具体 URL 请咨询你的 API 供应商。

---

### 第 4 步：安装插件

#### ✨ 方式一：VS Code 市场安装（推荐）

1. 打开 VS Code 或 Cursor
2. 按 `Ctrl+Shift+X` 打开扩展面板
3. 搜索 `Claude-Code ChatUI` 或 `lkbaba`
4. 点击 **安装**

**直达链接：** [**➡️ VS Code 市场**](https://marketplace.visualstudio.com/items?itemName=lkbaba.claude-code-chatui)

#### 📦 方式二：GitHub Release 下载

1. [**🔗 前往 Releases 页面**](https://github.com/LKbaba/Claude-code-ChatInWindows/releases/latest)
2. 下载 `.vsix` 文件
3. VS Code 中按 `Ctrl+Shift+P`，选择 **"扩展: 从 VSIX 安装..."**

#### 🛠️ 方式三：从源码构建

```powershell
git clone https://github.com/LKbaba/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows
npm install
npm run package
# 生成的 .vsix 文件在项目根目录，按方式二安装即可
```

---

### 第 5 步：开始使用

- **打开聊天界面**：按快捷键 `Ctrl+Shift+C`
- **文件浏览器图标**：新建文件夹按钮旁边有图标，点击即可

## ❓ 常见问题

<details>
<summary><strong>Q: 遇到 "No suitable shell found" 错误？</strong></summary>

1. 确保已安装 Git for Windows
2. 以管理员权限运行：`setx SHELL "C:\Program Files\Git\bin\bash.exe"`
3. **重启电脑**（必须重启才能生效）

如果问题仍然存在，尝试：

1. 打开系统环境变量设置（Win + X → 系统 → 高级系统设置 → 环境变量）
2. 确保 PATH 中有 `C:\Program Files\Git\cmd`
3. 重启电脑

</details>

<details>
<summary><strong>Q: 配置了第三方 API 但聊天没有响应？</strong></summary>

Claude Code CLI 有点时候需要先在命令行初始化。请在 PowerShell 中运行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$Env:ANTHROPIC_API_KEY  = "sk-xxxxxxxxxxxxxxxxxxxxxxxx"
$Env:ANTHROPIC_BASE_URL = "https://v3.codesome.cn"
claude
```

如仍有问题，尝试更新 Claude Code CLI：

```powershell
npm install -g @anthropic-ai/claude-code@latest
```

</details>

<details>
<summary><strong>Q: 电脑重启后第三方 API 失效？</strong></summary>

环境变量 `$Env:ANTHROPIC_API_KEY` 和 `$Env:ANTHROPIC_BASE_URL` 是临时设置，电脑重启后会失效。

有两种解决方案：

**方案一**：每次重启后重新设置

```powershell
$Env:ANTHROPIC_API_KEY  = "你的 API Key"
$Env:ANTHROPIC_BASE_URL = "https://v3.codesome.cn"
claude
```

**方案二**：设置为永久环境变量（以管理员权限运行）

```powershell
setx ANTHROPIC_API_KEY "你的 API Key"
setx ANTHROPIC_BASE_URL "https://v3.codesome.cn"
# 重启电脑后生效
```

</details>

<details>
<summary><strong>Q: 遇到 "rg: command not found" 错误？</strong></summary>

这是可选的，不影响正常使用。如果想安装 ripgrep 以获得更好的搜索性能：

```bash
# 在 Git Bash 中：
curl -L https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep-14.1.0-x86_64-pc-windows-msvc.zip -o ripgrep.zip
unzip ripgrep.zip && mkdir -p ~/bin
cp ripgrep-14.1.0-x86_64-pc-windows-msvc/rg.exe ~/bin/
echo 'alias rg="~/bin/rg"' >> ~/.bashrc && source ~/.bashrc
```

注意：扩展内置的 Grep 工具即使没有 ripgrep 也能正常工作。
</details>

<details>
<summary><strong>Q: Claude 编辑文件时遇到 "File has been unexpectedly modified" 错误？</strong></summary>

这个错误通常是因为 VS Code/Cursor 的**自动保存**功能在 Claude 读取和编辑文件之间修改了文件。

**解决方案：关闭自动保存**

在 VS Code/Cursor 设置 (`settings.json`) 中添加：

```json
"files.autoSave": "off"
```

或者使用更温和的选项：

```json
"files.autoSave": "onWindowChange"
```

**为什么会发生这个问题：**

1. Claude 读取文件并存储内容哈希值
2. 自动保存触发，修改了磁盘上的文件
3. Claude 尝试编辑文件，但哈希值不再匹配
4. Claude 报告 "File has been unexpectedly modified"

**其他可能导致此问题的设置：**

- `editor.formatOnSave: true` - 保存时格式化会修改文件内容
- `files.trimTrailingWhitespace: true` - 保存时删除行尾空格
- `files.insertFinalNewline: true` - 保存时在文件末尾添加换行符

如果你需要这些功能，可以考虑在使用 Claude Code 时临时禁用它们。

</details>

---

## 🤝 如何参与贡献

1. Fork 本项目，创建独立分支
2. 聚焦一个新功能或痛点优化
3. 在真实 Windows 环境充分测试
4. 提交 Pull Request，描述清晰易懂

欢迎所有 Windows 上的 AI 工程师、开发者、极客加入！

---

## 📝 开源许可证

本项目基于 **MIT 协议** 开源。详见 [LICENSE](LICENSE)。

---

## 🙏 致谢

- **andrepimenta** – 原始项目 [claude-code-chat](https://github.com/andrepimenta/claude-code-chat)
- **Mrasxieyang (linux.do 社区)** – 提供了 Windows 原生安装的核心问题解决方案
- **Anthropic** – 创造出强大的 Claude 与 Claude Code
- **所有为 Claude Code 应用生态添砖加瓦的开发者们 ❤️**
