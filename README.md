# Claude Code Chat UI – for Windows (No WSL)

> **A Native UI for Windows That Makes Claude Code Instantly Better! 🚀**

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">

  <!-- Badges -->
  <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.94-blue" alt="VS Code ≥ 1.94"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a> <a href="https://www.microsoft.com/windows"><img src="https://img.shields.io/badge/Windows-10%20%7C%2011-blue" alt="Windows 10/11"></a> <a href="https://cursor.sh/"><img src="https://img.shields.io/badge/Cursor-Ready-purple" alt="Cursor Ready"></a> <a href="https://github.com/andrepimenta/claude-code-chat"><img src="https://img.shields.io/badge/Based%20on-claude--code--chat-orange" alt="Based on claude-code-chat"></a>
</div>

**🌐 Languages: English | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)**

---

## 🎯 Core Advantages

* ✅ **Zero WSL Dependency**: Runs with just Git Bash and Node.js.
* ✅ **Real-time Cost Tracking**: Instantly see token counts and costs.
* ✅ **MCP Adaptation**: Adapts to various MCPs with support for dynamic MCP tool queries.
* ✅ **Third-party API Adaptation**: Supports various third-party APIs including anyrouter/tuziapi, as well as Kimi K2.
* ✅ **Image Copy-Paste/File Retrieval Support**: Maximize the use of multimodal models - image pasting is essential!
* ✅ **Multi-language Support**: Multi-language communication and code comments.
* ✅ **Perfect for "Vibe Coding"**: Smooth UI interface for an ultra-comfortable coding environment.
* 🔄 **Operation History**: Real-time display of all file operations with one-click undo/redo

Coming soon: Token & Fee visualization, VSCode integration-code awareness.

---

## 🚩 Why You Need This Project

* **No More WSL Hassle**:
    Finally, run Claude Code with **100% native Windows support**. It just works!
* **Say Goodbye to Path Errors**:
    Seamlessly converts between `C:\` and `/usr/` paths to avoid wasting time and tokens.
* **Ditch the Terminal**:
    A full-featured GUI chat interface for easy copy-pasting and image insertion. No more window switching!

---

## 📸 Features at a Glance

### **Main Chat Interface**

[![Main Interface](docs/assets/ui.png)](docs/assets/ui.png)

### **Real-time Token Stats**

[![Token HUD](docs/assets/token.png)](docs/assets/token.png)

### **Model Context Protocol (MCP)**

[![MCP](docs/assets/mcp.png)](docs/assets/mcp.png)

---

## 🚀 Installation and Usage

> **🎉 Now Available on VS Code Marketplace!** Install with just one click.
>
> This guide covers **Environment Setup**, **Extension Installation**, and **Packaging Instructions**.

## Version Compatibility Notice

> ⚠️ **Important Version Notice (Updated 2025.07.18)**:
>
> Claude Code official has released v1.0.54, but this version has compatibility issues with this plugin's MCP functionality (official SDK and Windows platform adaptation are not yet complete). For the full experience of this plugin's features, we recommend using v1.0.48.
>
> **Downgrade Guide**: If you need to downgrade from a higher version to v1.0.48, please follow these steps:
>
> 1. Add `C:\Program Files\Git\bin` and `C:\Program Files\Git\bin\bash.exe` to system environment variables
> 2. Delete the `shell-snapshots` folder in `C:\Users\<yourname>\.claude` folder
> 3. Uninstall the current version and reinstall v1.0.48
>
> ⚡ **Claude Code v1.0.51+ users notice**:
>
> * Ensure your system PATH does NOT contain `Git\bin`, or you'll encounter startup errors
> * You must **restart your computer** after modifying system environment variables
> * See [Environment Setup](#-step-1-set-up-your-environment-one-time-only) for details

### 🔹 Step 1: Set Up Your Environment (One-Time Only)

This core step resolves the `No suitable shell found` error on Windows.

```powershell
# 1. Install Git for Windows (includes Git Bash, which is required)
# Download here: https://git-scm.com/

# 2. Install Node.js (LTS version recommended, ≥ 18)
# Download here: https://nodejs.org/

# 3. Open PowerShell or CMD as an [Administrator] and run the following commands to set environment variables

setx NPM_CONFIG_IGNORE_SCRIPTS true

# ⚠️ Claude Code version differences:
# - v1.0.50 and below: Need to set SHELL environment variable
setx SHELL "C:\\Program Files\\Git\\bin\\bash.exe"
# Note: If you installed Git in a different directory, update the path accordingly.

# 4. ⚠️ IMPORTANT: You must RESTART YOUR COMPUTER after modifying system environment variables!
# Simply closing PowerShell/CMD window is NOT enough

# 5. After restart, verify your environment setup
```

### 🔹 Step 2: Install and Verify Claude Code CLI

```powershell
# 1. In a [new] terminal window, globally install the Claude Code CLI, recommend v1.0.48
npm install -g @anthropic-ai/claude-code@1.0.48

# ⚠️ If you encounter PowerShell script execution policy errors, try these solutions:
# Error example: "cannot be loaded because running scripts is disabled on this system"
# Solution: Temporarily relax the execution policy for the current session (more secure)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
# Or use CMD instead of PowerShell to run npm commands

# 2. Ensure the npm global directory is in your system's Path environment variable
#    The default path is usually: C:\Users\YourUsername\AppData\Roaming\npm
#    If you're unsure, add it manually to your system's "Path" variable.

# 3. Log in to Claude Code for the first time (if using official account)
claude code
#    A browser window will open for authorization → Log in and copy the token → Paste it back into the terminal.
#    💡 Tip: If you plan to use third-party APIs, see the API setup examples below.

