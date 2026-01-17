## Development Environment
- OS: Windows 10.0.19045
- Shell: Git Bash
- Path format: Windows (use forward slashes in Git Bash)
- File system: Case-insensitive
- Line endings: CRLF (configure Git autocrlf)

## Playwright MCP Guide

File paths:
- Screenshots: `./CCimages/screenshots/`
- PDFs: `./CCimages/pdfs/`

Browser version fix:
- Error: "Executable doesn't exist at chromium-XXXX" → Version mismatch
- v1.0.12+ uses Playwright 1.57.0, requires chromium-1200 with `chrome-win64/` structure
- Quick fix: `npx playwright@latest install chromium`
- Manual symlink (if needed): `cd ~/AppData/Local/ms-playwright && cmd //c "mklink /J chromium-1200 chromium-1181"`
