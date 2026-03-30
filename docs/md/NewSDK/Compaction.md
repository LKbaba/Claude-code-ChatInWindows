# Compaction

## 概述

Compaction 是针对 Opus 4.6 和 Sonnet 4.6 的 **Beta 功能**，用于处理超长对话（可能超出 200K token 上下文窗口的场景）。服务端会自动将早期对话历史压缩为摘要，使对话得以无缝延续，而无需客户端手动截断消息列表。使用时需传入 beta 请求头 `compact-2026-01-12`，并将完整的 `response.content`（而非仅文本）追加回消息数组。

---

## Overview

For long-running, multi-turn conversations that risk exceeding Claude's 200K-token context window, server-side compaction automatically summarizes earlier context when needed. This keeps the conversation alive without client-side message truncation or manual summarization.

**Supported models:** Opus 4.6, Sonnet 4.6

**Beta header required:** `compact-2026-01-12`

---

## How It Works

When the accumulated context approaches the context window limit, the server inserts a compaction block into the response. This block represents a compressed summary of the earlier conversation history. Subsequent turns use this summary in place of the full raw history, freeing up token budget for new content.

The compaction is transparent to the user — the conversation continues naturally. The client's only obligation is to append `response.content` (the full content array, not just the text string) to the messages array on every turn.

---

## Critical Rule: Append `response.content`, Not Just Text

Standard (non-compaction) code often appends only the text:
```typescript
// Incorrect for compaction — loses compaction blocks
messages.push({ role: "assistant", content: response.content[0].text });
```

For compaction to work correctly, you must append the full content array:
```typescript
// Correct — preserves compaction blocks
messages.push({ role: "assistant", content: response.content });
```

Compaction blocks are special structured objects inside `response.content`. If you discard them by extracting only the text, the server loses the compaction context on the next turn and the feature breaks silently.

---

## TypeScript Example

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const messages: Anthropic.Beta.BetaMessageParam[] = [
  { role: "user", content: "Start of a very long conversation..." },
];

// Turn loop — runs for as many turns as needed
while (true) {
  const response = await client.beta.messages.create({
    betas: ["compact-2026-01-12"],
    model: "claude-opus-4-6",
    max_tokens: 16000,
    messages,
    context_management: {
      edits: [{ type: "compact_20260112" }],
    },
  });

  // Append the full content array — not just the text string
  messages.push({ role: "assistant", content: response.content });

  // Extract display text for the user
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as Anthropic.Beta.BetaTextBlock).text)
    .join("");

  console.log("Assistant:", text);

  // Add next user turn (example — replace with real input)
  const nextUserMessage = getUserInput(); // your input source
  if (!nextUserMessage) break;
  messages.push({ role: "user", content: nextUserMessage });
}
```

---

## Request Structure

| Field | Value | Notes |
|-------|-------|-------|
| `betas` | `["compact-2026-01-12"]` | Required beta header array |
| `model` | `"claude-opus-4-6"` or `"claude-sonnet-4-6"` | Compaction-supported models only |
| `context_management.edits[].type` | `"compact_20260112"` | Activates server-side compaction |
| `messages` | Full accumulated history | Must include prior compaction blocks |

---

## Response Content Block Types

With compaction enabled, `response.content` may contain any of these block types:

| Block type | Description |
|------------|-------------|
| `"text"` | The assistant's reply text |
| `"thinking"` | Reasoning trace (if adaptive thinking is also enabled) |
| `"compact_20260112"` | Compaction summary block — must be preserved |

Iterate over all blocks when consuming responses. Never filter the array before appending to `messages`.

---

## Integration with Thinking & Effort

Compaction is compatible with adaptive thinking. You can combine both features:

```typescript
const response = await client.beta.messages.create({
  betas: ["compact-2026-01-12"],
  model: "claude-opus-4-6",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  output_config: { effort: "high" },
  messages,
  context_management: {
    edits: [{ type: "compact_20260112" }],
  },
});
```

When using both features together, `response.content` may contain thinking blocks, text blocks, and compaction blocks — all of which must be appended verbatim to `messages`.

---

## Common Pitfalls

- **Appending only text instead of the full content array** — compaction blocks are silently dropped, causing the server to re-expand context on the next turn and the conversation to eventually fail with a context-too-long error.
- **Using the wrong beta header string** — the header must be exactly `"compact-2026-01-12"`. Any typo causes the feature to be ignored.
- **Using `client.messages.create` instead of `client.beta.messages.create`** — beta features require the `.beta` namespace.
- **Targeting unsupported models** — Opus 4.5, Sonnet 4.5, and Haiku 4.5 do not support compaction. The request will return an error.
- **Mutating or filtering `messages` before re-sending** — compaction blocks must remain intact in the messages array across all turns.

---

## When to Use Compaction

Compaction is most valuable when:

- Building chat agents or assistants with unbounded conversation length
- Running long agentic loops where tool-call history accumulates rapidly
- Working with document analysis or code review sessions that span many turns
- Any scenario where you cannot predict in advance how long the conversation will be

For short, bounded conversations (a few turns with small inputs), compaction adds unnecessary overhead. Use it selectively for workloads that genuinely risk hitting the 200K context limit.
