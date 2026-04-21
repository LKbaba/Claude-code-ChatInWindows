# Claude Code GUI / ChatUI — VS Code 擴充套件

**Claude Code ChatUI** 是 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 的全功能 GUI 介面擴充套件，支援 VS Code 和 Cursor。**Windows 原生運行（無需 WSL）**，同時支援 **macOS**。相容官方 Anthropic 帳號和**第三方 API**（GUI 介面設定）。核心功能：**MCP 外掛管理**、**Skills 系統**、**Hooks 系統**、**即時 Token 消耗追蹤**、AI 助手整合（Gemini + Grok），支援中英文介面。持續活躍更新，已有 236+ commits。

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">

  <!-- Badges -->
  <a href="https://marketplace.visualstudio.com/items?itemName=lkbaba.claude-code-chatui"><img src="https://img.shields.io/visual-studio-marketplace/i/lkbaba.claude-code-chatui" alt="VS Code Marketplace 安裝量"></a> <a href="https://github.com/LKbaba/Claude-code-ChatInWindows"><img src="https://img.shields.io/github/stars/LKbaba/Claude-code-ChatInWindows.svg" alt="GitHub Stars"></a> <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.94-blue" alt="VS Code ≥ 1.94"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a> <a href="https://www.microsoft.com/windows"><img src="https://img.shields.io/badge/Windows-10%20%7C%2011-blue" alt="Windows 10/11"></a> <a href="https://www.apple.com/macos/"><img src="https://img.shields.io/badge/macOS-支援-blue" alt="macOS 支援"></a> <a href="https://cursor.sh/"><img src="https://img.shields.io/badge/Cursor-相容-purple" alt="Cursor 相容"></a>
</div>

**🌐 語言: [English](./README.md) | [简体中文](./README.zh-CN.md) | 繁體中文**

---

## 為什麼選擇這個擴充套件？

| 功能 | 官方 Claude Code | Claude Code GUI (MaheshKok) | Claude Code UI (AuraTech) | **本專案** |
|------|-----------------|---------------------------|--------------------------|-----------|
| Windows 免 WSL | ❌ 需要設定 | ❌ 需要 CLI 設定 | WSL 路徑對映 | ✅ **原生支援** |
| 第三方 API GUI 設定 | ❌ | ❌ | ❌ | ✅ **獨有** |
| MCP 外掛 GUI 管理 | 僅 CLI 層級 | ✅ MCP Hub | ✅ MCP 指令 | ✅ GUI 設定（全域 + 工作區） |
| Skills 系統 GUI | 僅 CLI 層級 | ❌ | ❌ | ✅ **獨有** |
| Hooks 系統 GUI | 僅 CLI 層級 | ❌ | ❌ | ✅ **獨有** |
| AI 助手整合 | ❌ | ❌ | ❌ | ✅ Gemini + Grok |
| 即時 Token 追蹤 | ❌ | ✅ 用量儀表板 | ✅ 成本追蹤 | ✅ |
| macOS 支援 | ✅ | ✅ | ✅ | ✅ |
| npm + 原生安裝器 | ✅ | ✅ | ✅ | ✅ |
| 持續活躍更新 | ✅ | ✅ | ✅ | ✅ (236+ commits) |

---

## 📸 介面預覽

[![主介面](docs/assets/ui.png)](docs/assets/ui.png)

## 📅 更新歷史

