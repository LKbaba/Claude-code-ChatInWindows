# Thinking & Effort

## 概述

本文档说明如何在 Anthropic SDK 中控制 Claude 的"思考"行为与推理深度。Opus 4.6 和 Sonnet 4.6 支持 **自适应思考 (adaptive thinking)**，无需手动指定 `budget_tokens`；通过 `output_config.effort` 参数可进一步调节推理深度。旧版模型仍需使用显式的 `budget_tokens` 配置。

---

## Adaptive Thinking (Opus 4.6 and Sonnet 4.6)

For Opus 4.6 and Sonnet 4.6, the recommended approach is `thinking: { type: "adaptive" }`. With adaptive thinking, Claude dynamically decides when thinking is beneficial and how long to spend on it. You do not need to supply a `budget_tokens` value — that field is **deprecated** on these two models.

Adaptive thinking also enables interleaved thinking automatically, meaning thinking blocks can appear between tool calls in agentic workloads. No beta header is required for this behavior.

```typescript
thinking: { type: "adaptive" }
```

> Note: `budget_tokens` sent alongside `type: "adaptive"` on Opus 4.6 or Sonnet 4.6 is silently ignored. Remove it from any migrated code to avoid confusion.

---

## Effort Parameter

The `effort` parameter gives you coarse control over how deeply Claude reasons before responding. It is placed inside `output_config`, **not** at the top level of the request.

```typescript
output_config: { effort: "low" | "medium" | "high" | "max" }
```

- Default value: `"high"`
- `"max"` is available on **Opus 4.6 only**
- The parameter is generally available (GA) — no beta header is required
- Passing `effort` to Sonnet 4.5 or Haiku 4.5 will return an error

### Effort Levels

| Level | Description |
|-------|-------------|
| `"low"` | Minimal reasoning; fastest, lowest cost |
| `"medium"` | Balanced reasoning for routine tasks |
| `"high"` | Deep reasoning; the default behavior |
| `"max"` | Maximum reasoning depth (Opus 4.6 only) |

---

## Model Compatibility Matrix

| Model | Adaptive Thinking | `budget_tokens` | `effort` parameter | `effort: "max"` |
|-------|:-----------------:|:---------------:|:------------------:|:---------------:|
| Opus 4.6 | Yes (recommended) | Deprecated | Yes | Yes |
| Sonnet 4.6 | Yes (recommended) | Deprecated | Yes | No |
| Opus 4.5 | No | Required | Yes | No |
| Sonnet 4.5 | No | Required | Error | No |
| Haiku 4.5 | No | Required | Error | No |

---

## Older Models: Explicit `budget_tokens`

For models that do not support adaptive thinking (Opus 4.5 and older), use `thinking: { type: "enabled", budget_tokens: N }`. The budget must be:

- At least **1024** tokens
- Less than the value of `max_tokens`

```typescript
thinking: { type: "enabled", budget_tokens: 8000 }
```

---

## TypeScript Example

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  output_config: { effort: "high" },
  messages: [{ role: "user", content: "Solve this problem..." }],
});

for (const block of response.content) {
  if (block.type === "thinking") {
    console.log("Thinking:", block.thinking);
  } else if (block.type === "text") {
    console.log("Response:", block.text);
  }
}
```

### Response Block Types

A thinking-enabled response can contain two block types in `response.content`:

| Block type | Field | Description |
|------------|-------|-------------|
| `"thinking"` | `block.thinking` | Claude's internal reasoning trace (string) |
| `"text"` | `block.text` | The final answer or response text |

Always iterate over all blocks — thinking blocks and text blocks may interleave, especially in agentic (tool-use) scenarios.

---

## Migration Guide

### From `budget_tokens` to Adaptive Thinking

Before (Opus 4.5 style):
```typescript
thinking: { type: "enabled", budget_tokens: 10000 }
```

After (Opus 4.6 / Sonnet 4.6):
```typescript
thinking: { type: "adaptive" },
output_config: { effort: "high" },  // optional, defaults to "high"
```

Remove `budget_tokens` entirely when targeting Opus 4.6 or Sonnet 4.6. Keeping it alongside `type: "adaptive"` is harmless but misleading.

### Effort vs. Budget Tokens

`effort` is a higher-level abstraction than `budget_tokens`. You no longer need to estimate token counts manually — the runtime maps effort levels to appropriate internal budgets.

---

## Common Pitfalls

- Placing `effort` at the top level instead of inside `output_config` — it will be ignored silently.
- Using `effort: "max"` on Sonnet 4.6 — this returns an API error.
- Keeping `budget_tokens` in code that now targets adaptive models — deprecated, remove it.
- Not iterating over all `response.content` blocks — thinking blocks precede or interleave with text blocks and must be consumed if you want the full reasoning trace.
