# Claude Code Chat UI for Windows

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">
  
  **Finally, a beautiful GUI for Claude Code on Windows!**
  
  [![VS Code Version](https://img.shields.io/badge/VS%20Code-%3E%3D1.94.0-blue)](https://code.visualstudio.com/)
  [![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://www.microsoft.com/windows)
</div>

## 🎯 Why This Extension?

Are you a Windows user struggling with Claude Code's command-line interface? Tired of switching between terminal and editor? This extension is for you!

**Claude Code Chat UI** transforms the powerful Claude Code CLI into a beautiful, integrated chat experience within VS Code - designed specifically for Windows users who prefer graphical interfaces over terminal commands.

## ✨ Key Benefits

- **No Terminal Required** - Full GUI experience, no command-line knowledge needed
- **Windows Optimized** - Built specifically for Windows, using Git Bash for perfect compatibility
- **Cursor Compatible** - Works seamlessly in Cursor and other VS Code-based editors
- **Beautiful Interface** - Modern chat UI that matches your VS Code theme
- **One-Click Setup** - Simple installation, no complex configuration

## 🚀 Features

### Core Features
- 💬 **Rich Chat Interface** - Beautiful WebView-based UI with markdown support
- 📁 **File References** - Reference any file with `@filename` mentions
- 🤖 **Model Selection** - Switch between Opus, Sonnet, and Default models
- 💾 **Session Management** - Create, save, and resume conversations
- 📊 **Usage Statistics** - Track tokens, costs, and usage patterns

### Advanced Features
- 🧠 **Thinking Modes** - 4 intensity levels (think → ultrathink)
- 📋 **Plan Mode** - Let Claude plan before implementing
- 🔄 **Git Backup/Restore** - Automatic backups with one-click restore
- 🔧 **MCP Support** - Extend with external tools
- ⚡ **Custom Commands** - Create your own slash commands
- 🎨 **Theme Integration** - Adapts to your VS Code theme

## 📦 Installation

### Prerequisites
1. **Windows 10/11**
2. **Git for Windows** (includes Git Bash)
3. **Node.js** (v18 or higher)
4. **VS Code** (v1.94.0 or higher)

### Quick Install
```bash
# 1. Install Claude CLI globally
npm install -g @anthropic-ai/claude-code

# 2. Login to Claude (one-time setup)
claude login

# 3. Install the extension
# Option A: From VS Code Marketplace
# Search "Claude Code Chat UI" in Extensions

# Option B: From VSIX file
# Download from releases and install via "Install from VSIX..."
```

### First Run
1. Press `Ctrl+Shift+C` to open Claude Chat
2. If prompted, configure Git Bash path (usually auto-detected)
3. Start chatting with Claude!

## 🎮 Usage

### Basic Commands
- **Open Chat**: `Ctrl+Shift+C`
- **New Session**: Click "New Session" button
- **Reference Files**: Type `@` and select files
- **Switch Models**: Use the model dropdown

### Pro Tips
- Enable **Thinking Mode** for complex problems
- Use **Plan Mode** for large refactoring tasks
- Type `/` to see all available commands
- Drag & drop images directly into chat

## ⚙️ Configuration

```json
{
  // Thinking intensity: "think", "think-hard", "think-harder", "ultrathink"
  "claudeCodeChatUI.thinking.intensity": "think",
  
  // Git Bash path (auto-detected on Windows)
  "claudeCodeChatUI.windows.gitBashPath": "C:\\Program Files\\Git\\bin\\bash.exe",
  
  // MCP configuration
  "claudeCodeChatUI.mcp.enabled": false,
  "claudeCodeChatUI.mcp.servers": []
}
```

## 🐛 Troubleshooting

### Common Issues

**"Claude not found"**
- Ensure Claude CLI is installed: `npm list -g @anthropic-ai/claude-code`
- Run `claude login` in terminal

**"Git Bash not found"**
- Install Git for Windows from [git-scm.com](https://git-scm.com/)
- Check settings for correct path

**"Permission denied"**
- Run VS Code as administrator
- Check Windows Defender settings

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-code-chatui.git

# Install dependencies
npm install

# Compile and watch
npm run watch

# Press F5 to debug
```

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Thanks to [Anthropic](https://anthropic.com) for creating Claude and Claude Code
- Inspired by the need for better Windows tooling in the AI coding space
- Special thanks to all Windows developers who provided feedback

## 📊 Stats

- 🌟 If this extension helps you, please star the repository!
- 🐛 Found a bug? [Report it here](https://github.com/yourusername/claude-code-chatui/issues)
- 💡 Have an idea? [Start a discussion](https://github.com/yourusername/claude-code-chatui/discussions)

---

<div align="center">
  Made with ❤️ for Windows developers who love Claude
</div>
