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
- `--no-dependencies`: skips `npm install` during packaging — dependencies are already in `node_modules` from development; without this flag, vsce may fail or produce a bloated package
- Do NOT use `npx @vscode/vsce package` directly in Git Bash — it silently fails (exit 0 but no .vsix generated)
- Output file: `claude-code-chatui-{version}.vsix`

Install VSIX for testing:
- VS Code: `Ctrl+Shift+P` → "Install from VSIX"
- CLI: `code --install-extension claude-code-chatui-{version}.vsix`

Debug (Extension Development Host):
- `Ctrl+Shift+D` → select "Run Extension" → click green play button
- Remote desktop: F5 may be intercepted, use the play button instead

## Architecture Overview

### Data Flow

```
User input → Webview postMessage → ClaudeChatProvider
  → ClaudeProcessService (stdin JSON) → Claude CLI
  → stdout JSON stream → MessageProcessor → postMessage → Webview
```

### Key Components

| Component | File | Role |
|-----------|------|------|
| Entry point | `src/extension.ts` | Registers commands, subscriptions, status bar |
| Webview orchestrator | `src/providers/ClaudeChatProvider.ts` | Owns all managers/services, handles all webview messages |
| CLI lifecycle | `src/services/ClaudeProcessService.ts` | Spawn, kill, temp-file cleanup |
| Stream parser | `src/services/MessageProcessor.ts` | JSON-line parsing, tool-use extraction, token/cost dispatch |
| Process mgmt | `src/managers/WindowsCompatibility.ts` | Executable discovery, `taskkill` tree kill, shell env |
| Config facade | `src/managers/config/ConfigurationManagerFacade.ts` | Combines VsCode + MCP + API config managers |
| Undo/redo | `src/managers/UndoRedoManager.ts` | Strategy pattern — one strategy class per operation type |
| UI HTML | `src/ui-v2/index.ts` | Assembles full HTML: CSP header + styles + body + script |
| UI script | `src/ui-v2/ui-script.ts` | Entire frontend JS as a TypeScript template literal |
| UI body | `src/ui-v2/getBodyContent.ts` | HTML body markup (settings panel, chat area, footer) |

### Webview UI Assembly

`index.ts` calls `getBodyContent()` for the HTML body and `getScript()` (from `ui-script.ts`) for the frontend JS, then wraps them in a complete HTML document with a CSP `<meta>` tag and `<style>` block. The result is a single self-contained HTML string — no external resources are loaded.

### Design Patterns
- **Strategy pattern**: Undo/redo operations — each `OperationType` has a strategy in `src/managers/operations/strategies/`
- **Facade pattern**: `ConfigurationManagerFacade` unifies 3 config sub-managers
- **Singleton pattern**: `DebugLogger`, `PluginManager`, `SkillManager`, `SecretService`
- **Stream protocol**: CLI communication via `--input-format stream-json --output-format stream-json`

## Critical Gotchas

### 1. CSP + Inline Event Handlers (KNOWN RECURRING ISSUE)

The webview has **119 inline event handlers** (`onclick`, `onchange`, etc.) spread across `getBodyContent.ts` (~98) and `ui-script.ts` (~21). Any CSP policy using `script-src 'nonce-xxx'` or `script-src 'strict-dynamic'` will **freeze the entire UI** — buttons become unresponsive, no errors in console.

**Current policy** (`src/ui-v2/index.ts`):
```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none';
```

**Rule**: Do NOT attempt nonce-based CSP unless you first refactor all 119 inline handlers to `addEventListener`. This has caused production breakage twice.

### 2. ui-script.ts Template Literal Nesting

`ui-script.ts` exports a **JavaScript string inside a TypeScript template literal**. This creates double-layered escaping:

- Source `\\\\` → JS output `\\` → runtime `\`
- Source `\\'` → JS output `'`
- Template literals inside the JS code use `\`` (escaped backtick)

When writing regex or escape sequences in `ui-script.ts`, always think: "What does the TypeScript compiler emit, and what does the browser's JS engine see?"

