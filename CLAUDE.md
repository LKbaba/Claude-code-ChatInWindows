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

### 7. Windows Toast Notification Hooks

When building Stop-hook completion notifications on Windows, use the WinRT Toast API (not `MessageBox`, not `notify-send`). Two places use this pattern and must stay aligned:

- User's personal hook script: `~/.claude/hooks/stop-notify.ps1` (standalone `.ps1` file referenced from the user's `settings.json`)
- Plugin's built-in template: `buildWindowsToastNotifyCmd()` in `src/services/HooksConfigManager.ts` (embedded in a TS template literal, base64-encoded for `powershell -EncodedCommand`)

**Anatomy of a Toast** — two separate icon slots:
- **Top-left small icon** (next to the app name): controlled by `IconUri` registry value under `HKCU:\Software\Classes\AppUserModelId\<appId>`. To get the minimalist default square glyph (⊞), **do NOT set `IconUri`** (or delete it if set). Setting it to a PNG will show that PNG scaled small, which is often not what you want.
- **Body image on the left** (large): controlled by `<image placement="appLogoOverride" src="file:///...">` inside the Toast XML. Located by searching `$env:CLAUDE_PROJECT_DIR\icon.png` then `$PWD\icon.png`. If not found, omit the `<image>` element entirely.

**AppUserModelId cache trap** — Windows caches icons per AppUserModelId in its notification database. Deleting `IconUri` from the registry does NOT always refresh the displayed icon; the old one is stuck in the cache. To force a fresh look: **change `$appId` to a new string** (Windows treats it as a brand-new app with no cache) and delete the old registry key. Restarting `explorer.exe` sometimes works but is unreliable.

**Sound** — the XML's `<audio src="ms-winsoundevent:Notification.Default" />` goes through the Toast audio pipeline, which can be silenced by Windows Focus Assist or per-app notification sound settings. Always add a fallback: `try { [System.Media.SystemSounds]::Asterisk.Play() } catch {}` right before `.Show($toast)`. This uses a different audio pipeline and works independently.

**App name** — register `DisplayName = 'Claude Code'` on the AppUserModelId; otherwise the top-left shows "Windows PowerShell".

**Anti-loop guard** — parse stdin JSON for `stop_hook_active`; if true, `exit 0` without firing the notification. Otherwise the hook triggers itself recursively when Claude responds to the hook's output.

**Embedding in TypeScript** — for the plugin template, write the PowerShell as a clean multi-line TS template literal, then at runtime: `Buffer.from(script, 'utf16le').toString('base64')` and invoke as `powershell -NoProfile -EncodedCommand ${b64}`. This avoids the nested-quote/backslash escaping nightmare of a single-line inline command.

### 8. Context Window `[1m]` Suffix & Auto-Compact Env (v4.1.4)

The context-window indicator and auto-compaction are controlled by **CLI-side behavior**, not the plugin's own math. Reverse-engineered from CLI 2.1.85 (`ClaudeProcessService.ts` injects these):

- **`[1m]` model suffix** — appending `[1m]` to the model ID (e.g. `--model "claude-fable-5[1m]"`) forces the CLI to treat the window as exactly **1,000,000 tokens regardless of whether it recognizes the model**. The CLI detects it via `/\[1m\]/i.test(model)`. Without it, unrecognized new models (fable-5, sonnet-5) default to a **200K** window, causing the indicator to stall at ~16-18% and premature auto-compaction (~82.5% ≈ 165K observed).
- **`CLAUDE_CODE_AUTO_COMPACT_WINDOW`** — sets the auto-compaction trigger point, but the CLI applies it with `Math.min` against the model's real window: **it can only SHRINK the window, never GROW it**. So it only takes effect when combined with `[1m]` (which raises the ceiling to 1M first). Current setting: `400000` → effective compaction ≈ 367K (400K minus ~33K output reserve).
- **`compact_boundary` message** — CLI 2.1.85 emits this system message on compaction; older handling silently dropped it, so the frontend's "indicator only increases, never decreases" logic never reflected post-compact drops. `MessageProcessor` must handle it.