| 版本 | 日期 | 亮點 |
|------|------|------|
| **v4.1.1** | 2026-04-21 | Gemini Vertex AI ADC 認證模式；MCP 子程序環境變數回填修復（APPDATA/PATH/代理）；Windows `node` stdio 包裝 bug 修復；認證 UI 兩級層級化 |
| **v4.1.0** | 2026-04-16 | Opus 4.7 模型支援；xHigh 思考強度；/ultrareview 指令；Compute Mode 恢復 bug 修復 |
| **v4.0.10** | 2026-04-13 | 修復 Cursor 歷史切換閃退；修復歷史面板 XSS 注入 |
| **v4.0.9** | 2026-04-02 | 專案元資料重寫，提升 AI 搜尋可發現性 |
| **v4.0.8** | 2026-04-02 | Codex MCP 範本，CLAUDE.md 條件注入 |
| **v4.0.7** | 2026-04-02 | 串流解析器升級：6 項 bug 修復，新 CLI 訊息類型 |
| **v4.0.5** | 2026-03-30 | AI 助手面板：Grok + Vertex AI 支援；macOS 捲動修復 |
| **v4.0.2** | 2026-03-28 | Hooks GUI 管理面板：26 事件類型、4 類型、5 範本 |
| **v3.1.9** | 2026-03-29 | CSP 安全策略、XSS 修復、Windows 孤兒行程清理 |
| **v3.1.8** | 2026-03-12 | Grok MCP 範本，預設模型 → Sonnet 4.6 |
| **v3.1.7** | 2026-02-18 | Claude Sonnet 4.6 模型支援 |
| **v3.1.4** | 2026-01-29 | 新增 macOS 平台支援 |
| **v3.1.0** | 2026-01-13 | Skills 面板：複製、啟用/停用、外掛保護 |
| **v2.0.0** | — | 全新 UI 設計、統計面板、自訂 API 端點 |

完整記錄請查看 [CHANGELOG.md](./CHANGELOG.md)。

## 🚀 快速開始

### 第 1 步：環境準備

