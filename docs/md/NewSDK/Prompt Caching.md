# Prompt Caching

## 概述

提示缓存（Prompt Caching）通过复用之前请求中已处理的 token 来降低延迟和成本。核心机制是**前缀匹配**：在请求中标记缓存断点（`cache_control`），若后续请求的前缀与已缓存内容完全一致，则命中缓存并跳过对应 token 的计算。渲染顺序固定为 tools → system → messages，任何位于断点之前的字节发生变化都会导致该断点及其之后的所有缓存失效。本文档解释缓存放置模式、常见的静默失效原因，以及如何通过响应的 `usage` 字段验证缓存命中。

---

## Core Invariant

Prompt caching is a **prefix match**, not a content hash or semantic match.

The API renders the final prompt in a fixed order before comparing against cached prefixes:

```
1. tools          (all tool definitions, in list order)
2. system         (system prompt blocks, in order)
3. messages       (conversation turns, oldest first)
```

A cache breakpoint marks the end of a prefix segment. When the API receives a request, it walks the rendered prompt from left to right and checks whether each breakpoint prefix exists in the cache store. The first byte difference anywhere in the prefix invalidates that breakpoint and everything after it.

**Consequence**: a stable large block placed early in the render order benefits every request. A dynamic value placed before the breakpoint invalidates the cache on every request, silently, with no error.

---

## Cache Control API

Add a `cache_control` key to any content block to mark it as the end of a cacheable prefix.

```python
# 5-minute TTL (default)
{"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}}

# 1-hour TTL
{"type": "text", "text": "...", "cache_control": {"type": "ephemeral", "ttl": "1h"}}
```

**Limits**:
- Maximum **4 breakpoints** per request.
- Minimum **~1,024 tokens** in the prefix for a breakpoint to be eligible for caching. Shorter prefixes are ignored silently.
- TTL options: `"5m"` (default when `ttl` is omitted) and `"1h"`.

---

## Placement Patterns

### Pattern 1 — Large shared system prompt

Place the breakpoint on the **last block of the system prompt**. All requests sharing the same system prompt will hit the cache regardless of the conversation content that follows.

```python
response = client.messages.create(
    model="claude-opus-4-6",
    system=[
        {
            "type": "text",
            "text": LARGE_SYSTEM_PROMPT,           # stable, thousands of tokens
            "cache_control": {"type": "ephemeral"}  # breakpoint here
        }
    ],
    messages=[{"role": "user", "content": user_query}],
    max_tokens=1024,
)
```

Because `system` renders before `messages`, the system prefix is fixed regardless of what the user says. Any change to `LARGE_SYSTEM_PROMPT` invalidates the cache; the conversation content is irrelevant to this breakpoint.

### Pattern 2 — Multi-turn conversations

In a long conversation, the growing message history is the dominant cost. Place a breakpoint on the **last content block of the most recent assistant turn** to cache everything up to that point.

```python
messages = [
    {"role": "user",      "content": "Tell me about black holes."},
    {"role": "assistant", "content": [
        {
            "type": "text",
            "text": prior_assistant_response,
            "cache_control": {"type": "ephemeral"}  # breakpoint at end of prior turn
        }
    ]},
    {"role": "user", "content": "What about neutron stars?"},  # new turn, not cached
]
```

On each new turn, move the breakpoint to the end of the latest assistant message. The prefix up to that point is stable and will be reused on the next request.

> **Tip**: If the conversation is very long (many turns), consider placing a second breakpoint earlier in the history at a stable "anchor" point, such as the end of turn 2. This creates a two-tier cache: a long-lived prefix for early history and a short-lived prefix for recent turns.

### Pattern 3 — Shared prefix, varying suffix

When many requests share a common preamble (instructions, few-shot examples, documents) followed by a varying user query, place the breakpoint at the **end of the shared portion**.

```python
shared_blocks = [
    {"type": "text", "text": FEW_SHOT_EXAMPLES},
    {"type": "text", "text": REFERENCE_DOCUMENT, "cache_control": {"type": "ephemeral"}},
]

for user_query in user_queries:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        system=shared_blocks,
        messages=[{"role": "user", "content": user_query}],
        max_tokens=512,
    )
```

Each iteration reuses the cached shared prefix. Only the `user_query` is computed fresh each time.

---

## Silent Invalidators

These patterns cause the prefix to change on every request, defeating caching without any error or warning. The only symptom is `cache_read_input_tokens` staying at zero.

