# Claude API Overview

## 概述

本文档是 Claude Messages API 的高层概览。所有请求均通过单一端点 `POST /v1/messages` 发送。API 支持两种工具类别：用户自定义工具（由你的代码实现）和服务端工具（由 Anthropic 托管并在云端执行）。根据任务复杂度，你可以选择单次调用、Tool Runner 自动循环或手动智能体循环三种交互模式。本文档还列出了补充端点（批处理、文件、Token 计数、模型列表）及决策树，帮助你快速选择正确的集成层级。

---

## Architecture

Every interaction with Claude — single-turn or multi-step agentic — goes through one endpoint:

```
POST /v1/messages
```

The surface area breaks into four areas that compose together:

```
POST /v1/messages
├── User-defined tools          (you implement the executor)
│   ├── Tool Runner             (automatic loop — SDK handles tool execution)
│   └── Manual agentic loop     (you drive the turn-by-turn loop)
├── Server-side tools           (Anthropic hosts and executes)
│   ├── Code execution
│   ├── Web search
│   ├── Web fetch
│   ├── Computer use
│   ├── Memory
│   ├── Tool search
│   └── Programmatic tool calling
├── Structured outputs          (JSON Schema-constrained responses)
└── Supporting endpoints
    ├── POST /v1/messages/batches
    ├── POST /v1/files
    ├── POST /v1/messages/count_tokens
    └── GET  /v1/models
```

### User-Defined Tools

You provide a list of tool definitions in the request. Claude decides which tool to call and with what arguments. Your code performs the actual execution.

**Tool Runner (automatic loop)** — The SDK wraps the turn loop for you. You supply a tool executor function; the SDK calls it whenever Claude emits a `tool_use` block, injects the result, and continues until `stop_reason` is `end_turn`.

```python
# Python — automatic loop via tool runner
result = client.beta.messages.run(
    model="claude-opus-4-6",
    tools=[search_tool, calculator_tool],
    tool_executor=my_executor,
    messages=[{"role": "user", "content": "What is the population of Tokyo?"}],
    max_tokens=1024,
)
```

**Manual agentic loop** — You drive the conversation. After each response you inspect `stop_reason`, execute tool calls in your own code, append results to the message list, and send the next request. This gives you full control over retries, parallelism, and error handling.

```python
# Python — manual loop
messages = [{"role": "user", "content": "Summarize the three files attached."}]

while True:
    response = client.messages.create(
        model="claude-opus-4-6",
        tools=my_tools,
        messages=messages,
        max_tokens=4096,
    )
    messages.append({"role": "assistant", "content": response.content})

    if response.stop_reason == "end_turn":
        break

    # collect tool_use blocks, execute them, append tool_result blocks
    tool_results = execute_tools(response.content)
    messages.append({"role": "user", "content": tool_results})
```

### Server-Side Tools

Server-side tools run inside Anthropic's infrastructure. You do not implement an executor. Instead, when Claude emits a `tool_use` block for a server-side tool, the API itself fulfills the call before returning the response to you. The `stop_reason` is `pause_turn` when the model is waiting for a server-side tool result that requires a follow-up request.

| Tool | What it does |
|---|---|
| `code_execution` | Runs Python in a sandboxed interpreter; returns stdout, stderr, and file artifacts |
| `web_search` | Issues a web query and returns structured results |
| `web_fetch` | Fetches a URL and returns cleaned text content |
| `computer_use` | Controls a virtual desktop (screenshot, click, type) |
| `memory` | Reads and writes a persistent key-value store scoped to the API key |
| `tool_search` | Searches a registered tool catalog and returns matching definitions |
| `programmatic_tool_calling` | Executes pre-registered remote tools by name with typed arguments |

```python
# Enabling server-side tools — no executor required
response = client.messages.create(
    model="claude-opus-4-6",
    tools=[{"type": "web_search"}, {"type": "code_execution"}],
    messages=[{"role": "user", "content": "Search for the latest Claude release and plot downloads."}],
    max_tokens=2048,
)
```

### Structured Outputs

Pass a JSON Schema in `response_format` to constrain Claude's response to a valid JSON object. Useful for classification, extraction, and any downstream parser that requires a typed payload.

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=256,
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "sentiment_result",
            "schema": {
                "type": "object",
                "properties": {
                    "label":      {"type": "string", "enum": ["positive", "neutral", "negative"]},
                    "confidence": {"type": "number"}
                },
                "required": ["label", "confidence"]
            }
        }
    },
    messages=[{"role": "user", "content": "Classify: 'The product exceeded my expectations!'"}],
)
```

### Supporting Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /v1/messages/batches` | Submit up to 100,000 requests in one batch; async, ~50% cost reduction |
| `POST /v1/files` | Upload files (PDF, images, documents) for reuse across requests without re-uploading bytes |
| `POST /v1/messages/count_tokens` | Dry-run token count before committing to a paid request |
| `GET /v1/models` | List available models with capability metadata; use instead of hardcoding IDs |

---

## Decision Tree: Which Surface to Use

Use this table to select the correct integration layer before writing any code.