Example — matching a single backslash in the browser:
```
Source (ui-script.ts):  str.replace(/\\\\\\\\/g, ...)   // 4 backslashes in source
TS compiler emits:      str.replace(/\\\\/g, ...)       // 2 backslashes in JS
Browser regex matches:  \                                // 1 literal backslash
```

### 3. XSS in Template-Generated HTML

`ui-script.ts` dynamically builds HTML via string concatenation. All user-controlled data must be escaped:
- Display text: `escapeHtml(value)`
- Inside `onclick` attributes: `escapeForOnclick(value)` (JS-escape then HTML-escape)
- Markdown content: `escapeHtml()` first, then pass to `parseSimpleMarkdown()`

### 4. Windows Orphan Processes

Windows does NOT auto-kill child processes when a parent exits (unlike Linux SIGHUP). Both scenarios create orphans:
- Closing the chat panel (webview dispose)
- Closing VS Code entirely

**Fix**: `ClaudeProcessService.dispose()` calls `killProcess(pid)` which uses `taskkill /t /f` to kill the entire process tree. Both `provider` and `treeDisposable` must be in `context.subscriptions` to ensure `dispose()` fires on VS Code exit.

### 5. Git Bash VSIX Packaging

`npx @vscode/vsce package` silently produces no output in Git Bash (exit code 0 but no .vsix file). Always wrap with `cmd //c "..."`.

### 6. StatisticsCache Dual Timestamps

The cache uses two separate timestamps:
- `fileTimestamp`: the file's mtime — detects if the file changed on disk
- `cachedAt`: when the cache entry was created — drives the 5-minute TTL expiry

Before v3.1.9, these were a single field, causing all caches for files older than 5 minutes to be perpetually "expired."

## Version Release Checklist

When bumping the version, update **all three locations**:

1. **`package.json`** → `"version": "x.y.z"`
2. **`src/ui-v2/getBodyContent.ts`** → version display string (search for `vX.Y.Z`)
3. **`CHANGELOG.md`** → add new version section at the top

Then:
```bash
npm run compile
cmd //c "npx @vscode/vsce package --no-dependencies"
```

Verify the output file name matches the new version: `claude-code-chatui-{version}.vsix`

## Code Conventions

- **User communication**: Chinese — conversations with the maintainer, PR descriptions, issue comments
- **Code comments**: English only
- **Spec naming**: `specs/{topic}.md` for requirements, `specs/{topic}-PLAN.md` for implementation plans
- **Commit messages**: can be Chinese or English, but code-facing content (comments, variable names, log strings) must be English
- **No unused dependencies**: remove from `package.json` if no code references exist
- **`.vscodeignore`**: keep `specs/**`, `reference/**`, `CCimages/**`, `.claude/**` excluded from VSIX — these are dev-only; including them bloats the VSIX with no user benefit
- **Tests**: no automated test suite currently exists; verification is done manually via the Extension Development Host (F5)
- **Linting**: `eslint.config.mjs` is present but no pre-commit hooks are configured; run `npx eslint src/` manually before packaging

## Playwright MCP Guide

File paths:
- Screenshots: `./CCimages/screenshots/`
- PDFs: `./CCimages/pdfs/`

Browser version fix:
- Error: "Executable doesn't exist at chromium-XXXX" → Version mismatch
- v1.0.12+ uses Playwright 1.57.0, requires chromium-1200 with `chrome-win64/` structure
- Quick fix: `npx playwright@latest install chromium`
- Manual symlink (if needed): `cd ~/AppData/Local/ms-playwright && cmd //c "mklink /J chromium-1200 chromium-1181"`

## Codex MCP Guide

Codex is an autonomous coding agent by OpenAI, integrated via MCP.

Workflow: Claude plans architecture → delegate scoped tasks to Codex → review results
- `codex` tool: start a session with prompt, sandbox, approval-policy
- `codex-reply` tool: continue a session by threadId for multi-turn tasks
- Pass project context via `developer-instructions` parameter
- Recommended: sandbox='workspace-write', approval-policy='on-failure'

Prerequisite: `npm i -g @openai/codex`, OPENAI_API_KEY configured
