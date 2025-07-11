# 安装指南

## 方法1：开发模式测试（推荐）

1. 在VS Code中打开此项目文件夹
2. 按 `F5` 键
3. 会启动一个新的VS Code窗口，插件已自动加载
4. 使用快捷键 `Ctrl+Shift+C` 或点击侧边栏图标打开Claude Code Chat

## 方法2：打包安装到VS Code

### 前置要求
确保已安装Node.js和npm

### 步骤

1. 安装依赖：
```bash
npm install
```

2. 编译TypeScript：
```bash
npm run compile
```

3. 安装打包工具（如果没有）：
```bash
npm install -g @vscode/vsce
```

4. 打包插件：
```bash
vsce package
```

5. 安装VSIX文件：
   - 在VS Code中打开命令面板（Ctrl+Shift+P）
   - 输入 "Extensions: Install from VSIX..."
   - 选择生成的 `claude-code-chat-0.1.3.vsix` 文件

## 方法3：直接复制到VS Code扩展目录

1. 编译项目：
```bash
npm install
npm run compile
```

2. 复制整个项目文件夹到VS Code扩展目录：
   - Windows: `%USERPROFILE%\.vscode\extensions\`
   - macOS: `~/.vscode/extensions/`
   - Linux: `~/.vscode/extensions/`

3. 重启VS Code

## 使用说明

- 快捷键：`Ctrl+Shift+C` (Windows/Linux) 或 `Cmd+Shift+C` (macOS)
- 或点击VS Code侧边栏的Claude图标
- 或右键菜单选择 "Open Claude Code Chat"

## 注意事项

- 确保已安装Claude CLI（通过npm安装：`npm install -g @anthropic-ai/claude-code`）
- Windows用户建议安装Git Bash以获得更好的体验
- 首次使用需要登录Claude账号