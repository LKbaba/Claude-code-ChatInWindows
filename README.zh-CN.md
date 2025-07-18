# Claude Code Chat UI – Windows(No WSL)

> **Windows 上的UI界面，让 Claude Code 一秒变好用！🚀**

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">

  <!-- Badges -->
  <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.94-blue" alt="VS Code ≥ 1.94"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a> <a href="https://www.microsoft.com/windows"><img src="https://img.shields.io/badge/Windows-10%20%7C%2011-blue" alt="Windows 10/11"></a> <a href="https://cursor.sh/"><img src="https://img.shields.io/badge/Cursor-兼容-purple" alt="Cursor 兼容"></a> <a href="https://github.com/andrepimenta/claude-code-chat"><img src="https://img.shields.io/badge/基于-claude--code--chat-orange" alt="基于 claude-code-chat"></a>
</div>

**🌐 语言: [English](./README.md) | 简体中文 | [繁體中文](./README.zh-TW.md)**

---

## 🎯 核心优势

* ✅ **零 WSL 依赖**：只用 Git Bash 和 Node 就能运行。
* ✅ **实时费用统计**：Token 和费用实时显示，明明白白消费。
* ✅ **MCP 适配**：适配各种MCP，支持动态查询MCP工具。
* ✅ **第三方API适配**：适配各种第三方API，包括anyrouter/tuziapi等，以及Kimi K2 。
* ✅ **支持图片复制粘贴/文件检索**：想把多模态的模型用到极致，不能粘贴图片怎么行？
* ✅ **多语言支持**：多语种交流，代码注释。
* ✅ **「Vibe Coding」绝配**：流畅UI界面，营造极致舒适的编程环境。
* 🔄 **操作历史记录**：实时显示所有文件操作，一键撤销/重做

待更新: Token & Fee visualization, VSCode integration-code awareness.

---

## 🚩 为什么你需要这个项目？

* **不用再折腾 WSL**：
    Claude Code 终于支持 **100% Windows 原生运行**，省心到底！
* **告别路径错误**：
    `C:\` 与 `/usr/` 路径自动无缝转换，避免浪费时间和token。
* **拒绝终端操作**：
    完整 GUI 聊天界面，复制粘贴、插入图片一气呵成，再也不切窗口！

---

## 📸 功能一览

### **聊天主界面**

[![主界面](docs/assets/ui.png)](docs/assets/ui.png)

### **Token 实时统计**

[![Token HUD](docs/assets/token.png)](docs/assets/token.png)

### **模型上下文协议 (MCP)**

[![MCP](docs/assets/mcp.png)](docs/assets/mcp.png)

---

## 🚀 安装与使用

> **🎉 已上架 VS Code 插件市场！** 一键安装，无需复杂配置。
>
> 本部分包含**环境准备**、**插件安装**与**打包方法**三部分。

## 版本兼容性说明

> ⚠️ **重要版本提示（更新于2025.07.18）**：
>
> Claude Code 官方已发布 v1.0.54 版本，但该版本与本插件的 MCP 功能存在兼容性问题（官方尚未完善 SDK 和 Windows 平台适配）。如需完整体验本插件功能，建议使用 v1.0.48 版本。
>
> **降级指南**：若需从高版本降级至 v1.0.48，请按以下步骤操作：
>
> 1. 将 `C:\Program Files\Git\bin` 和 `C:\Program Files\Git\bin\bash.exe` 添加至系统环境变量
> 2. 删除 `C:\Users\<yourname>\.claude` 文件夹中的 `shell-snapshots` 文件夹
> 3. 卸载当前版本并重新安装 v1.0.48 版本
>
> ⚡ **Claude Code v1.0.51+ 用户须知**：
>
> * 请确保系统 PATH 环境变量中**不包含** `Git\bin` 路径，否则可能导致启动错误
> * 修改系统环境变量后必须**重启电脑**以确保更改生效
> * 详细配置说明请参阅[环境准备](#-第-1-步环境准备仅需一次)章节

### 🔹 第 1 步：环境准备（仅需一次）

核心步骤解决了 Windows 环境下 `No suitable shell found` 的报错问题。

```powershell
# 1. 安装 Git for Windows（自带 Git Bash，务必安装）
# 下载地址：https://git-scm.com/

# 2. 安装 Node.js（推荐 LTS 版本，≥ 18）
# 下载地址：https://nodejs.org/

# 3. 以【管理员权限】打开 PowerShell 或 CMD，执行以下命令配置环境变量

setx NPM_CONFIG_IGNORE_SCRIPTS true

# ⚠️ Claude Code 版本差异：
# - v1.0.50 及以下：需要设置 SHELL 环境变量
setx SHELL "C:\Program Files\Git\bin\bash.exe"
# 注意：如果你的 Git 安装在其他路径，请相应修改 "C:\Program Files\Git\bin\bash.exe"