| Use Case | Tier | Surface |
|---|---|---|
| Classification, summarization, Q&A | Single call | Claude API — `POST /v1/messages` |
| Multi-step pipelines (extract, transform, summarize) | Workflow | Claude API + user-defined tool use |
| Custom agent with your own tools (DB, APIs, local files) | Agent | Claude API + user-defined tool use (manual loop) |
| Agent that needs file I/O, web, or terminal access | Agent | Agent SDK (wraps server-side tools) |
| High-volume offline jobs | Batch | Batches API |
| Typed extraction / form filling | Structured | `response_format` with JSON Schema |

**Rule of thumb**: start with a single call. Add tool use when Claude needs to act on external state. Reach for the Agent SDK when you need server-side execution (web, code, computer) without managing tool executors yourself.

---

## Tool Use Concepts

### Tool Definition Structure

Every tool is described by three required fields:

```json
{
  "name": "get_weather",
  "description": "Return current weather for a city. Use when the user asks about weather or temperature.",
  "input_schema": {
    "type": "object",
    "properties": {
      "city":  { "type": "string",  "description": "City name, e.g. 'Tokyo'" },
      "units": { "type": "string",  "enum": ["celsius", "fahrenheit"], "default": "celsius" }
    },
    "required": ["city"]
  }
}
```

- **`name`**: Snake_case identifier, used in `tool_use` blocks to match calls to executors.
- **`description`**: The single most important field. Claude decides whether and when to call a tool based on this text. Be specific about when the tool should and should not be used.
- **`input_schema`**: Standard JSON Schema (draft 7). The more precise the schema, the fewer malformed calls you will see.

### Tool Choice Options

Control how Claude selects tools via the `tool_choice` parameter:

| Value | Behavior |
|---|---|
| `{"type": "auto"}` | Default. Claude decides whether to call a tool or respond in text. |
| `{"type": "any"}` | Claude must call at least one tool, but chooses which one. |
| `{"type": "tool", "name": "get_weather"}` | Claude must call this specific tool. |
| `{"type": "none"}` | Claude must not call any tool, even if tools are listed. |

Use `"any"` when you need a guaranteed structured response. Use `"none"` to disable tools temporarily without removing them from the definition list.

### Tool Runner vs Manual Loop

| Dimension | Tool Runner | Manual Loop |
|---|---|---|
| Who drives the turn loop | SDK | Your code |
| Error handling | SDK retries / surfaces exceptions | You implement retry logic |
| Parallelism | Sequential by default | You can parallelize tool calls |
| Visibility into intermediate steps | Limited — final result only | Full — inspect every turn |
| Suitable for | Simple, well-defined tools | Complex pipelines, conditional branching, streaming |

### Handling Tool Results and Errors

After Claude emits a `tool_use` block, you execute the tool and return a `tool_result` block as a `user` message. Results can be strings, JSON objects, images, or documents.

```python
# Successful result
{
    "type": "tool_result",
    "tool_use_id": "toolu_01A2B3C4D5",
    "content": [{"type": "text", "text": '{"temperature": 22, "condition": "partly cloudy"}'}]
}

# Error result — tell Claude what went wrong so it can recover
{
    "type": "tool_result",
    "tool_use_id": "toolu_01A2B3C4D5",
    "is_error": True,
    "content": [{"type": "text", "text": "City not found. Please check the spelling and try again."}]
}
```

Always return a `tool_result` for every `tool_use` in the response, even on failure. Omitting results causes the model to stall.

### `stop_reason: "pause_turn"` — Server-Side Tools

When a server-side tool is in flight, the API returns `stop_reason: "pause_turn"`. This signals that the model has yielded mid-turn and expects you to send a follow-up request with the accumulated tool results so it can continue.

```python
if response.stop_reason == "pause_turn":
    # collect partial content, append tool results, re-send
    messages.append({"role": "assistant", "content": response.content})
    messages.append({"role": "user",      "content": collect_server_tool_results(response)})
    # loop continues
```

`pause_turn` differs from `tool_use` in that the execution happened server-side; you are not calling an executor yourself. You are resuming a paused model turn.

---

## Stop Reasons Reference

The `stop_reason` field in every response tells you why the model stopped generating.

| Value | Meaning | What to do |
|---|---|---|
| `end_turn` | Model finished naturally | Read the response; conversation turn is complete |
| `max_tokens` | Hit the `max_tokens` limit | Increase `max_tokens`, or continue with the partial output |
| `tool_use` | One or more user-defined tools were called | Execute tools, append results, send next request |
| `pause_turn` | Server-side tool in progress; model is paused mid-turn | Append server tool results, send follow-up request to resume |
| `refusal` | Model declined due to safety policy | Do not retry with the same input; redesign the prompt |

> **Note**: `end_turn` is the only terminal state in an agentic loop. All other values require further action from your code.

---

## Related Documentation

- [Models Reference](Models%20Reference.md) — Model IDs, context windows, and pricing
- [Tracking Costs and Usage](Tracking%20Costs%20and%20Usage.md) — Token counting and billing
- [Prompt Caching](Prompt%20Caching.md) — Cache breakpoints and TTL options
- [Custom Tools](Custom%20Tools.md) — Advanced tool definition patterns
- [Subagents in the SDK](Subagents%20in%20the%20SDK.md) — Orchestrating multi-agent workflows