1. 安裝 [Git for Windows](https://git-scm.com/)（自帶 Git Bash）
2. 安裝 [Node.js](https://nodejs.org/)（推薦 LTS 版本，≥ 18）
3. 以**系統管理員權限**開啟 PowerShell，設定環境變數：

```powershell
setx SHELL "C:\Program Files\Git\bin\bash.exe"
```

4. **重新啟動電腦**（必須重啟才能生效）

---

### 第 2 步：安裝 Claude Code CLI

重新啟動電腦後，開啟新的終端機視窗：

```powershell
npm install -g @anthropic-ai/claude-code
```

---

> ⚠️ **VPN 使用者**：整個安裝和使用過程請確保開啟 **TUN 模式**，否則可能無法連接 Claude 服務。

### 第 3 步：登入 Claude Code

#### 使用官方帳號

```powershell
claude
```

瀏覽器會自動開啟授權頁面，登入後複製 Token 貼回終端機即可。

#### 使用 🔑 第三方 API 設定

如果你使用第三方 API，需要在擴充套件內進行設定：

1. 按 `Ctrl+Shift+C` 開啟聊天介面
2. 點擊右上角的設定按鈕 ⚙️
3. 勾選 **"Use Custom API Endpoint"**
4. 在 **API Key** 欄填寫你的金鑰（如 `sk-ant-xxxxxxxxxx`）
5. 在 **Base URL** 欄填寫 API 位址（如 `https://v3.codesome.cn`）
6. 設定會自動儲存，左下角提示 "Settings updated successfully" 即設定成功

[![API 設定](docs/assets/api.png)](docs/assets/api.png)

**切換回官方帳號**：取消勾選 "Use Custom API Endpoint" 即可。

> 💡 **提示**：
>
> - 如果 API 金鑰錯誤，聊天會一直顯示 "processing" 直到逾時
> - 可以隨時透過設定開關在官方帳號和第三方 API 之間切換

---

> 💡 本擴充套件支援各種第三方 API 服務（如 [v3.codesome.cn](https://v3.codesome.cn)、[openrouter.ai](https://openrouter.ai)），具體 URL 請諮詢你的 API 供應商。

---

### 第 4 步：安裝擴充套件

#### ✨ 方式一：VS Code 市場安裝（推薦）

1. 開啟 VS Code 或 Cursor
2. 按 `Ctrl+Shift+X` 開啟擴充套件面板
3. 搜尋 `Claude-Code ChatUI` 或 `lkbaba`
4. 點擊 **安裝**

**直達連結：** [**➡️ VS Code 市場**](https://marketplace.visualstudio.com/items?itemName=lkbaba.claude-code-chatui)

#### 📦 方式二：GitHub Release 下載

1. [**🔗 前往 Releases 頁面**](https://github.com/LKbaba/Claude-code-ChatInWindows/releases/latest)
2. 下載 `.vsix` 檔案
3. VS Code 中按 `Ctrl+Shift+P`，選擇 **"擴充功能: 從 VSIX 安裝..."**

#### 🛠️ 方式三：從原始碼建置

```powershell
git clone https://github.com/LKbaba/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows
npm install
npm run package
# 產生的 .vsix 檔案在專案根目錄，按方式二安裝即可
```

---

### 第 5 步：開始使用

- **開啟聊天介面**：按快捷鍵 `Ctrl+Shift+C`
- **檔案總管圖示**：新建資料夾按鈕旁邊有圖示，點擊即可

## ❓ 常見問題

<details>
<summary><strong>Q: 遇到 "No suitable shell found" 錯誤？</strong></summary>

1. 確保已安裝 Git for Windows
2. 以系統管理員權限執行：`setx SHELL "C:\Program Files\Git\bin\bash.exe"`
3. **重新啟動電腦**（必須重啟才能生效）

如果問題仍然存在，嘗試：

1. 開啟系統環境變數設定（Win + X → 系統 → 進階系統設定 → 環境變數）
2. 確保 PATH 中有 `C:\Program Files\Git\cmd`
3. 重新啟動電腦

</details>

<details>
<summary><strong>Q: 設定了第三方 API 但聊天沒有回應？</strong></summary>

Claude Code CLI 有時候需要先在命令列初始化。請在 PowerShell 中執行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$Env:ANTHROPIC_API_KEY  = "sk-xxxxxxxxxxxxxxxxxxxxxxxx"
$Env:ANTHROPIC_BASE_URL = "https://v3.codesome.cn"
claude
```

如仍有問題，嘗試更新 Claude Code CLI：

```powershell
npm install -g @anthropic-ai/claude-code@latest
```

</details>

<details>
<summary><strong>Q: 電腦重啟後第三方 API 失效？</strong></summary>

環境變數 `$Env:ANTHROPIC_API_KEY` 和 `$Env:ANTHROPIC_BASE_URL` 是臨時設定，電腦重啟後會失效。

有兩種解決方案：

**方案一**：每次重啟後重新設定

```powershell
$Env:ANTHROPIC_API_KEY  = "你的 API Key"
$Env:ANTHROPIC_BASE_URL = "https://v3.codesome.cn"
claude
```

**方案二**：設定為永久環境變數（以系統管理員權限執行）

```powershell
setx ANTHROPIC_API_KEY "你的 API Key"
setx ANTHROPIC_BASE_URL "https://v3.codesome.cn"
# 重新啟動電腦後生效
```

</details>

<details>
<summary><strong>Q: 遇到 "rg: command not found" 錯誤？</strong></summary>

這是可選的，不影響正常使用。如果想安裝 ripgrep 以獲得更好的搜尋效能：

```bash
# 在 Git Bash 中：
curl -L https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep-14.1.0-x86_64-pc-windows-msvc.zip -o ripgrep.zip
unzip ripgrep.zip && mkdir -p ~/bin
cp ripgrep-14.1.0-x86_64-pc-windows-msvc/rg.exe ~/bin/
echo 'alias rg="~/bin/rg"' >> ~/.bashrc && source ~/.bashrc
```

注意：擴充套件內建的 Grep 工具即使沒有 ripgrep 也能正常運作。

</details>

---

## 🤝 如何參與貢獻

1. Fork 本專案，建立獨立分支
2. 聚焦一個新功能或痛點優化
3. 在真實 Windows 環境充分測試
4. 提交 Pull Request，描述清晰易懂

歡迎所有 Windows 上的 AI 工程師、開發者、極客加入！

---

## 📝 開源授權

本專案基於 **MIT 協議** 開源。詳見 [LICENSE](LICENSE)。

---

## 🙏 致謝

- **andrepimenta** – 原始專案 [claude-code-chat](https://github.com/andrepimenta/claude-code-chat)
- **Mrasxieyang (linux.do 社群)** – 提供了 Windows 原生安裝的核心問題解決方案
- **Anthropic** – 創造出強大的 Claude 與 Claude Code
- **所有為 Claude Code 應用生態添磚加瓦的開發者們 ❤️**
