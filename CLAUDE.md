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
cmd //c "npx @vscode/vsce package"
```
- Do NOT pass `--no-dependencies`: as of v5 the extension has a real runtime
  native dependency (`node-pty`). `--no-dependencies` makes vsce skip the entire
  production-dependency tree, which ALSO nullifies the `!node_modules/node-pty/...`
  re-include rules in `.vscodeignore` — the resulting VSIX ships ZERO node_modules
  and node-pty fails to load at runtime (extension installs but the panel won't
  open; F5 still works because it uses the on-disk node_modules). See gotcha #11.
- Do NOT use `npx @vscode/vsce package` directly in Git Bash — it silently fails (exit 0 but no .vsix generated)
- Output file: `claude-code-chatui-{version}.vsix`

Install VSIX for testing:
- VS Code: `Ctrl+Shift+P` → "Install from VSIX"
- CLI: `code --install-extension claude-code-chatui-{version}.vsix`

Debug (Extension Development Host):
- `Ctrl+Shift+D` → select "Run Extension" → click green play button
- Remote desktop: F5 may be intercepted, use the play button instead

## Architecture Overview

### Data Flow (v5.0.1+ — PTY interactive driver)

As of v5.0.1 the extension drives a **real interactive `claude` CLI through a
node-pty pseudo-terminal** (NOT `claude -p` / stream-json). This keeps usage on
the user's subscription pool (Pro/Max) instead of the Agent SDK billing pool.

```
INPUT  side:
User input → Webview postMessage → ClaudeChatProvider
  → ClaudeProcessService (node-pty: bracketed-paste + Enter into a long-lived
    interactive `claude` TUI) → Claude CLI (subscription-billed)

OUTPUT side:
Claude CLI → ~/.claude/projects/{slug}/{sessionId}.jsonl (transcript JSONL)
  → TranscriptTailService (real-time tail) → MessageProcessor (JSONL-line parse)
  → postMessage → Webview
