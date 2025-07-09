# Claude Code Chat in Windows 🎉

<div align="center">
  <img src="icon.png" alt="Claude Code Chat Icon" width="128" height="128">
  
  <h3>Claude Code + Cursor + Windows = ❤️</h3>
  
  **終於！Windows 使用者也能在 Cursor 中輕鬆使用 Claude Code，告別命令列的煩惱！**
  
  [![VS Code Version](https://img.shields.io/badge/VS%20Code-%3E%3D1.94.0-blue)](https://code.visualstudio.com/)
  [![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://www.microsoft.com/windows)
  [![Cursor Compatible](https://img.shields.io/badge/Cursor-相容-purple)](https://cursor.sh/)
  [![Based on](https://img.shields.io/badge/基於-claude--code--chat-orange)](https://github.com/andrepimenta/claude-code-chat)
</div>

## 🎯 痛點問題

如果你是一個想在 Cursor 中使用 Claude Code 的 Windows 使用者，你一定體會過這些痛苦：
- 😫 終端命令在 Windows 上總是出問題
- 🤯 路徑問題、權限錯誤、Git Bash 衝突層出不窮
- 😔 看著 Mac 使用者享受絲滑的 Claude Code 體驗，自己卻在踩坑
- 🚫 沒有友善的圖形介面，只能對著黑乎乎的終端發呆

**這個專案一次性解決所有問題！**

## 🌟 我的故事

大家好！我是一個「感覺流程式設計師」（vibe coder）- 靠直覺而非深厚技術知識編程的人。當我發現 Claude Code 時，被它的強大能力震撼了，但 Windows 上的終端介面簡直是噩夢。

後來我找到了 [andrepimenta 的 claude-code-chat](https://github.com/andrepimenta/claude-code-chat) 專案 - 一個漂亮的 Claude Code 圖形介面！但它並沒有為 Windows 使用者做優化。

所以我做了什麼？我請 Claude Code 幫我改進它！🤖 我們一起創造了這個 Windows 優化版本，增加了許多新功能，讓 Windows 使用者也能愉快地使用 Claude Code。

## ✨ 新增功能與改進

### 🪟 Windows 專屬優化
- **Git Bash 深度整合**：與 Git Bash 無縫整合，命令執行不再出錯
- **智慧路徑處理**：自動轉換 Windows 路徑（再也不用糾結 `/c/Users` 還是 `C:\Users`！）
- **權限管理**：妥善處理 Windows 特有的權限需求
- **原生體驗**：為 Windows 使用者量身定制的 UI 和互動

### 📊 增強的 Token 統計功能
- **即時追蹤**：精確顯示你使用了多少 token
- **費用估算**：即時了解對話成本
- **使用分析**：追蹤使用模式，優化 Claude 使用效率
- **視覺化儀表板**：漂亮的圖表展示 token 使用情況

### 🔧 改進的 MCP（模型上下文協議）支援
- **簡單配置**：透過 UI 輕鬆設定 MCP 伺服器
- **多伺服器支援**：同時連接多個 MCP 伺服器
- **Windows 友善**：MCP 伺服器在 Windows 上完美運行
- **內建工具**：預配置常用工具，開箱即用

### 🎨 UI 改進
- **完美主題適配**：與你的 Cursor 主題完美融合
- **響應式設計**：在任何螢幕尺寸上都表現出色
- **增強的檔案引用**：改進的 `@檔案` 提及系統
- **流暢動畫**：全面優化的互動體驗

## 🚀 Cursor 使用者快速開始

### 前置要求
1. **Windows 10/11**（這個顯而易見！😄）
2. **[Git for Windows](https://git-scm.com/)**（包含 Git Bash）
3. **[Node.js](https://nodejs.org/)** v18 或更高版本
4. **[Cursor](https://cursor.sh/)**（或 VS Code v1.94.0+）

### 安裝步驟

```bash
# 1. 全域安裝 Claude CLI
npm install -g @anthropic-ai/claude-code

# 2. 登入 Claude（一次性設定）
claude login

# 3. 在 Cursor 中安裝本擴充套件
# 方法一：使用提供的 VSIX 檔案
# - 從 releases 下載 claude-code-chat-ui-windows.vsix
# - 在 Cursor 中：Ctrl+Shift+P → "從 VSIX 安裝"

# 方法二：從原始碼建置
git clone https://github.com/yourusername/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows
npm install
npm run package
# 然後安裝生成的 VSIX 檔案
```

### 首次啟動
1. 按 `Ctrl+Shift+C` 開啟 Claude Chat
2. Git Bash 路徑會自動檢測（通常是 `C:\Program Files\Git\bin\bash.exe`）
3. 開始與 Claude 聊天吧！🎉

## 📸 介面截圖

<div align="center">
  <img src="docs/screenshots/main-interface.png" alt="主介面" width="600">
  <p><em>整合在 Cursor 中的漂亮聊天介面</em></p>
  
  <img src="docs/screenshots/token-stats.png" alt="Token 統計" width="600">
  <p><em>即時 token 追蹤和費用估算</em></p>
  
  <img src="docs/screenshots/mcp-config.png" alt="MCP 配置" width="600">
  <p><em>簡單易用的 MCP 伺服器配置</em></p>
</div>

## 🎮 使用技巧

### 給「感覺流程式設計師」的建議
- **別擔心終端！** 所有操作都是圖形化的
- **使用自然語言** - Claude 能理解你的意思
- **輕鬆引用檔案** - 輸入 `@` 即可選擇檔案
- **開啟思考模式** 解決複雜問題
- **關注 token 使用** 避免超出限制

### 進階功能
- **斜線命令**：輸入 `/` 查看所有可用命令
- **思考模式**：從 `think` 到 `ultrathink`，應對複雜問題
- **計劃模式**：讓 Claude 先規劃再實施
- **Git 整合**：自動備份，輕鬆恢復
- **MCP 工具**：透過外部工具擴充功能

## 📊 功能對比

| 功能 | 原版 claude-code-chat | 本專案 |
|------|---------------------|--------|
| Windows 支援 | 基礎 | **完全優化** ✨ |
| Git Bash 整合 | 無 | **有** ✅ |
| Token 統計 | 基礎 | **進階分析** 📊 |
| MCP 支援 | 有限 | **完整支援** 🔧 |
| 路徑處理 | 手動 | **自動** 🎯 |
| 費用追蹤 | 無 | **有** 💰 |
| 主題整合 | 好 | **完美** 🎨 |

## 🤝 參與貢獻

你也是「感覺流程式設計師」想要幫助改進專案？太棒了！以下是參與方式：

1. **回報問題**：如果在你的 Windows 環境中遇到問題，請告訴我們！
2. **分享想法**：有好的功能建議？開個討論吧！
3. **測試回饋**：試用並告訴我們你的體驗
4. **程式碼貢獻**：即使是小改進也非常歡迎！

```bash
# Fork 並複製
git clone https://github.com/yourusername/Claude-code-ChatInWindows.git
cd Claude-code-ChatInWindows

# 安裝相依套件
npm install

# 進行修改
# 按 F5 在 Cursor 中測試

# 提交 PR！
```

## 🙏 致謝

- **特別感謝 [andrepimenta](https://github.com/andrepimenta)** 創建了原版 claude-code-chat 專案，給了我靈感
- **[Anthropic](https://anthropic.com)** 創造了 Claude 和 Claude Code
- **Claude Code 本身** 幫助我這個「感覺流程式設計師」完成了 Windows 優化版本！
- **Windows 開發者社群** 的耐心和回饋

## 📝 授權條款

MIT 授權條款 - 因為分享就是關愛！詳見 [LICENSE](LICENSE) 檔案。

## 🌟 支援專案

如果這個專案幫助你在 Windows 上使用 Claude Code：
- ⭐ **給專案加星** 幫助其他人發現它
- 🐛 **回報 Bug** 在 [Issues](https://github.com/yourusername/Claude-code-ChatInWindows/issues) 板塊
- 💡 **分享想法** 在 [Discussions](https://github.com/yourusername/Claude-code-ChatInWindows/discussions)
- 📢 **告訴其他 Windows 使用者** 這個好消息！

---

<div align="center">
  <h3>由 Windows 使用者製作，為 Windows 使用者服務 ❤️</h3>
  <p>特別感謝 Claude 幫助一個「感覺流程式設計師」實現這個專案！🤖</p>
</div>