# 4. ⚠️ 重要：修改系统环境变量后必须【重启电脑】才能完全生效！
# 仅关闭PowerShell/CMD窗口是不够的

# 5. 重启电脑后，验证环境配置
```

### 🔹 第 2 步：安装并验证 Claude Code CLI

```powershell
# 1. 在【新的】终端窗口中，全局安装 Claude Code CLI，推荐1.0.48
npm install -g @anthropic-ai/claude-code@1.0.48

# ⚠️ 如果遇到 PowerShell 脚本执行策略错误，请使用以下方法解决：
# 错误示例："无法加载文件 npm.ps1，因为在此系统上禁止运行脚本"
# 解决方案：临时放宽当前会话的执行策略（安全性更好）

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

# 或者直接使用 CMD 代替 PowerShell 来运行 npm 命令

# 2. 确保 npm 全局路径已添加到系统环境变量 Path 中
# 默认路径通常是: C:\Users\你的用户名\AppData\Roaming\npm
# 如果不确定，可以手动添加到系统环境变量的 "Path" 中

# 3. 首次登录 Claude Code（如果使用官方账号）

claude code

# 浏览器将打开授权页面 → 登录后复制页面上的 Token → 粘贴回终端
# 💡 提示：如果你计划使用第三方 API，请往下观看API操作示例。

# 4. 快速验证安装是否成功

claude chat -m sonnet -p "hello"

# 如果看到 Claude 的回复，说明你的环境已准备就绪！
```

**版本差异说明：**

* Claude Code v1.0.51 增加了Windows原生支持，要求PATH中只有Git\cmd
* Claude Code v1.0.48 将 shell 快照位置从 `/tmp` 改为 `~/.claude`

### 🔹 第 3 步：安装本插件

#### ✨ 方式一：从 VS Code Marketplace 安装（推荐）

**插件已正式上架 VS Code 市场！** 🎉

**快速安装：**

1. 打开 VS Code 或 Cursor
2. 按 `Ctrl+Shift+X` 打开扩展面板
3. 搜索 `Claude-Code ChatUI` 或 `lkbaba`
4. 点击 **安装**

**直达链接：** [**➡️ 从 VS Code 市场安装**](https://marketplace.visualstudio.com/items?itemName=lkbaba.claude-code-chatui)

---

#### 📦 方式二：从 GitHub Release 下载安装（离线安装）

如果你无法访问 VS Code 市场，可以直接下载已打包好的插件文件：

1. **[🔗 前往 Releases 页面](https://github.com/LKbaba/Claude-code-ChatInWindows/releases/latest)** 下载最新版本
2. 下载 `claude-code-chatinwindows-1.x.x.zip` 压缩包
3. 解压后找到 `claude-code-chatinwindows-x.x.vsix` 文件
4. 在 VS Code/Cursor 中按 `Ctrl+Shift+P`，输入 `Install from VSIX` 并选择 **"扩展: 从 VSIX 安装..."**。
5. 选择解压出的 `.vsix` 文件完成安装

> **💡 提示**：这种方式适合离线安装的用户。

---

#### 方式三：高级安装选项（适合开发者）

如果你想从源码运行或手动打包，可以参考以下步骤。

##### 从源码运行

```powershell
# 克隆项目到本地

git clone https://github.com/LKbaba/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows
npm install  # 安装依赖

# 在 VS Code 或 Cursor 中按 F5 即可进入调试模式
```

##### 打包为 VSIX 并安装

```powershell
# 1. 确保你已在项目根目录，并已执行 npm install

# 2. 编译并打包插件

npm run package

# 此命令会自动编译并打包成一个 .vsix 文件
```

**如何安装 `.vsix` 文件：**

1. 打开 VS Code 或 Cursor，按下 `Ctrl+Shift+P` 打开命令面板。
2. 输入 `Install from VSIX` 并选择 **"扩展: 从 VSIX 安装..."**。
3. 选择项目根目录下生成的 `.vsix` 文件进行安装。

---

### 🎉 开始使用

> **💡 重要提示**：如果您使用 VPN，请确保开启 **TUN 模式**，否则可能导致 Claude Code 无法正常连接。

* **打开聊天界面**：按快捷键 `Ctrl+Shift+C`
* **新建文件夹右边**：有一个图标，点击即可

### 🔑 使用第三方 API

本插件支持使用第三方 API 服务（如 tu-zi.com、openrouter.ai 等），使用示例如下：

#### 使用步骤

A.插件内配置

1. **打开设置**：点击聊天界面的设置按钮 ⚙️
2. **启用自定义 API**：勾选 "Use Custom API Endpoint"
3. **配置 API**：
   * **API Key**: 输入你的 API 密钥（如 `sk-ant-xxxxxxxxxx`）
   * **Base URL**: 输入 API 地址（如 `https://api.tu-zi.com`）