# 4. Quickly verify the installation
claude chat -m sonnet -p "hello"
#    If you see a reply from Claude, your environment is ready!
```

**Version notes:**

* Claude Code v1.0.51 added native Windows support, requires PATH to only contain Git\cmd
* Claude Code v1.0.48 changed the shell snapshot location from `/tmp` to `~/.claude`

### 🔹 Step 3: Install This Extension

#### ✨ Method 1: Install from VS Code Marketplace (Recommended)

**The extension is now available on the VS Code Marketplace!** 🎉

**Quick Install:**

1. Open VS Code or Cursor
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for `Claude-Code ChatUI` or `lkbaba`
4. Click **Install**

**Direct Link:** [**➡️ Install from VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=lkbaba.claude-code-chatui)

---

#### 📦 Method 2: Download from GitHub Release (Offline Installation)

If you can't access VS Code Marketplace, download the pre-packaged extension file:

1. **[🔗 Go to Releases page](https://github.com/LKbaba/Claude-code-ChatInWindows/releases/latest)** to download the latest version
2. Download the `claude-code-chatinwindows-1.x.x.zip` package
3. Extract and find the `claude-code-chatinwindows-x.x.vsix` file
4. In VS Code/Cursor, press `Ctrl+Shift+P`, type `Install from VSIX` and select **"Extensions: Install from VSIX..."**
5. Select the extracted `.vsix` file to install

> **💡 Tip**: This method is suitable for offline installation.

---

#### Method 3: Advanced Installation (for Developers)

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

1. In VS Code or Cursor, press `Ctrl+Shift+P` to open the Command Palette.
2. Type `Install from VSIX` and select **"Extensions: Install from VSIX..."**.
3. Select the generated `.vsix` file from the project root to install.

---

### 🎉 Getting Started

> **💡 Important**: If using a VPN, ensure **TUN mode** is enabled, otherwise Claude Code may fail to connect.

* **Open Chat Panel**: Press `Ctrl+Shift+C`
* **File Explorer Icon**: There's an icon next to the new folder button, click it to open

### 🔑 Using Third-Party APIs

This extension supports third-party API services (e.g., tu-zi.com, openrouter.ai). Here's how to use them:

#### Usage Steps

A. Extension Configuration

1. **Open Settings**: Click the settings button ⚙️ in the chat interface
2. **Enable Custom API**: Check "Use Custom API Endpoint"
3. **Configure API**:
   * **API Key**: Enter your API key (e.g., `sk-ant-xxxxxxxxxx`)
   * **Base URL**: Enter the API endpoint (e.g., `https://api.tu-zi.com`)
4. **Save Confirmation**: Settings are saved automatically with a "Settings updated successfully" notification

[![API Configuration](docs/assets/api.png)](docs/assets/api.png)

5. **First-time Initialization** (Important)

> ⚠️ **Note**: First-time custom API use requires command line initialization. After that, it works normally in the extension.

B. First-time Initialization

**Windows PowerShell Users:**

```powershell
# Open a new PowerShell session
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force   # Bypass script restrictions

$Env:ANTHROPIC_API_KEY  = "sk-xxxxxxxxxxxxxxxxxxxxxxxx"   # Enter your API key, note the quotes are required
$Env:ANTHROPIC_BASE_URL = "https://api.tu-zi.com"  # Consult your API provider for the URL, quotes are required

claude code  # Run CLI to read environment variables

Follow the prompts to confirm third-party API can return messages.

claude chat -m opus "hello"  # Test if configuration works
```

> 💡 **Tips**:
>
> * **Important**: Initialization is required again after system restart 💡
> * Third-party APIs are usually more affordable for budget-conscious users. Common services: [api.tu-zi.com](https://api.tu-zi.com/), [openrouter.ai](https://openrouter.ai), [anyrouter.top](https://anyrouter.top)
> * Toggle between official account and custom API anytime via the switch
> * Wrong API key will show "processing" until timeout

### ❓ FAQ

**Q: Getting "No suitable shell found" error after upgrading to Claude Code v1.0.51?**

* A: Claude Code v1.0.51's native Windows support requires specific environment setup:
  1. Open system environment variables (Win + X → System → Advanced system settings → Environment Variables)
  2. Edit PATH variable, remove all entries containing `Git\bin`
  3. Ensure PATH contains `C:\Program Files\Git\cmd`
  4. **Important: You must restart your computer for changes to take effect**
  
  Temporary test method (PowerShell, no restart needed):

  ```powershell
  # Temporarily remove Git\bin (current session only)
  $env:PATH = $env:PATH -replace 'C:\\Program Files\\Git\\bin;?', ''
  claude --version
  claude code
  ```
  
  If the temporary test works, follow the steps above to permanently modify environment variables and restart.

**Q: Why doesn't chat respond after configuring API?**

* A: First-time custom API use requires command line initialization to ensure messages can be returned.

**Q: How to switch back to official account?**

* A: Uncheck "Use Custom API Endpoint" in settings

**Q: Getting "rg: command not found" error?**

* A: This is optional. If you want to install ripgrep for better search performance:

  ```bash
  # In Git Bash:
  curl -L https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep-14.1.0-x86_64-pc-windows-msvc.zip -o ripgrep.zip
  unzip ripgrep.zip && mkdir -p ~/bin
  cp ripgrep-14.1.0-x86_64-pc-windows-msvc/rg.exe ~/bin/
  echo 'alias rg="~/bin/rg"' >> ~/.bashrc && source ~/.bashrc
  ```

  * Note: The extension's built-in Grep tool works fine without ripgrep.

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
