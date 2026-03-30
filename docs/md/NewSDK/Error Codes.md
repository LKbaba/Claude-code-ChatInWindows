# Error Codes

Reference for HTTP status codes, typed SDK exceptions, and error handling patterns in the Anthropic API

## 概述

本文档覆盖 Anthropic API 返回的所有错误码及其对应含义、处理策略和 SDK 封装类。错误分为两类：**不可重试错误**（4xx，通常由请求本身的问题引起，重试无效）和**可重试错误**（429、500、529，由速率限制或服务端瞬时故障引起，配合指数退避重试可恢复）。TypeScript SDK 和 Python SDK 均将每种 HTTP 错误码映射为具名异常类，便于精确捕获和处理。

---

## Error Code Quick Reference

| HTTP Code | Error Type | Retryable | Common Cause |
|-----------|------------|-----------|--------------|
| 400 | `invalid_request_error` | No | Invalid request format or parameters |
| 401 | `authentication_error` | No | Invalid or missing API key |
| 403 | `permission_error` | No | API key lacks permission for this resource |
| 404 | `not_found_error` | No | Invalid endpoint path or unknown model ID |
| 413 | `request_too_large` | No | Request body exceeds size limits |
| 429 | `rate_limit_error` | Yes | Too many requests in a given time window |
| 500 | `api_error` | Yes | Unexpected error on the Anthropic service side |
| 529 | `overloaded_error` | Yes | API is temporarily overloaded; capacity constrained |

---

## SDK Typed Exceptions

Both SDKs expose named exception classes so you can catch specific error conditions without string-matching on error messages.

| HTTP Code | TypeScript Class | Python Class |
|-----------|-----------------|--------------|
| 400 | `Anthropic.BadRequestError` | `anthropic.BadRequestError` |
| 401 | `Anthropic.AuthenticationError` | `anthropic.AuthenticationError` |
| 403 | `Anthropic.PermissionDeniedError` | `anthropic.PermissionDeniedError` |
| 404 | `Anthropic.NotFoundError` | `anthropic.NotFoundError` |
| 429 | `Anthropic.RateLimitError` | `anthropic.RateLimitError` |
| 500+ | `Anthropic.InternalServerError` | `anthropic.InternalServerError` |

> All SDK error classes extend a base `APIError` (TypeScript: `Anthropic.APIError`, Python: `anthropic.APIError`) which exposes `.status` (HTTP code), `.message`, and `.error` (raw API error body).

---

## Per-Error Detail

### 400 — invalid_request_error

**Cause**: The request body is malformed, contains unknown fields, uses an invalid combination of parameters, or violates a schema constraint (e.g., a `messages` array that is empty, or a `max_tokens` value that exceeds the model's limit).

**Fix**:
- Validate your request object against the API schema before sending.
- Check the `.message` field of the error — it usually identifies the exact offending parameter.
- Ensure `messages` alternates user/assistant roles; two consecutive messages of the same role are invalid.
- Verify `max_tokens` does not exceed the model's documented maximum output token count.

**TypeScript**
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

try {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
  });
} catch (error) {
  if (error instanceof Anthropic.BadRequestError) {
    // error.status === 400
    console.error("Request was malformed:", error.message);
    // Inspect error.error for the raw API body: { type, error: { type, message } }
  }
}
```

**Python**
```python
import anthropic

client = anthropic.Anthropic()

try:
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello"}],
    )
except anthropic.BadRequestError as e:
    # e.status_code == 400
    print(f"Request was malformed: {e.message}")
    # e.body contains the raw API error payload
```

---

### 401 — authentication_error

**Cause**: The API key is absent, has been revoked, is typed incorrectly, or belongs to a different environment (e.g., a test key used against the production endpoint).

**Fix**:
- Confirm the key is set: `ANTHROPIC_API_KEY` environment variable or the `apiKey` constructor option.
- Do not prefix the key with `Bearer` — the SDK handles the Authorization header automatically.
- Regenerate the key in the Anthropic Console if it has been revoked.

**TypeScript**
```typescript
import Anthropic from "@anthropic-ai/sdk";

