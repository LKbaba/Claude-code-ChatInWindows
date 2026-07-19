# Claude CLI Context Window & Auto-Compact Mechanism

> Reference document for how Claude CLI manages the context window in `-p` stream-json mode:
> auto-compact behavior, the `compact_boundary` message, window-size resolution (`[1m]` suffix),
> and the environment variables that control compaction.

## ⚠️ Version Scope

**All conclusions in this document were verified against Claude CLI `2.1.85` (2026-07-18/19).**
After upgrading the CLI, re-verify by re-running the probe script (see [Probe Method](#probe-method--results)):

```bash
node scripts/probe-autocompact.js p1
node scripts/probe-autocompact.js p2
node scripts/probe-autocompact.js p3
```

## 中文摘要

- `-p` stream-json 模式**会**自动压缩上下文（曾被误认为不会）——2026-07-18 日志实锤：上下文爬到 165,320 → CLI 下发 `compact_boundary` → 压缩后骤降至 41,478。
- 压缩触发点不是百分比，是**绝对阈值：窗口 − 33K**（20K 给 compact summary 输出预留 + 13K 安全 buffer）。老 CLI 不认识新模型（fable-5 / sonnet-5）时按 200K 窗口管理 → 200K − 33K ≈ 165K 天花板，这就是指示条"永远卡在 16-18%"的根因之一。
- 任意模型 ID 追加 `[1m]` 后缀 → CLI 直接按 1,000,000 窗口管理（不查表），发 API 请求前后缀会被剥掉并带上 1M beta header。这是外部用户唯一能"调大"窗口的正道。
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` **只能调小、不能调大**（与窗口取 `min`）。配合 `[1m]` 即可实现任意自定义压缩点：`[1m]`(1M) + `WINDOW=400000` → 生效窗口 400K，实际压缩点 ≈ 367K。
- 窗口有下限硬约束：必须大于"系统提示词(33-46K) + 首条消息"，否则首轮直接报 "Prompt is too long" 硬错误而非优雅压缩。本插件将 `contextWindowTokens` 下限定为 100,000。

---

## 1. Auto-Compact Fires in `-p` stream-json Mode (Confirmed)

It was previously assumed that non-interactive `-p` mode never compacts. **This is wrong.**
Captured live from `debug_log.txt` on 2026-07-18 (CLI 2.1.85, model reported by the old CLI as
unknown → managed as a 200K window):

| Time | Event |
|---|---|
| 14:32 | context = 21,152 (session resumed) |
| 15:29:45 | context climbs to **165,320** (≈ 200K × 82.5%) |
| 15:31:33 | CLI emits a **`compact_boundary`** system message on stdout |
| 15:31:40 | compaction done, context drops to **41,478** |

Consequences for any consumer of the stream:

- The `compact_boundary` message **must be handled** (this plugin previously dropped it as
  "unhandled", so the UI never learned the context had shrunk).
- A context-usage indicator must be allowed to **go down** — the drop after compaction is
  correct information, not noise. Any "monotonic max" display logic will pin the indicator
  at the pre-compact value forever.

## 2. `compact_boundary` Message Structure

Exact shape captured from a live P2 probe run (note **snake_case** `pre_tokens`, not `preTokens`):

```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "compact_metadata": {
    "trigger": "auto",
    "pre_tokens": 67113
  }
}
```

- `trigger`: `"auto"` for threshold-triggered compaction (manual `/compact` also produces a boundary).
- `pre_tokens`: context size immediately before compaction.

## 3. CLI 2.1.85 Window Mechanics (Reverse-Engineered Behavior)

The following behaviors were established by black-box probing plus inspection of the local
`cli.js` (2.1.85). Only behavioral conclusions are recorded here — no source code is reproduced.

| Mechanism | Behavior (CLI 2.1.85) |
|---|---|
| **`[1m]` model suffix** | Any model ID ending in `[1m]` (case-insensitive) → context window is treated as **1,000,000 tokens**, unconditionally. No table lookup; works even for model IDs the CLI does not recognize. |
| API-side handling | Before sending the request, the CLI strips the `[1m]` suffix and attaches the 1M-context beta header (`context-1m-2025-08-07`). Confirmed live by P3: the API accepted a 219K-token request on `claude-sonnet-5[1m]`. |
| **`CLAUDE_CODE_AUTO_COMPACT_WINDOW`** | Clamps the managed window **down only** (`min(window, env)`). The community claim "set it to 920K to unlock 1M" does **not** hold on 2.1.85. Combined with `[1m]`, it acts as a precise custom compaction point. |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Overrides the trigger percentage (default ≈ 82.5%). Also down-only. |
| `DISABLE_AUTO_COMPACT=1` (also `DISABLE_COMPACT=1`) | Disables **automatic** compaction entirely; manual `/compact` keeps working. |
| Settings keys | `autoCompactEnabled` / `autoCompactThreshold` exist in settings.json, but process-level env injection is cleaner (does not pollute the user's global settings). |
| **Threshold formula** | `threshold = contextWindow − min(maxOutputTokens, 20_000) − 13_000` — i.e. **window − 33K**: 20K reserved for the compact-summary output (p99.99 ≈ 17.4K tokens) + 13K safety buffer. Matches all observations: 100K window → fires at ~67K; 200K window → fires at ~165K. |
| Failure circuit breaker | After **3 consecutive** compaction failures, auto-compact stops retrying — the session then hits the hard limit and errors with "Prompt is too long". |
| Unknown model fallback | Models the CLI does not recognize (e.g. fable-5 / sonnet-5 on 2.1.85) are managed as **200K** → compaction ceiling at ~165K. This is the origin of the "indicator stuck at 16-18%" symptom. |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | The only variable that can *raise* the window — but it is gated to Anthropic-internal users. Externally, `[1m]` is the only legitimate way up. |

## 4. This Plugin's Approach (and Why)

Combination used by this extension when spawning the CLI (see `src/services/ClaudeProcessService.ts`
and `MODEL_CONTEXT_WINDOWS` in `src/utils/constants.ts`):

```
--model "claude-fable-5[1m]"                         → CLI manages a 1M window
+ env CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000          → min(1M, 400K) = effective 400K
= real compaction point ≈ 400K − 33K = ~367K
```

Rationale:

- **`[1m]` only for known 1M models** (fable-5 / sonnet-5 / opus-4-8 / opus-4-7 / opus-4-6 /
  sonnet-4-6). 200K models (haiku-4-5 etc.) are left untouched; the UI denominator is clamped
  to `min(contextWindowTokens, model window)` so a haiku session is never displayed against 400K.
- **Env is injected per-process at spawn time** — never written to the user's `settings.json`,
  so plain CLI usage outside the extension is unaffected.
- **Default `contextWindowTokens = 400000`**: keeps late-conversation per-request cost bounded
  while removing the 165K ceiling (compaction now fires at ~367K instead).
- **Hard lower bound `100000`**: learned from the first P2 attempt. With `WINDOW=60000`, the
  system prompt (33-46K with MCP) plus the first message overshot the clamped window in one jump —
  turn 2 hard-errored with **"Prompt is too long"** instead of compacting gracefully. The window
  must stay well above (system prompt + first message).
- The UI must display the **latest** context value (input + cache_creation + cache_read of the
  newest assistant message) and render a "compacted (pre_tokens = XXK)" divider when a
  `compact_boundary` arrives. No monotonic-max protection.

## 5. Probe Method & Results

Script: `scripts/probe-autocompact.js` (dev-only, excluded from the VSIX). It drives a real
`claude -p --input-format stream-json --output-format stream-json` session turn by turn with
benign natural-language filler text (random word-salad triggers a Usage Policy refusal),
watches for `compact_boundary` events, and tracks the max context from assistant `usage` fields.

All three probes **PASS** (2026-07-19, CLI 2.1.85):

| # | Question | Setup | Measured Result | Conclusion |
|---|---|---|---|---|
| **P1** ✅ | Does the API accept the `[1m]` suffix? | `claude-fable-5[1m]`, 1 turn | Normal reply, ctx = 33,166, cost $0.21 | Suffix works end-to-end. Bonus: the system prompt alone is ~33K tokens — why the indicator "burns fast" early on. |
| **P2** ✅ | Is the env var honored in `-p` mode? | `[1m]` + `CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`, 8 × 8K-token turns | `compact_boundary` fired at **pre_tokens = 67,113** (turn 3) and **76,697** (turn 7); ctx dropped to ~30K after each; zero errors | Env var is enforced; compaction point is controllable. 67K ≈ 100K − 33K confirms the threshold formula. |
| **P3** ✅ | Does the 165K ceiling disappear? | `claude-sonnet-5[1m]` + `WINDOW=400000`, 12 × 15K-token turns | ctx pushed to **312,169** with **zero** compactions and zero errors (turn 8 crossed 200K at 219K — API accepted), cost $2.82 | Ceiling gone; the 1M beta header is genuinely honored server-side. |

Re-run any probe with `node scripts/probe-autocompact.js p1|p2|p3` (requires `claude` on PATH
and API credentials; P3 costs a few dollars).

## 6. Related Files

| File | Role |
|---|---|
| `src/utils/constants.ts` | `MODEL_CONTEXT_WINDOWS` table + `normalizeModelId()` (date-suffix / `[1m]` stripping) |
| `src/services/ClaudeProcessService.ts` | Spawn-time `[1m]` suffix injection + `CLAUDE_CODE_AUTO_COMPACT_WINDOW` env |
| `src/services/MessageProcessor.ts` | `contextTokens` / `contextLimit` dispatch; `compact_boundary` handling |
| `src/ui-v2/ui-script.ts` | Context indicator (latest-value display, compact divider, no monotonic max) |
| `scripts/probe-autocompact.js` | P1/P2/P3 probes (dev-only) |
| `specs/updatePRDv18.md` | Full investigation record (§0.1, §1.3, §3) |