4. **保存确认**：设置会自动保存，左下角会提示"Settings updated successfully"

[![API Configuration](docs/assets/api.png)](docs/assets/api.png)

5. **首次初始化**（重要）

> ⚠️ **注意**：首次使用自定义 API 必须先在命令行初始化一次，之后就可以在插件中正常使用了。

B.首次初始化操作

**Windows PowerShell 用户：**

```powershell
# 打开一个新的 PowerShell 会话

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force   # 跳过脚本限制

$Env:ANTHROPIC_API_KEY  = "sk-xxxxxxxxxxxxxxxxxxxxxxxx"   # 填写自己的API-KEY,注意引号需要填入。
$Env:ANTHROPIC_BASE_URL = "https://api.tu-zi.com"         #具体URL需要咨询api供应商，注意引号需要填入。

claude code # 现在运行 CLI，就能读到这两个环境变量

按照提示完成确认，确保第三方api可以返回消息。

claude chat -m opus "hello"  # 测试是否配置成功
```

> 💡 **使用提示**：
>
> * ⚠️**重要**：电脑关机重启以后需要重新执行一次初始化
> * 使用第三方 API 服务通常价格更实惠，适合预算有限的用户，常见的第三方服务：[api.tu-zi.com](https://api.tu-zi.com/)、[openrouter.ai](https://openrouter.ai) 、[anyrouter.top](https://anyrouter.top)等
> * 可以通过配置开关随时切换官方账号和自定义 API
> * 如果 API 密钥错误，聊天会一直显示 "processing" 直到超时
> * 兔子API提供Claude Code月卡，详见[store.tu-zi.com](https://store.tu-zi.com/)

### ❓ 常见问题

**Q: 升级到 Claude Code v1.0.51 后出现 "No suitable shell found" 错误？**

* A: Claude Code v1.0.51 的 Windows 原生支持需要特定的环境配置：
  1. 打开系统环境变量设置（Win + X → 系统 → 高级系统设置 → 环境变量）
  2. 编辑PATH变量，移除所有包含 `Git\bin` 的条目
  3. 确保PATH中有 `C:\Program Files\Git\cmd`
  4. **重要：修改后必须重启电脑才能生效**
  
  临时测试方法（PowerShell，无需重启）：

  ```powershell
  # 临时移除 Git\bin（仅当前会话有效）
  $env:PATH = $env:PATH -replace 'C:\\Program Files\\Git\\bin;?', ''
  claude --version
  Claude code
  ```
  
  如果临时测试成功，请按上述步骤永久修改环境变量并重启电脑。

**Q: 为什么配置了 API 但是聊天没有响应？**

* A: 首次使用自定义 API 需要在命令行初始化运行，确保可以返回消息。

**Q: 如何切换回官方账号？**

* A: 在设置中取消勾选 "Use Custom API Endpoint" 即可

**Q: 遇到 "rg: command not found" 错误？**

* A: 这是可选的。如果想安装 ripgrep 以获得更好的搜索性能：

  ```bash
  # 在 Git Bash 中：
  curl -L https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep-14.1.0-x86_64-pc-windows-msvc.zip -o ripgrep.zip
  unzip ripgrep.zip && mkdir -p ~/bin
  cp ripgrep-14.1.0-x86_64-pc-windows-msvc/rg.exe ~/bin/
  echo 'alias rg="~/bin/rg"' >> ~/.bashrc && source ~/.bashrc
  ```

  * 注意：扩展内置的 Grep 工具即使没有 ripgrep 也能正常工作。

---

## 🤝 如何参与贡献

1. Fork 本项目，创建独立分支
2. 明确聚焦一个新功能或痛点优化
3. 在真实 Windows 环境充分测试
4. 提交前运行 `npm test`（如有测试脚本）
5. 发起 Pull Request，描述清晰易懂，配图更佳。

欢迎所有 Windows 上的 AI 工程师、开发者、极客、氛围编程者加入进来！

---

## 📝 开源许可证

本项目基于 **MIT 协议** 开源，与上游一致。详见 [LICENSE](LICENSE)。

---

## 🙏 致谢与灵感来源

特别感谢：

* **andrepimenta** – 原始项目 [claude-code-chat](https://github.com/andrepimenta/claude-code-chat)
* **CCUsage** – Token 实时统计思路启发
* **Mrasxieyang (linux.do 社区)** – 提供了 Windows 原生安装的核心问题解决方案
* **Anthropic** – 创造出强大的 Claude 与 Claude Code
* **所有为 Claude Code 应用生态添砖加瓦的开发者们 ❤️**

---