**Rule**: When adding a new model that the installed CLI may not recognize, always ship it with the `[1m]` suffix + `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, otherwise the context indicator breaks. The `MODEL_CONTEXT_WINDOWS` table in `constants.ts` is the plugin-side source of truth for display.

**Update (CLI 2.1.280, docs only, not yet tested)**: the CLI now natively knows the 1M window for Opus 4.7+, Sonnet 5 and Fable 5/5.1; only Opus 4.6 / Sonnet 4.6 still need `[1m]`. The suffix is harmless on the others, so keep it until tested.

### 9. Task-Tracking Tools Are Off by Default on New Models (v4.1.7)

Since CLI 2.1.233, `TodoWrite` / `TaskCreate`-family tools are omitted on Opus 4.8+, Sonnet 5, Fable 5+ and any unrecognized model ID — the todo checklist silently disappears. Even where they exist, the CLI defaults to `TaskCreate/TaskUpdate/TaskList/TaskGet` (one item per call), while the UI only renders `TodoWrite` (full list per call).

**Fix**: `ClaudeProcessService` injects `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` + `CLAUDE_CODE_ENABLE_TASKS=0` (user-set values win). If a future CLI removes `TodoWrite`, the UI must track Task-tool state itself. See `specs/updatePRDv4.md` §3.

### 10. Per-Turn CLI Process (Architecture Constraint)

Each user turn spawns a new CLI, writes one stdin message, then closes stdin (`--resume` carries context). Consequences: background Bash tasks such as dev servers die ~5s after the turn ends; no mid-turn input; stop = `taskkill`; `/loop`, Channels and permission prompts are unavailable. Features that need a long-lived process are blocked until a streaming-input rewrite. Do NOT add `--permission-prompts none` — it removes the `AskUserQuestion` tool the UI relies on.

### 11. Windows Spawn Argument Concatenation (v4.1.7)

On Windows, `claude.cmd` must be spawned with `shell: true`, and Node then joins file + args into one cmd.exe line with **no quoting or escaping** (and prints `DEP0190`). Failures are silent — the CLI ignores stray words and keeps running.

- Multi-line text must go through a file: the appended system prompt is written to `%TEMP%\claude-chatui\append-system-prompt-<hash>.md` and passed via `--append-system-prompt-file`. Passing it inline via `--append-system-prompt` delivered only `#` from v4.1.5 until v4.1.7.
- Args with spaces (executable path, `--mcp-config` under `C:\Users\John Smith`) are quoted by `_quoteForCmd()`, and the full command line is built by the plugin before `cp.spawn(commandLine, { shell: true })`.
- **Verify any change here** with a stand-in `.cmd` that prints its argv — never trust that "it runs" means the args arrived intact. Mac uses `shell: false` and is unaffected.

Official docs mirror (local, gitignored): `docs/md/INDEX.md` → `docs/md/claude-code/`, `agent-sdk/`, `api/`. Re-fetch with `node .tmp-docsync/fetch-docs.js`.

## Version Release Checklist

When bumping the version, update **all five locations**:

1. **`package.json`** → `"version": "x.y.z"`
2. **`src/ui-v2/getBodyContent.ts`** → version display string (search for `vX.Y.Z`)
3. **`CHANGELOG.md`** → add new version section at the top
4. **`README.md`** → add row at the top of the "Recent Updates" table
5. **`README.zh-CN.md`** and **`README.zh-TW.md`** → same table, localized text

Then:
```bash
npm run compile
cmd //c "npx @vscode/vsce package --no-dependencies"
```

Verify the output file name matches the new version: `claude-code-chatui-{version}.vsix`

After packaging, publish the release on GitHub:
- Create a new Release tag `vX.Y.Z` pointing to the latest commit on `main`
- Paste the CHANGELOG section as the release body
- Upload `claude-code-chatui-{version}.vsix` as the release asset

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