| Pattern | Why it breaks the cache |
|---|---|
| `datetime.now()` anywhere before the breakpoint | The prefix changes every second; no two requests share the same prefix |
| `uuid4()` or any random value early in content | Every request generates a unique prefix |
| `json.dumps(d)` without `sort_keys=True` | Python dict iteration order is insertion-order but may differ across objects; non-deterministic key order produces different serializations |
| Conditional system prompt sections (e.g., feature flags) | Each flag combination is a distinct prefix; the cache becomes fragmented across N variations |
| Incrementing counters or timestamps in tool descriptions | Tool definitions render first; any change there invalidates the entire system + messages cache |
| Injecting per-user session IDs into the system prompt | Creates one cache entry per user; cache is never reused across users |
| Modifying tool definitions between requests | Tools render before system and messages; even a whitespace change in a tool description invalidates all downstream breakpoints |

**Diagnostic procedure**: if you suspect a silent invalidator, log the full rendered prefix for two consecutive requests and diff them byte-by-byte. The first differing position is the invalidator.

---

## Verifying Cache Hits

Inspect `response.usage` after each request:

```python
response = client.messages.create(...)

print(response.usage.input_tokens)              # tokens computed fresh
print(response.usage.cache_read_input_tokens)   # tokens served from cache
print(response.usage.cache_creation_input_tokens)  # tokens written to cache this request
```

| Field | Meaning |
|---|---|
| `input_tokens` | Tokens that were computed (billed at full input rate) |
| `cache_creation_input_tokens` | Tokens written to a new cache entry this request (billed at cache-write rate, ~25% more than input) |
| `cache_read_input_tokens` | Tokens served from cache (billed at cache-read rate, ~10% of input) |

**If `cache_read_input_tokens` is zero on the second request with identical content**, a silent invalidator is active. Work through the table above to find it.

**Expected first-request behavior**: `cache_creation_input_tokens > 0`, `cache_read_input_tokens == 0`. The first request always writes; it never reads its own write within the same call.

**Expected second-request behavior** (same prefix, within TTL): `cache_read_input_tokens > 0`, `cache_creation_input_tokens == 0`.

```python
def log_cache_efficiency(usage):
    total = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    if total == 0:
        return
    hit_rate = usage.cache_read_input_tokens / total * 100
    print(f"Cache hit rate: {hit_rate:.1f}%  "
          f"(read={usage.cache_read_input_tokens}, "
          f"write={usage.cache_creation_input_tokens}, "
          f"fresh={usage.input_tokens})")
```

---

## Cost and Latency Impact

| Token type | Relative cost vs standard input |
|---|---|
| Standard input tokens | 1.00x (baseline) |
| Cache write tokens | ~1.25x (slightly more expensive; amortized over cache lifetime) |
| Cache read tokens | ~0.10x (90% reduction) |

Latency improvement is most pronounced for large prefixes (10,000+ tokens): the model skips KV-cache recomputation for all cached tokens, which typically shaves hundreds of milliseconds off time-to-first-token.

**Break-even**: a breakpoint becomes net-cost-positive after the cache entry is read more than once within its TTL. For a 5-minute TTL, a system prompt used by more than ~2 requests per 5 minutes will see net savings.

---

## Common Mistakes

**Mistake: placing the breakpoint too late in the message list**

If you put the breakpoint on the last user message, the cached prefix includes a user turn that changes every request. The cache is never reused.

**Mistake: using `ttl: "1h"` for highly dynamic prefixes**

A 1-hour TTL is only useful if the prefix remains stable for an hour. If the prefix changes every few minutes (e.g., a conversation that keeps growing), the longer TTL wastes cache storage without providing hits.

**Mistake: exceeding 4 breakpoints**

Extra `cache_control` blocks beyond the fourth are ignored silently. If you have more than 4 logical segments, merge them or choose the 4 most valuable prefix boundaries.

**Mistake: caching tiny prefixes**

Prefixes below ~1,024 tokens are below the minimum threshold and are ignored. Do not add `cache_control` to short tool definitions or brief system prompts; it has no effect and adds noise to your usage logs.

---

## Related Documentation

- [Claude API Overview](Claude%20API%20Overview.md) — Messages API architecture and tool use
- [Tracking Costs and Usage](Tracking%20Costs%20and%20Usage.md) — Full usage field reference and billing patterns
- [Models Reference](Models%20Reference.md) — Context window sizes relevant to cache capacity