// Correct: pass key explicitly or rely on ANTHROPIC_API_KEY env var
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

try {
  await client.messages.create({ model: "claude-opus-4-6", max_tokens: 16, messages: [] });
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("Check your ANTHROPIC_API_KEY — key is invalid or missing.");
  }
}
```

**Python**
```python
import anthropic
import os

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

try:
    client.messages.create(model="claude-opus-4-6", max_tokens=16, messages=[])
except anthropic.AuthenticationError as e:
    print("Check your ANTHROPIC_API_KEY — key is invalid or missing.")
```

---

### 403 — permission_error

**Cause**: The API key is valid but lacks the necessary permissions. This can happen when:
- Accessing a model that requires a special tier or agreement (e.g., Claude Opus 4.6 behind an enterprise agreement).
- Using a restricted endpoint (e.g., batch API or Files API) without the required plan.
- IP allowlist restrictions block the request origin.

**Fix**:
- Check your Anthropic Console for the key's permission scope.
- Contact Anthropic support if you believe the key should have access.
- Do not retry — permission issues are configuration problems, not transient failures.

**TypeScript**
```typescript
try {
  await client.messages.create({ model: "claude-opus-4-6", max_tokens: 1024, messages: [...] });
} catch (error) {
  if (error instanceof Anthropic.PermissionDeniedError) {
    console.error("API key lacks permission. Check Console key settings.");
  }
}
```

**Python**
```python
try:
    client.messages.create(model="claude-opus-4-6", max_tokens=1024, messages=[...])
except anthropic.PermissionDeniedError as e:
    print("API key lacks permission. Check Console key settings.")
```

---

### 404 — not_found_error

**Cause**: The requested resource does not exist. Typical causes:
- A model ID that is misspelled or has been retired (e.g., `claude-3-sonnet-20240229` is retired).
- A batch ID or file ID that does not belong to the authenticated account.
- A typo in the API path when constructing raw HTTP requests.

**Fix**:
- Use the Models API or the Models Reference document to verify the current model ID.
- Prefer stable alias IDs (e.g., `claude-opus-4-6`) rather than full date-stamped IDs — aliases track the latest revision automatically.
- Double-check batch/file IDs are copied correctly.

**TypeScript**
```typescript
try {
  await client.messages.create({ model: "claude-3-sonnet-20240229", max_tokens: 1024, messages: [...] });
} catch (error) {
  if (error instanceof Anthropic.NotFoundError) {
    // This model ID has been retired — switch to a current model
    console.error("Model not found. Use 'claude-sonnet-4-6' instead.");
  }
}
```

**Python**
```python
try:
    client.messages.create(model="claude-3-sonnet-20240229", max_tokens=1024, messages=[...])
except anthropic.NotFoundError as e:
    # This model ID has been retired
    print("Model not found. Use 'claude-sonnet-4-6' instead.")
```

---

### 413 — request_too_large

**Cause**: The total serialized size of the request body exceeds the API's size limit. This typically happens when:
- Passing very large images as base64 data URLs inline in the `messages` array.
- Sending an extremely long conversation history without pruning older turns.
- Uploading file content inline rather than using the Files API.

**Fix**:
- Use the Files API to upload large binary content and reference it by file ID.
- Truncate or summarize conversation history before it grows too large.
- Compress or resize images before encoding them as base64.

---

### 429 — rate_limit_error

**Cause**: The account has exceeded one of its rate limits. Anthropic enforces limits on:
- **RPM** (requests per minute)
- **TPM** (tokens per minute — both input and output combined)
- **TPD** (tokens per day) for some tiers

The `retry-after` response header indicates the number of seconds to wait before retrying.

**Fix**: Implement exponential backoff with jitter. Both SDKs perform automatic retries with backoff by default (up to 2 retries). For heavy workloads use the Batch API, which is not subject to synchronous rate limits.

**TypeScript**
```typescript
import Anthropic from "@anthropic-ai/sdk";

