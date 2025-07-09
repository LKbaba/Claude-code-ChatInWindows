# Claude Code Chat in Windows 🎉

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">
  
  <h3>Claude Code + Cursor + Windows = ❤️</h3>
  
  **终于！Windows 用户也能在 Cursor 中轻松使用 Claude Code，告别命令行的烦恼！**
  
  [![VS Code Version](https://img.shields.io/badge/VS%20Code-%3E%3D1.94.0-blue)](https://code.visualstudio.com/)
  [![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://www.microsoft.com/windows)
  [![Cursor Compatible](https://img.shields.io/badge/Cursor-兼容-purple)](https://cursor.sh/)
  [![Based on](https://img.shields.io/badge/基于-claude--code--chat-orange)](https://github.com/andrepimenta/claude-code-chat)
</div>

## 🎯 痛点问题

如果你是一个想在 Cursor 中使用 Claude Code 的 Windows 用户，你一定体会过这些痛苦：
- 😫 终端命令在 Windows 上总是出问题
- 🤯 路径问题、权限错误、Git Bash 冲突层出不穷
- 😔 看着 Mac 用户享受丝滑的 Claude Code 体验，自己却在踩坑
- 🚫 没有友好的图形界面，只能对着黑乎乎的终端发呆

**这个项目一次性解决所有问题！**

## 🌟 我的故事

大家好！我是一个"感觉流程序员"（vibe coder）- 靠直觉而非深厚技术知识编程的人。当我发现 Claude Code 时，被它的强大能力震撼了，但 Windows 上的终端界面简直是噩梦。

后来我找到了 [andrepimenta 的 claude-code-chat](https://github.com/andrepimenta/claude-code-chat) 项目 - 一个漂亮的 Claude Code 图形界面！但它并没有为 Windows 用户做优化。

所以我做了什么？我请 Claude Code 帮我改进它！🤖 我们一起创造了这个 Windows 优化版本，增加了许多新功能，让 Windows 用户也能愉快地使用 Claude Code。

## ✨ 新增功能与改进

### 🪟 Windows 专属优化
- **Git Bash 深度集成**：与 Git Bash 无缝集成，命令执行不再出错
- **智能路径处理**：自动转换 Windows 路径（再也不用纠结 `/c/Users` 还是 `C:\Users`！）
- **权限管理**：妥善处理 Windows 特有的权限需求
- **原生体验**：为 Windows 用户量身定制的 UI 和交互

### 📊 增强的 Token 统计功能
- **实时追踪**：精确显示你使用了多少 token
- **费用估算**：实时了解对话成本
- **使用分析**：追踪使用模式，优化 Claude 使用效率
- **可视化仪表板**：漂亮的图表展示 token 使用情况

### 🔧 改进的 MCP（模型上下文协议）支持
- **简单配置**：通过 UI 轻松设置 MCP 服务器
- **多服务器支持**：同时连接多个 MCP 服务器
- **Windows 友好**：MCP 服务器在 Windows 上完美运行
- **内置工具**：预配置常用工具，开箱即用

### 🎨 UI 改进
- **完美主题适配**：与你的 Cursor 主题完美融合
- **响应式设计**：在任何屏幕尺寸上都表现出色
- **增强的文件引用**：改进的 `@文件` 提及系统
- **流畅动画**：全面优化的交互体验

## 🚀 Cursor 用户快速开始

### 前置要求
1. **Windows 10/11**（这个显而易见！😄）
2. **[Git for Windows](https://git-scm.com/)**（包含 Git Bash）
3. **[Node.js](https://nodejs.org/)** v18 或更高版本
4. **[Cursor](https://cursor.sh/)**（或 VS Code v1.94.0+）

### 安装步骤

```bash
# 1. 全局安装 Claude CLI
npm install -g @anthropic-ai/claude-code

# 2. 登录 Claude（一次性设置）
claude login

# 3. 在 Cursor 中安装本扩展
# 方法一：使用提供的 VSIX 文件
# - 从 releases 下载 claude-code-chat-ui-windows.vsix
# - 在 Cursor 中：Ctrl+Shift+P → "从 VSIX 安装"

# 方法二：从源码构建
git clone https://github.com/yourusername/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows
npm install
npm run package
# 然后安装生成的 VSIX 文件
```

### 首次启动
1. 按 `Ctrl+Shift+C` 打开 Claude Chat
2. Git Bash 路径会自动检测（通常是 `C:\Program Files\Git\bin\bash.exe`）
3. 开始与 Claude 聊天吧！🎉

## 📸 界面截图

<div align="center">
  <img src="docs/screenshots/main-interface.png" alt="主界面" width="600">
  <p><em>集成在 Cursor 中的漂亮聊天界面</em></p>
  
  <img src="docs/screenshots/token-stats.png" alt="Token 统计" width="600">
  <p><em>实时 token 追踪和费用估算</em></p>
  
  <img src="docs/screenshots/mcp-config.png" alt="MCP 配置" width="600">
  <p><em>简单易用的 MCP 服务器配置</em></p>
</div>

## 🎮 使用技巧

### 给"感觉流程序员"的建议
- **别担心终端！** 所有操作都是图形化的
- **使用自然语言** - Claude 能理解你的意思
- **轻松引用文件** - 输入 `@` 即可选择文件
- **开启思考模式** 解决复杂问题
- **关注 token 使用** 避免超出限制

### 高级功能
- **斜杠命令**：输入 `/` 查看所有可用命令
- **思考模式**：从 `think` 到 `ultrathink`，应对复杂问题
- **计划模式**：让 Claude 先规划再实施
- **Git 集成**：自动备份，轻松恢复
- **MCP 工具**：通过外部工具扩展功能

## 📊 功能对比

| 功能 | 原版 claude-code-chat | 本项目 |
|------|---------------------|--------|
| Windows 支持 | 基础 | **完全优化** ✨ |
| Git Bash 集成 | 无 | **有** ✅ |
| Token 统计 | 基础 | **高级分析** 📊 |
| MCP 支持 | 有限 | **完整支持** 🔧 |
| 路径处理 | 手动 | **自动** 🎯 |
| 费用追踪 | 无 | **有** 💰 |
| 主题集成 | 好 | **完美** 🎨 |

## 🤝 参与贡献

你也是"感觉流程序员"想要帮助改进项目？太棒了！以下是参与方式：

1. **报告问题**：如果在你的 Windows 环境中遇到问题，请告诉我们！
2. **分享想法**：有好的功能建议？开个讨论吧！
3. **测试反馈**：试用并告诉我们你的体验
4. **代码贡献**：即使是小改进也非常欢迎！

```bash
# Fork 并克隆
git clone https://github.com/yourusername/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows

# 安装依赖
npm install

# 进行修改
# 按 F5 在 Cursor 中测试

# 提交 PR！
```

## 🙏 致谢

- **特别感谢 [andrepimenta](https://github.com/andrepimenta)** 创建了原版 claude-code-chat 项目，给了我灵感
- **[Anthropic](https://anthropic.com)** 创造了 Claude 和 Claude Code
- **Claude Code 本身** 帮助我这个"感觉流程序员"完成了 Windows 优化版本！
- **Windows 开发者社区** 的耐心和反馈

## 📝 许可证

MIT 许可证 - 因为分享就是关爱！详见 [LICENSE](LICENSE) 文件。

## 🌟 支持项目

如果这个项目帮助你在 Windows 上使用 Claude Code：
- ⭐ **给项目加星** 帮助其他人发现它
- 🐛 **报告 Bug** 在 [Issues](https://github.com/yourusername/Claude-code-ChatInWindows/issues) 板块
- 💡 **分享想法** 在 [Discussions](https://github.com/yourusername/Claude-code-ChatInWindows/discussions)
- 📢 **告诉其他 Windows 用户** 这个好消息！

---

<div align="center">
  <h3>由 Windows 用户制作，为 Windows 用户服务 ❤️</h3>
  <p>特别感谢 Claude 帮助一个"感觉流程序员"实现这个项目！🤖</p>
</div>