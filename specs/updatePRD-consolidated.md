# Claude Code ChatUI — Consolidated PRD Updates

> **Version**: v1.0 (consolidated)
> **Date**: 2026-03-29
> **Status**: All items deployed
> **Covers**: v3.0.6 through v3.1.9

This document consolidates all incremental PRD update files (`updatePRDv*.md` and standalone PLAN files) into a single reference. Individual source files have been removed from version control but remain accessible via git history.

## Version Evolution Timeline

| Version | Date | Key Changes | Source File | Status |
|---------|------|-------------|-------------|--------|
| v3.0.6 | 2026-01-12 | Plan Mode sync, angle bracket display, copy cleanup, Language "Only Communicate" mode | `v3.0.6-bugfix-PLAN.md` | Completed |
| v2.1.0 | 2025-11-26 | Gemini MCP integration, SecretService creation, API key injection | `gemini-integration-PLAN.md` | Completed |
| v3.1.3 | 2026-01-23 | Native installer path support (`~/.local/bin`, `~/.claude/bin`), npm made optional | `native-installer-support-PLAN.md` | Completed |
| v3.1.8 | 2026-03-12 | Shell injection fix, API key SecretStorage migration, dead code cleanup, race condition fix | `updatePRDv1.md` + PLAN | Completed |
| v3.1.9 | 2026-03-29 | CSP policy, XSS fixes, Windows orphan process cleanup, cache expiry fix, code hygiene | `updatePRDv2.md` + PLAN | Completed |

## Consolidated Feature Summary

### Security Hardening

**CSP Policy (v3.1.9)**
- Added `Content-Security-Policy` meta tag to webview
- Policy: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'`
- Uses `unsafe-inline` due to 119 inline event handlers — nonce-based CSP caused full UI freeze (known recurring issue)

**XSS Prevention (v3.1.9)**
- Custom command fields escaped via `escapeHtml()`
- onclick attributes use `escapeForOnclick()` (JS-escape + HTML-escape)
- MCP thinking results escaped before markdown parsing
- Angle bracket display in user messages (originally fixed in v3.0.6, reinforced in v3.1.9)

**Shell Injection Fix (v3.1.8)**
- Replaced 9 `exec()` string template calls with `execFile()` + args arrays in `BackupManager.ts`

**API Key Security (v3.1.8)**
- Migrated Anthropic API key from plaintext `settings.json` to VS Code `SecretStorage` (OS keychain)
- Auto-migration for existing users on first launch
- Generalized `SecretService` to support multiple key types (Anthropic + Gemini)

### Process & Stability

**Windows Orphan Process Cleanup (v3.1.9)**
- `provider` and `treeDisposable` registered in `context.subscriptions`
- `killProcess()` Windows `cp.exec` wrapped in proper Promise
- `dispose()` uses `killProcess(pid)` with `taskkill /t /f` for full process tree termination

**Process Startup Race Condition Fix (v3.1.8)**
- Added `_isStarting` mutex flag to `ClaudeProcessService.ts`

**Native Installer Path Support (v3.1.3)**
- Added `~/.local/bin/` and `~/.claude/bin/` to CLI search paths
- Search priority: native installer > npm > Bun
- npm made optional (no hard-fail when missing)

### Bug Fixes

**StatisticsCache Expiry Logic (v3.1.9)**
- Split single timestamp into `fileTimestamp` (file mtime) + `cachedAt` (cache creation time)
- Fixed perpetual cache expiry for files older than 5 minutes

**configChanged Parameter Order (v3.1.9)**
- `addMessage('system', event.data)` → `addMessage(message.data, 'system')`

**Duplicate Event Handlers (v3.1.9)**
- Removed ~150 lines of duplicate `settingsData` message listener
- Removed duplicate `textarea` input event binding

**Missing Config Field (v3.1.9)**
- `ApiConfigManager.getWindowsConfig()` now returns `gitBashPath`

**Plan Mode State Sync (v3.0.6)**
- Plan First switch resets when Claude exits Plan Mode

**Language "Only Communicate" Mode (v3.0.6)**
- Checkbox in language modal: communication in selected language, code comments stay English
- Uses prompt injection instead of `~/.claude/settings.json` for reliability

### Integrations

**Gemini MCP Integration (v2.1.0)**
- `SecretService` for secure Gemini API key storage
- Runtime API key injection into MCP process environment
- Settings UI with enable toggle and API key input
- `geminiIntegrationEnabled` configuration flag

### Code Hygiene

**Dead Code Removal (v3.1.8)**
- Deleted unused `src/ui-v2/styles/` directory (14 files, 6,090 lines of dead CSS)
- Eliminated triple `escapeHtml` definition (3 copies → 1)

**Dependency Cleanup (v3.1.9)**
- Removed unused `docx` dependency (-27 KB in VSIX)
- Added `specs/**` to `.vscodeignore`

## Technical Debt Resolved

| Item | Version | Resolution |
|------|---------|------------|
| 119 inline event handlers blocking nonce CSP | v3.1.9 | Documented as known constraint; using `unsafe-inline` |
| Plaintext API keys in settings.json | v3.1.8 | Migrated to SecretStorage |
| Shell injection in BackupManager | v3.1.8 | Replaced exec() with execFile() |
| Dead CSS modules (6,090 lines) | v3.1.8 | Deleted entire styles/ directory |
| npm hard dependency | v3.1.3 | Made optional, native installer prioritized |
| Cache always expiring | v3.1.9 | Dual-timestamp separation |

## Known Remaining Debt

- **119 inline event handlers**: Prevents migration to nonce-based CSP. Full refactor to `addEventListener` required (~98 in `getBodyContent.ts`, ~21 in `ui-script.ts`)
- **No automated test suite**: All verification is manual via Extension Development Host
- **`WindowsCompatibility` class name**: Still named Windows-specific despite supporting macOS since v3.1.4

---

*Consolidated from 7 spec files on 2026-03-29*
*Original files accessible via `git log --diff-filter=D -- specs/`*
