# Models Reference

## 概述

本文档列出所有可用的 Claude 模型，包括当前推荐版本、遗留版本、已弃用版本和已退役版本。每个模型条目包含别名（API 调用时使用）、完整 ID、上下文窗口大小、最大输出 token 数量及定价信息。新项目应优先使用"当前推荐模型"中的别名（如 `claude-opus-4-6`），以便在模型更新时无需修改代码即可获得最新版本。

---

## Current Models (recommended)

| Friendly Name     | Alias (use this)    | Full ID                     | Context        | Max Output | Input $/1M | Output $/1M |
|-------------------|---------------------|-----------------------------|----------------|------------|------------|-------------|
| Claude Opus 4.6   | `claude-opus-4-6`   | —                           | 200K (1M beta) | 128K       | $5.00      | $25.00      |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | —                           | 200K (1M beta) | 64K        | $3.00      | $15.00      |
| Claude Haiku 4.5  | `claude-haiku-4-5`  | `claude-haiku-4-5-20251001` | 200K           | 64K        | $1.00      | $5.00       |

---

## Legacy Models (still active)

| Friendly Name     | Alias (use this)    | Full ID                      |
|-------------------|---------------------|------------------------------|
| Claude Opus 4.5   | `claude-opus-4-5`   | `claude-opus-4-5-20251101`   |
| Claude Opus 4.1   | `claude-opus-4-1`   | `claude-opus-4-1-20250805`   |
| Claude Sonnet 4.5 | `claude-sonnet-4-5` | `claude-sonnet-4-5-20250929` |
| Claude Sonnet 4   | `claude-sonnet-4-0` | `claude-sonnet-4-20250514`   |
| Claude Opus 4     | `claude-opus-4-0`   | `claude-opus-4-20250514`     |

---

## Deprecated Models

| Friendly Name  | Full ID                   | Status     | Retires      |
|----------------|---------------------------|------------|--------------|
| Claude Haiku 3 | `claude-3-haiku-20240307` | Deprecated | Apr 19, 2026 |

---

## Retired Models

| Friendly Name     | Full ID                      | Retired      |
|-------------------|------------------------------|--------------|
| Claude Sonnet 3.7 | `claude-3-7-sonnet-20250219` | Feb 19, 2026 |
| Claude Haiku 3.5  | `claude-3-5-haiku-20241022`  | Feb 19, 2026 |
| Claude Opus 3     | `claude-3-opus-20240229`     | Jan 5, 2026  |
| Claude Sonnet 3.5 | `claude-3-5-sonnet-20241022` | Oct 28, 2025 |
| Claude Sonnet 3   | `claude-3-sonnet-20240229`   | Jul 21, 2025 |
| Claude 2.1        | `claude-2.1`                 | Jul 21, 2025 |
| Claude 2.0        | `claude-2.0`                 | Jul 21, 2025 |

---

## Programmatic Model Discovery (Models API)

Use the Models API to retrieve live capability metadata rather than hardcoding values.

```python
m = client.models.retrieve("claude-opus-4-6")
m.id                 # "claude-opus-4-6"
m.display_name       # "Claude Opus 4.6"
m.max_input_tokens   # context window (int)
m.max_tokens         # max output tokens (int)

caps = m.capabilities
caps["image_input"]["supported"]                       # vision
caps["thinking"]["types"]["adaptive"]["supported"]     # adaptive thinking
caps["effort"]["max"]["supported"]                     # effort: max
caps["structured_outputs"]["supported"]
caps["context_management"]["compact_20260112"]["supported"]

# filter models by capability
[m for m in client.models.list()
 if m.capabilities["thinking"]["types"]["adaptive"]["supported"]
 and m.max_input_tokens >= 200_000]
```

---

## User Request Resolution Table

Map natural-language user requests to the correct model ID.

| User says...           | Use this model ID   |
|------------------------|---------------------|
| "opus", "most powerful" | `claude-opus-4-6`  |
| "opus 4.6"             | `claude-opus-4-6`   |
| "opus 4.5"             | `claude-opus-4-5`   |
| "sonnet", "balanced"   | `claude-sonnet-4-6` |
| "sonnet 4.5"           | `claude-sonnet-4-5` |
| "haiku", "fast", "cheap" | `claude-haiku-4-5` |