```

Key contrasts with the old `-p` architecture:
- **Output is read from the transcript JSONL, NOT parsed from PTY stdout.** PTY
  stdout is used only for *interaction-state detection* (input-box readiness via
  footer marker, image-chip detection, startup gate dialogs).
- **Turn completion** is detected from `stop_reason === "end_turn"` in the
  transcript (B1), with an optional Stop-hook sentinel fallback (B2).
- A **single long-lived PTY session** is reused across turns; messages are
  injected via bracketed paste + a delayed Enter.
- On Windows, `claude` runs inside Git Bash (ConPTY cannot exec a `.cmd`
  directly); `useConpty: false` (winpty backend).

### Key Components

| Component | File | Role |
|-----------|------|------|
| Entry point | `src/extension.ts` | Registers commands, subscriptions, status bar |
| Webview orchestrator | `src/providers/ClaudeChatProvider.ts` | Owns all managers/services, handles all webview messages; splits image mentions, expands file mentions |
| PTY driver / CLI lifecycle | `src/services/ClaudeProcessService.ts` | Spawn interactive `claude` via node-pty; bracketed-paste injection, slash-command injection, ESC interrupt, staged image-chip injection, startup-gate handling, readiness detection |
| Transcript locator | `src/services/TranscriptLocator.ts` | Encodes cwd → project slug, finds the session JSONL under `~/.claude/projects` |
| Transcript tail | `src/services/TranscriptTailService.ts` | Real-time tail of the session JSONL; emits new lines |
| Transcript parser | `src/services/MessageProcessor.ts` | JSONL-line parsing, tool-use extraction, `end_turn` detection, token/cost dispatch |
| Cost estimation | `src/services/ModelPricing.ts` | Local token×unit-price cost estimate (subscription mode shows estimated, not billed, amounts) |
| Stop-hook fallback | `src/services/StopHookFallbackService.ts` | Optional idempotent one-shot Stop hook writing an end-of-turn sentinel (B2) |
| Process mgmt | `src/managers/WindowsCompatibility.ts` | Executable discovery (`findCliExecutable` priority order), `taskkill` tree kill (Win) / SIGTERM (Unix), shell env |
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
- **PTY interactive driver** (v5.0.1+): input injected via node-pty bracketed
  paste; output read by tailing the transcript JSONL. The old stream-json
  (`--input-format stream-json --output-format stream-json`) protocol has been
  removed.

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

### 8. PTY Driver Depends on Undocumented TUI Strings (FRAGILE)

The v5 driver detects interaction state by scanning the `claude` TUI's own
output for **hard-coded English marker strings**. These are undocumented CLI
internals that can change across `claude` versions and silently break the driver:

- **Input-box readiness**: footer markers `shift+tab to cycle` / `? for shortcuts`
  (`_scanInputBoxReady` in `ClaudeProcessService.ts`). If absent, injection
  either never fires or fires too early and gets swallowed.
- **Image attachment chip**: regex `/\[\s*image\s*#?\s*(\d+)\s*\]/gi` matching
  `[Image #N]` (`_detectImageChip`). If the chip text changes, staged image
  injection times out and degrades to a `Read` round-trip (§ image flow below).
- **Startup gate dialogs**: ANSI-stripped substring match on `yesiaccept` /
  `yesitrustthisfolder` to auto-navigate the trust / bypass-permissions prompts
  with a Down-arrow + Enter (`_handleStartupGate`).
- **Turn completion**: transcript `stop_reason === "end_turn"` — a JSONL schema
  contract, also version-dependent.

Verified on `claude` 2.1.85 (the npm build the extension launches) and 2.1.119.
There is **no runtime version guard**: a future CLI that renames any of these
markers fails silently (hang / lost image / stuck "processing"), not loudly.
When debugging "UI hangs after sending" or "image not seen", first check the
installed `claude --version` and whether these marker strings still appear in
the raw PTY output (DebugLogger logs `PTY raw output`).

### 9. PTY Injection Timing & Idempotency

- **Bracketed paste needs a delayed Enter**: pasting `\x1b[200~text\x1b[201~`
  then immediately writing `\r` gets the Enter swallowed by the TUI. A
  `PASTE_SUBMIT_DELAY_MS` (~250ms) gap is required.
- **Slash commands inject char-by-char** (`injectSlashCommand`, ~60ms/char) so
  the TUI's slash menu can filter; concurrent slash injection is guarded by
  `_slashInjecting` (two at once → garbled `//mmooddeell`).
- **Staged image injection is idempotent** under the reinject watchdog
  (`_stagedInjectInProgress` / `_stagedArmed`); a re-call must never stack
  duplicate chips or re-submit. ESC interrupt (`stopProcess`) sends bare `\x1b`
  and resets staged state without killing the PTY session.

### 10. No Generic TUI Menu Navigation Yet

The only arrow-key navigation is the hard-coded one-shot startup gate (#8). There
is currently **no generic capability** to detect a runtime TUI option menu
(permission approval, `ExitPlanMode` Yes/No, `AskUserQuestion` options) and
inject an arrow-key + Enter selection. Permission menus are bypassed wholesale by
the default `bypassPermissions` mode; plan-mode confirmation is handled at the
prompt level. The legacy `AskUserQuestion` handling in `MessageProcessor.ts` /
`ui-script.ts` is **dead code from the `-p` era** (its comments still describe
`-p` auto-error behavior) — revive/replace it deliberately if building an
interactive options UI.

### 11. `--no-dependencies` Drops node-pty From the VSIX (REGRESSION TRAP)

`vsce package --no-dependencies` makes vsce **skip the entire production-dependency
tree**. This ALSO defeats the `!node_modules/node-pty/...` re-include negations in
`.vscodeignore` (those negations only matter while vsce is walking node_modules at
all). Net effect: the VSIX ships **zero `node_modules`**, so at runtime
`require('node-pty')` throws → the extension activates but **the chat panel won't
open** (clicking the icon does nothing). The Extension Development Host (F5) is
unaffected because it loads the on-disk `node_modules` directly.

This was latent from v5.0.1 (when node-pty was introduced) and shipped broken in
the v5.0.3 GitHub release. v4.x was unaffected — it had no native runtime dep.

**Rule**: package with plain `cmd //c "npx @vscode/vsce package"` (NO
`--no-dependencies`). vsce then bundles prod deps (node-pty + glob) and
`.vscodeignore` still trims `.pdb` (~40MB) and non-win32 prebuilds. Always verify:
`unzip -l <vsix> | grep node-pty` must show the `prebuilds/win32-x64/*.node`
binaries; `unzip -l <vsix> | grep '\.pdb'` must be empty.

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
cmd //c "npx @vscode/vsce package"
```

Verify the output file name matches the new version: `claude-code-chatui-{version}.vsix`.
Also confirm node-pty is bundled: `unzip -l <vsix> | grep node-pty` must list the
`prebuilds/win32-x64/*.node` binaries (see gotcha #11).

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