// The SDK retries up to 2 times automatically with exponential backoff.
// Increase maxRetries for workloads that frequently hit rate limits.
const client = new Anthropic({ maxRetries: 4 });

// Manual retry loop with jitter (for cases beyond SDK retry budget):
async function createWithBackoff(params: Anthropic.MessageCreateParamsNonStreaming) {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError && attempt < maxAttempts - 1) {
        const backoffMs = Math.min(1000 * 2 ** attempt + Math.random() * 500, 30_000);
        console.warn(`Rate limited. Retrying in ${backoffMs.toFixed(0)}ms (attempt ${attempt + 1})`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } else {
        throw error;
      }
    }
  }
}
```

**Python**
```python
import anthropic
import time
import random

# The SDK retries automatically; bump max_retries for heavy workloads.
client = anthropic.Anthropic(max_retries=4)

def create_with_backoff(params: dict, max_attempts: int = 6):
    """Manual retry loop with exponential backoff and jitter."""
    for attempt in range(max_attempts):
        try:
            return client.messages.create(**params)
        except anthropic.RateLimitError:
            if attempt == max_attempts - 1:
                raise
            backoff = min(1.0 * (2 ** attempt) + random.uniform(0, 0.5), 30.0)
            print(f"Rate limited. Retrying in {backoff:.2f}s (attempt {attempt + 1})")
            time.sleep(backoff)
```

---

### 500 — api_error

**Cause**: An unexpected error occurred on Anthropic's infrastructure. This is not caused by your request — the same request may succeed on a retry.

**Fix**: Retry with exponential backoff (the SDK does this automatically). If the error persists across many retries over a long period, check the [Anthropic status page](https://status.anthropic.com) and contact support with the `request-id` response header value.

---

### 529 — overloaded_error

**Cause**: The Anthropic API is experiencing high demand and temporarily cannot accept new requests. This is distinct from a rate limit (which is per-account) — a 529 is a service-wide capacity constraint.

**Fix**: Same retry strategy as 500. Consider using the Batch API for large workloads, which queues requests and is immune to synchronous overload errors.

**TypeScript**
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ maxRetries: 5 });

try {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Summarize this document." }],
  });
} catch (error) {
  if (error instanceof Anthropic.InternalServerError) {
    // Covers both 500 and 529
    console.error(`Server error (HTTP ${error.status}): ${error.message}`);
    console.error("Request ID for support:", error.headers?.["request-id"]);
  }
}
```

**Python**
```python
import anthropic

client = anthropic.Anthropic(max_retries=5)

try:
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Summarize this document."}],
    )
except anthropic.InternalServerError as e:
    # Covers both 500 and 529
    print(f"Server error (HTTP {e.status_code}): {e.message}")
    print("Request ID for support:", e.response.headers.get("request-id"))
```

---

## Complete Error Handler Pattern

A production handler that dispatches to the correct strategy for each error class:

**TypeScript**
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ maxRetries: 3 });

