## Development Environment
- OS: Windows 10.0.19045
- Shell: Git Bash
- Path format: Windows (use forward slashes in Git Bash)
- File system: Case-insensitive
- Line endings: CRLF (configure Git autocrlf)

## Build & Package

Compile:
```bash
npm run compile
```

Package VSIX (must use `cmd` wrapper, Git Bash swallows vsce output):
```bash
cmd //c "npx @vscode/vsce package --no-dependencies"
```
- Do NOT use `npx @vscode/vsce package` directly in Git Bash — it silently fails (exit 0 but no .vsix generated)
- Output file: `claude-code-chatui-{version}.vsix`

Install VSIX for testing:
- VS Code: `Ctrl+Shift+P` → "Install from VSIX"
- CLI: `code --install-extension claude-code-chatui-{version}.vsix`

Debug (Extension Development Host):
- `Ctrl+Shift+D` → select "Run Extension" → click green play button
- Remote desktop: F5 may be intercepted, use the play button instead

## Playwright MCP Guide

File paths:
- Screenshots: `./CCimages/screenshots/`
- PDFs: `./CCimages/pdfs/`

Browser version fix:
- Error: "Executable doesn't exist at chromium-XXXX" → Version mismatch
- v1.0.12+ uses Playwright 1.57.0, requires chromium-1200 with `chrome-win64/` structure
- Quick fix: `npx playwright@latest install chromium`
- Manual symlink (if needed): `cd ~/AppData/Local/ms-playwright && cmd //c "mklink /J chromium-1200 chromium-1181"`
