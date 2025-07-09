# Claude Code Chat in Windows 🎉

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">
  
  <h3>Claude Code + Cursor + Windows = ❤️</h3>
  
  **Finally! Use Claude Code in Cursor on Windows without wrestling with the terminal!**
  
  [![VS Code Version](https://img.shields.io/badge/VS%20Code-%3E%3D1.94.0-blue)](https://code.visualstudio.com/)
  [![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://www.microsoft.com/windows)
  [![Cursor Compatible](https://img.shields.io/badge/Cursor-Compatible-purple)](https://cursor.sh/)
  [![Based on](https://img.shields.io/badge/Based%20on-claude--code--chat-orange)](https://github.com/andrepimenta/claude-code-chat)
</div>

## 🎯 The Problem

If you're a Windows user trying to use Claude Code in Cursor, you know the pain:

- 😫 Terminal commands that don't work properly on Windows
- 🤯 Path issues, permission errors, and Git Bash conflicts  
- 😔 Watching Mac users enjoy seamless Claude Code integration
- 🚫 No proper GUI - just a terminal interface

**This project solves ALL of that!**

## 🌟 My Story

Hi! I'm what you might call a "vibe coder" - I code by intuition rather than deep technical knowledge. When I discovered Claude Code, I was blown away by its capabilities, but the terminal interface on Windows was a nightmare.

Then I found [andrepimenta's claude-code-chat](https://github.com/andrepimenta/claude-code-chat) project - a beautiful GUI for Claude Code! But it wasn't optimized for Windows users like me.

So what did I do? I asked Claude Code to help me modify it! 🤖 Together, we created this Windows-optimized version with enhanced features that make Claude Code a joy to use on Windows.

## ✨ What's New & Improved

### 🪟 Windows-Specific Optimizations

- **Git Bash Integration**: Seamless integration with Git Bash for proper command execution
- **Path Handling**: Intelligent Windows path conversion (no more `/c/Users` vs `C:\Users` confusion!)
- **Permission Management**: Handles Windows-specific permission requirements
- **Native Windows Feel**: UI and UX designed for Windows users

### 📊 Enhanced Token Statistics

- **Real-time Tracking**: See exactly how many tokens you're using
- **Cost Estimation**: Know how much your conversations cost
- **Usage Analytics**: Track patterns and optimize your Claude usage
- **Visual Dashboard**: Beautiful charts and graphs for token usage

### 🔧 Improved MCP (Model Context Protocol) Support

- **Easy Configuration**: Simple UI for MCP server setup
- **Multiple Servers**: Connect multiple MCP servers simultaneously  
- **Windows-Friendly**: MCP servers work flawlessly on Windows
- **Built-in Tools**: Pre-configured tools for common tasks

### 🎨 UI Improvements

- **Better Theme Integration**: Perfectly matches your Cursor theme
- **Responsive Design**: Works great on any screen size
- **Enhanced File References**: Improved `@file` mention system
- **Smooth Animations**: Polished interactions throughout

## 🚀 Quick Start for Cursor Users

### Prerequisites

1. **Windows 10/11** (obviously! 😄)
2. **[Git for Windows](https://git-scm.com/)** (includes Git Bash)
3. **[Node.js](https://nodejs.org/)** v18 or higher
4. **[Cursor](https://cursor.sh/)** (or VS Code v1.94.0+)

### Installation

```bash
# 1. Install Claude CLI globally
npm install -g @anthropic-ai/claude-code

# 2. Login to Claude (one-time setup)
claude login

# 3. Install this extension in Cursor
# Method 1: From the provided VSIX file
# - Download claude-code-chat-ui-windows.vsix from releases
# - In Cursor: Ctrl+Shift+P → "Install from VSIX"

# Method 2: Build from source
git clone https://github.com/yourusername/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows
npm install
npm run package
# Then install the generated VSIX file
```

### First Launch

1. Press `Ctrl+Shift+C` to open Claude Chat
2. Git Bash path is auto-detected (usually `C:\Program Files\Git\bin\bash.exe`)
3. Start chatting with Claude! 🎉

## 📸 Screenshots

<div align="center">
  <img src="docs/screenshots/main-interface.png" alt="Main Interface" width="600">
  <p><em>Beautiful chat interface integrated in Cursor</em></p>
  
  <img src="docs/screenshots/token-stats.png" alt="Token Statistics" width="600">
  <p><em>Real-time token tracking and cost estimation</em></p>
  
  <img src="docs/screenshots/mcp-config.png" alt="MCP Configuration" width="600">
  <p><em>Easy MCP server configuration</em></p>
</div>

## 🎮 Usage Tips

### For Fellow "Vibe Coders"

- **Don't worry about the terminal!** Everything is GUI-based
- **Use natural language** - Claude understands what you mean
- **Reference files easily** - Just type `@` and select files
- **Enable thinking mode** for complex problems
- **Check token usage** to stay within limits

### Power User Features

- **Slash Commands**: Type `/` to see all available commands
- **Thinking Modes**: From `think` to `ultrathink` for complex problems
- **Plan Mode**: Let Claude plan before implementing
- **Git Integration**: Automatic backups and easy restore
- **MCP Tools**: Extend functionality with external tools

## 📊 Feature Comparison

| Feature | Original claude-code-chat | This Project |
|---------|--------------------------|--------------|
| Windows Support | Basic | **Fully Optimized** ✨ |
| Git Bash Integration | No | **Yes** ✅ |
| Token Statistics | Basic | **Advanced with Analytics** 📊 |
| MCP Support | Limited | **Full Support** 🔧 |
| Path Handling | Manual | **Automatic** 🎯 |
| Cost Tracking | No | **Yes** 💰 |
| Theme Integration | Good | **Perfect** 🎨 |

## 🤝 Contributing

Are you a fellow "vibe coder" who wants to help? Awesome! Here's how:

1. **Report Issues**: If something doesn't work on your Windows setup, let us know!
2. **Share Ideas**: Have a cool feature idea? Open a discussion!
3. **Test & Feedback**: Try it out and tell us what you think
4. **Code Contributions**: Even small improvements are welcome!

```bash
# Fork and clone
git clone https://github.com/yourusername/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows

# Install dependencies
npm install

# Make your changes
# Test in Cursor with F5

# Submit a PR!
```

## 🙏 Acknowledgments

- **Huge thanks to [andrepimenta](https://github.com/andrepimenta)** for creating the original claude-code-chat project that inspired this fork
- **[Anthropic](https://anthropic.com)** for creating Claude and Claude Code
- **Claude Code itself** for helping me (a vibe coder) create this Windows-optimized version!
- **The Windows developer community** for patience and feedback

## 📝 License

MIT License - because sharing is caring! See [LICENSE](LICENSE) for details.

## 🌟 Support

If this project helps you use Claude Code on Windows:

- ⭐ **Star this repo** to help others find it
- 🐛 **Report bugs** in the [Issues](https://github.com/yourusername/Claude-code-ChatInWindows/issues) section
- 💡 **Share your ideas** in [Discussions](https://github.com/yourusername/Claude-code-ChatInWindows/discussions)
- 📢 **Tell other Windows users** about it!

---

<div align="center">
  <h3>Made with ❤️ by a Windows user, for Windows users</h3>
  <p>Special thanks to Claude for helping a "vibe coder" make this happen! 🤖</p>
</div>
