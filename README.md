# Claude Code Chat UI – for Windows (No WSL)

> **A Native UI for Windows That Makes Claude Code Instantly Better! 🚀**

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">

  <!-- Badges -->
  <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.94-blue" alt="VS Code ≥ 1.94"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a> <a href="https://www.microsoft.com/windows"><img src="https://img.shields.io/badge/Windows-10%20%7C%2011-blue" alt="Windows 10/11"></a> <a href="https://cursor.sh/"><img src="https://img.shields.io/badge/Cursor-Ready-purple" alt="Cursor Ready"></a> <a href="https://github.com/andrepimenta/claude-code-chat"><img src="https://img.shields.io/badge/Based%20on-claude--code--chat-orange" alt="Based on claude-code-chat"></a>
</div>

**🌐 Languages: English | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)**

---

## 🚩 Why You Need This Project

* **No More WSL Hassle**:
    Finally, run Claude Code with **100% native Windows support**. It just works!
* **Say Goodbye to Path Errors**:
    Seamlessly converts between `C:\` and `/usr/` paths to avoid wasting precious AI tokens.
* **Ditch the Terminal**:
    A full-featured GUI chat interface for easy copy-pasting and image drag-and-drop. No more window switching!

---

## 📸 Features at a Glance

### **Main Chat Interface**

![Main Interface](docs/assets/ui.png)

### **Real-time Token Stats**

![Token HUD](docs/assets/token.png)

### **Modular Command Protocol (MCP)**

![MCP](docs/assets/mcp.png)

---

## 🎯 Core Advantages

* ✅ **Zero WSL Dependency**: Runs with just Git Bash and Node.js.
* ✅ **Real-time Cost Tracking**: Instantly see token counts and costs.
* ✅ **Windows Path Compatibility**: Automatically recognizes and handles paths for smooth cross-system interaction.
* ✅ **MCP Modular Extensions**: Call external tools with a single click, making your Claude Code omnipotent.
* ✅ **A Detail-Lover's Dream**: HiDPI icons, dynamic theme support, and fluid animations.
* ✅ **Perfect for "Vibe Coding"**: A pure GUI experience for an ultra-comfortable coding environment.

---

## 🚀 Installation and Usage

> This guide covers **Environment Setup**, **Extension Installation**, and **Packaging Instructions**.

### 🔹 Step 1: Set Up Your Environment (One-Time Only)

This core step resolves the `No suitable shell found` error on Windows.

```powershell
# 1. Install Git for Windows (includes Git Bash, which is required)
# Download here: https://git-scm.com/

# 2. Install Node.js (LTS version recommended, ≥ 18)
# Download here: https://nodejs.org/

# 3. Open PowerShell or CMD as an [Administrator] and run the following commands to set environment variables
#    (This tells npm to ignore scripts and sets Git Bash as the shell, fixing the core issue)
setx NPM_CONFIG_IGNORE_SCRIPTS true
setx SHELL "C:\\Program Files\\Git\\bin\\bash.exe"
#    Note: If you installed Git in a different directory, update the path accordingly.

# 4. [IMPORTANT] Completely close and restart your PowerShell/CMD window for the changes to take effect.
```

### 🔹 Step 2: Install and Verify Claude Code CLI

```powershell
# 1. In a [new] terminal window, globally install the Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 2. Ensure the npm global directory is in your system's Path environment variable
#    The default path is usually: C:\Users\YourUsername\AppData\Roaming\npm
#    If you're unsure, add it manually to your system's "Path" variable.

# 3. Log in to Claude Code for the first time
claude login
#    A browser window will open for authorization → Log in and copy the token → Paste it back into the terminal.

# 4. Quickly verify the installation
claude chat -m sonnet -p "hello"
#    If you see a reply from Claude, your environment is ready!
```

### 🔹 Step 3: Install This Extension

#### Method 1: Install from VS Code Marketplace (Recommended)

1.  Open VS Code or Cursor.
2.  Click the **Extensions** icon in the Activity Bar on the side.
3.  Search for `Claude-Code ChatUI for Windows` or the unique ID `lkbaba.claude-code-chatui`.
4.  Find the extension and click **Install**.

You can also install directly from the [**➡️ Marketplace Page**](https://marketplace.visualstudio.com/items?itemName=lkbaba.claude-code-chatui).

#### Method 2: Advanced Installation (for Developers)

If you want to run from source or package the extension manually, follow these steps.

##### Run from Source

```powershell
# Clone the project locally
git clone https://github.com/LKbaba/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows
npm install  # Install dependencies

# Press F5 in VS Code or Cursor to start debugging
```

##### Package as VSIX and Install

```powershell
# 1. Make sure you are in the project root and have run npm install

# 2. Compile and package the extension
npm run package

#    This command will automatically compile and package the extension into a .vsix file.
```

**To install the `.vsix` file:**

1.  In VS Code or Cursor, press `Ctrl+Shift+P` to open the Command Palette.
2.  Type `Install from VSIX` and select **"Extensions: Install from VSIX..."**.
3.  Select the generated `.vsix` file from the project root to install.

---

### 🎉 Getting Started

*   **Open Chat Panel**: Press `Ctrl+Shift+C`
*   **Customize Settings**: Go to VS Code/Cursor Settings → Search for `claudeCodeChatUI`

**Example Configuration:**

```jsonc
{
  // Claude's thinking intensity: think | think-hard | think-harder | ultrathink
  "claudeCodeChatUI.thinking.intensity": "think-harder",

  // Path to Git Bash (usually auto-detected, no changes needed)
  "claudeCodeChatUI.windows.gitBashPath": "C:\\Program Files\\Git\\bin\\bash.exe",

  // MCP Modular Extensions
  "claudeCodeChatUI.mcp.enabled": true,
  "claudeCodeChatUI.mcp.servers": ["http://localhost:7070"]
}
```

---

## 🤝 How to Contribute

1. Fork the project and create a feature branch.
2. Focus on a single new feature or pain point.
3. Test thoroughly on a real Windows machine.
4. Run `npm test` before submitting (if tests are available).
5. Open a Pull Request with a clear description and screenshots.

We welcome all AI engineers, developers, geeks, and vibe-coders on Windows to join in!

---

## 📝 License

This project is licensed under the **MIT License**, consistent with the upstream project. See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments and Inspiration

Special thanks to:

* **andrepimenta** – for the original [claude-code-chat](https://github.com/andrepimenta/claude-code-chat) project
* **CCUsage** – for the inspiration on real-time token tracking
* **Mrasxieyang (from linux.do community)** – for providing the core solution for the native Windows installation
* **Anthropic** – for creating the powerful Claude and Claude Code
* **All developers contributing to the Claude Code application ecosystem ❤️**

---