async function safeCreate(
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message | null> {
  try {
    return await client.messages.create(params);
  } catch (error) {
    if (!(error instanceof Anthropic.APIError)) {
      throw error; // Re-throw non-API errors (network failures, etc.)
    }

    switch (true) {
      case error instanceof Anthropic.BadRequestError:
        console.error("[400] Malformed request — fix the payload before retrying:", error.message);
        return null; // Non-retryable

      case error instanceof Anthropic.AuthenticationError:
        console.error("[401] Invalid API key — check ANTHROPIC_API_KEY.");
        return null; // Non-retryable

      case error instanceof Anthropic.PermissionDeniedError:
        console.error("[403] Insufficient permissions for this resource.");
        return null; // Non-retryable

      case error instanceof Anthropic.NotFoundError:
        console.error("[404] Resource not found — check model ID or resource ID.");
        return null; // Non-retryable

      case error instanceof Anthropic.RateLimitError:
        console.warn("[429] Rate limit reached — SDK will retry automatically.");
        throw error; // Let SDK retry budget handle it

      case error instanceof Anthropic.InternalServerError:
        console.warn(`[${error.status}] Server error — SDK will retry automatically.`);
        throw error; // Let SDK retry budget handle it

      default:
        console.error(`[${error.status}] Unexpected API error:`, error.message);
        throw error;
    }
  }
}
```

**Python**
```python
import anthropic
from typing import Optional

client = anthropic.Anthropic(max_retries=3)

def safe_create(params: dict) -> Optional[anthropic.types.Message]:
    try:
        return client.messages.create(**params)

    except anthropic.BadRequestError as e:
        print(f"[400] Malformed request — fix the payload before retrying: {e.message}")
        return None  # Non-retryable

    except anthropic.AuthenticationError as e:
        print("[401] Invalid API key — check ANTHROPIC_API_KEY.")
        return None  # Non-retryable

    except anthropic.PermissionDeniedError as e:
        print("[403] Insufficient permissions for this resource.")
        return None  # Non-retryable

    except anthropic.NotFoundError as e:
        print("[404] Resource not found — check model ID or resource ID.")
        return None  # Non-retryable

    except anthropic.RateLimitError as e:
        # SDK already retried; re-raise so caller can decide
        print(f"[429] Rate limit exhausted after retries: {e.message}")
        raise

    except anthropic.InternalServerError as e:
        print(f"[{e.status_code}] Server error after retries: {e.message}")
        raise

    except anthropic.APIError as e:
        print(f"[{e.status_code}] Unexpected API error: {e.message}")
        raise
```

---

## Common Mistakes

The table below documents the most frequently encountered misconfigurations and their corrections.

| Mistake | Incorrect | Correct |
|---------|-----------|---------|
| Catching the base `Error` class obscures error type | `catch (e) { console.log(e.message) }` | `catch (e) { if (e instanceof Anthropic.RateLimitError) { ... } }` |
| Hardcoding a retired model ID | `model: "claude-3-sonnet-20240229"` | `model: "claude-sonnet-4-6"` |
| Retrying non-retryable errors in a tight loop | Infinite retry on `BadRequestError` | Return/throw immediately for 4xx (except 429) |
| Omitting the API key, relying on wrong env var name | `ANTHROPIC_KEY=sk-...` | `ANTHROPIC_API_KEY=sk-ant-...` |
| Setting `maxRetries: 0` and manually sleeping | Manual `sleep(1000)` loop | `new Anthropic({ maxRetries: 4 })` — SDK handles jitter |
| Not reading `retry-after` header | Sleeping a fixed 1 s | Read `error.headers["retry-after"]` for the authoritative wait time |
| Using `InternalServerError` to catch 4xx errors | `catch InternalServerError` for 403 | `InternalServerError` only covers HTTP 500+ |
| Missing await on async create call | `client.messages.create(...)` (no await) | `await client.messages.create(...)` |

---

## Accessing the Raw Error Body

Both SDKs expose the full API error payload for logging and debugging:

**TypeScript**
```typescript
import Anthropic from "@anthropic-ai/sdk";

try {
  await client.messages.create({ model: "claude-opus-4-6", max_tokens: 1024, messages: [] });
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    console.log("HTTP status :", error.status);
    console.log("Error type  :", error.error?.type);          // e.g. "invalid_request_error"
    console.log("Error message:", error.error?.error?.message);
    console.log("Request ID  :", error.headers?.["request-id"]);
  }
}
```

**Python**
```python
import anthropic

try:
    client.messages.create(model="claude-opus-4-6", max_tokens=1024, messages=[])
except anthropic.APIError as e:
    print("HTTP status :", e.status_code)
    print("Error type  :", e.body.get("type") if e.body else None)
    print("Error message:", e.message)
    print("Request ID  :", e.response.headers.get("request-id"))
```

---

## Related Documentation

- [TypeScript SDK Reference](TypeScript%20SDK%20reference.md) — Full API surface and constructor options
- [Python SDK Reference](Python%20SDK%20reference.md) — Full API surface and constructor options
- [Models Reference](Models%20Reference.md) — Current, legacy, and retired model IDs
- [Tracking Costs and Usage](Tracking%20Costs%20and%20Usage.md) — Token usage and billing patterns
