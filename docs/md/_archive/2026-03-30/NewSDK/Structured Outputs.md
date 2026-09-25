# Structured Outputs

Guarantee well-typed, schema-validated JSON from Claude using output formats and strict tool schemas

## 概述

本文档介绍两种获取结构化输出的机制：**JSON 输出格式**（通过 `output_config.format` 字段控制响应格式）和**严格工具模式**（通过 `strict: true` 保证工具参数严格符合 JSON Schema）。推荐使用 SDK 提供的 `client.messages.parse()` 方法（TypeScript 搭配 Zod，Python 搭配 Pydantic），该方法在收到响应后自动验证并反序列化为强类型对象，避免手动 `JSON.parse` 带来的运行时错误。结构化输出目前支持 Claude Opus 4.6、Sonnet 4.6、Haiku 4.5 以及遗留版本 Opus 4.5 和 Opus 4.1。

---

## Overview of the Two Features

| Feature | API Field | Purpose |
|---------|-----------|---------|
| JSON output format | `output_config.format` | Constrains the entire response to valid JSON matching a schema |
| Strict tool use | `tools[n].strict: true` | Guarantees tool call arguments always match the declared input schema |

Both features eliminate the need to parse and validate Claude's plain-text output manually. They are independent — you can use either or both in the same request.

---

## Supported Models

| Model | Alias | Structured Outputs Support |
|-------|-------|---------------------------|
| Claude Opus 4.6 | `claude-opus-4-6` | Yes |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Yes |
| Claude Haiku 4.5 | `claude-haiku-4-5` | Yes |
| Claude Opus 4.5 (legacy) | `claude-opus-4-5` | Yes |
| Claude Opus 4.1 (legacy) | `claude-opus-4-1` | Yes |

Models not listed above (including all Claude 3 and Claude 3.5 versions) do not support the `output_config` field.

---

## Feature 1 — JSON Output Format

### How It Works

Set `output_config.format` in the request to instruct Claude to produce a JSON object that conforms to the supplied schema. The API validates the response against the schema before returning it, so a successful response always contains parseable, schema-conforming JSON.

### Recommended Approach: `messages.parse()`

The SDK's `messages.parse()` helper combines the API call and schema validation into a single step and exposes the result on `.parsed_output`. It is strongly preferred over manually calling `messages.create()` and parsing the text block yourself.

**TypeScript (with Zod)**
```typescript
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic();

// 1. Define the output schema with Zod
const ResearchPaperSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int(),
  abstract: z.string(),
  keywords: z.array(z.string()),
});

type ResearchPaper = z.infer<typeof ResearchPaperSchema>;

// 2. Call messages.parse() — response.parsed_output is fully typed
const response = await client.messages.parse({
  model: "claude-opus-4-6",
  max_tokens: 16000,
  messages: [
    {
      role: "user",
      content: "Extract the paper metadata from this text: ...",
    },
  ],
  output_config: {
    format: zodOutputFormat(ResearchPaperSchema, "research_paper"),
  },
});

// 3. Access the validated, typed result directly
const paper: ResearchPaper = response.parsed_output!;
console.log(paper.title);
console.log(paper.authors.join(", "));
console.log(`Published: ${paper.year}`);
```

**Python (with Pydantic)**
```python
import anthropic
from pydantic import BaseModel

client = anthropic.Anthropic()

# 1. Define the output schema with Pydantic
class ResearchPaper(BaseModel):
    title: str
    authors: list[str]
    year: int
    abstract: str
    keywords: list[str]

# 2. Call messages.parse() — response.parsed_output is a ResearchPaper instance
response = client.messages.parse(
    model="claude-opus-4-6",
    max_tokens=16000,
    messages=[
        {
            "role": "user",
            "content": "Extract the paper metadata from this text: ...",
        }
    ],
    output_config={
        "format": {
            "type": "json_schema",
            "name": "research_paper",
            "schema": ResearchPaper.model_json_schema(),
        }
    },
)

# 3. parsed_output is already a ResearchPaper instance
paper: ResearchPaper = response.parsed_output
print(paper.title)
print(", ".join(paper.authors))
print(f"Published: {paper.year}")
```

### Using `messages.create()` Directly (Raw JSON)

If you prefer to work with the raw API without SDK schema helpers:

**TypeScript**
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  messages: [
    {
      role: "user",
      content: "Return a JSON object with fields: name (string), age (number), active (boolean).",
    },
  ],
  output_config: {
    format: {
      type: "json_schema",
      name: "user_record",
      schema: {
        type: "object",
        properties: {
          name:   { type: "string" },
          age:    { type: "number" },
          active: { type: "boolean" },
        },
        required: ["name", "age", "active"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
});

// The first content block contains the JSON text
const raw = response.content[0].type === "text" ? response.content[0].text : "";
const record = JSON.parse(raw);
console.log(record.name, record.age, record.active);
```

**Python**
```python
import anthropic
import json

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    messages=[
        {
            "role": "user",
            "content": "Return a JSON object with fields: name (string), age (number), active (boolean).",
        }
    ],
    output_config={
        "format": {
            "type": "json_schema",
            "name": "user_record",
            "schema": {
                "type": "object",
                "properties": {
                    "name":   {"type": "string"},
                    "age":    {"type": "number"},
                    "active": {"type": "boolean"},
                },
                "required": ["name", "age", "active"],
                "additionalProperties": False,
            },
            "strict": True,
        }
    },
)

raw = response.content[0].text
record = json.loads(raw)
print(record["name"], record["age"], record["active"])
```

---

## Feature 2 — Strict Tool Use

### How It Works

When defining tools, set `strict: true` on the tool definition. This instructs the model to always produce tool call arguments that exactly match the declared `input_schema`. Without `strict: true`, Claude may occasionally omit optional fields or produce unexpected key names; with it, the schema is enforced.

**TypeScript**
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  tools: [
    {
      name: "get_stock_price",
      description: "Retrieve the current price of a stock by ticker symbol.",
      input_schema: {
        type: "object",
        properties: {
          ticker:   { type: "string", description: "Stock ticker, e.g. AAPL" },
          currency: { type: "string", enum: ["USD", "EUR", "GBP"], description: "Quote currency" },
        },
        required: ["ticker", "currency"],
        additionalProperties: false,
      },
      strict: true,  // Guarantee arguments always match the schema
    },
  ],
  messages: [{ role: "user", content: "What is the price of Apple stock in USD?" }],
});

// Tool use blocks are guaranteed to have exactly { ticker, currency }
const toolUse = response.content.find((b) => b.type === "tool_use");
if (toolUse?.type === "tool_use") {
  const { ticker, currency } = toolUse.input as { ticker: string; currency: string };
  console.log(`Fetching ${ticker} in ${currency}`);
}
```

**Python**
```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    tools=[
        {
            "name": "get_stock_price",
            "description": "Retrieve the current price of a stock by ticker symbol.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "ticker":   {"type": "string", "description": "Stock ticker, e.g. AAPL"},
                    "currency": {"type": "string", "enum": ["USD", "EUR", "GBP"]},
                },
                "required": ["ticker", "currency"],
                "additionalProperties": False,
            },
            "strict": True,  # Guarantee arguments always match the schema
        }
    ],
    messages=[{"role": "user", "content": "What is the price of Apple stock in USD?"}],
)

tool_use = next((b for b in response.content if b.type == "tool_use"), None)
if tool_use:
    ticker   = tool_use.input["ticker"]
    currency = tool_use.input["currency"]
    print(f"Fetching {ticker} in {currency}")
```

---

## Supported JSON Schema Types

The following JSON Schema constructs are supported in `output_config.format.schema` and in strict tool `input_schema`.

| Construct | Supported | Notes |
|-----------|-----------|-------|
| `type: "object"` | Yes | Top-level type for structured outputs |
| `type: "string"` | Yes | Plain strings |
| `type: "number"` | Yes | Float or integer |
| `type: "integer"` | Yes | Whole numbers only |
| `type: "boolean"` | Yes | `true` / `false` |
| `type: "array"` | Yes | Requires `items` definition |
| `type: "null"` | Yes | Explicit null values |
| `enum` | Yes | Fixed value sets |
| `const` | Yes | Single fixed value |
| Nested objects | Yes | Objects within objects, arbitrary depth |
| `required` | Yes | Required field list |
| `additionalProperties: false` | Yes | Recommended — prevents extra keys |
| `$defs` / `$ref` | Yes | Schema composition and reuse |
| `anyOf` / `oneOf` | Yes | Union types |
| `allOf` | Partial | Supported for simple intersection; complex merges may not validate correctly |
| `pattern` (string regex) | No | Regex constraints on strings are not enforced |
| `minLength` / `maxLength` | No | String length constraints are not enforced |
| `minimum` / `maximum` | No | Numeric range constraints are not enforced |
| `format` (e.g., `date-time`) | No | String format hints are ignored |
| `uniqueItems` | No | Array uniqueness constraint is not enforced |

> When a constraint is listed as "not enforced," the field may be accepted without error but the model will not guarantee conformance. Validation constraints you need enforced should be applied in your own code after receiving the response.

---

## Important Notes

### First-Request Latency

The first request using a new `output_config` schema may be slower than subsequent requests. Anthropic's infrastructure processes and caches the schema on first use; repeated requests with the same schema benefit from this caching. This is particularly noticeable for large or complex schemas.

### Refusals

Claude may refuse to populate a structured output if the request conflicts with its safety guidelines. In this case, `response.parsed_output` will be `null` (TypeScript) or `None` (Python), and the response will contain a `refusal` field explaining the reason. Always check for refusals before accessing `parsed_output`:

**TypeScript**
```typescript
const response = await client.messages.parse({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "..." }],
  output_config: { format: zodOutputFormat(MySchema, "my_schema") },
});

if (response.parsed_output === null) {
  // Claude refused — inspect the stop reason
  console.warn("Refusal:", response.stop_reason);
} else {
  // Safe to access structured data
  console.log(response.parsed_output.someField);
}
```

**Python**
```python
response = client.messages.parse(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "..."}],
    output_config={"format": {"type": "json_schema", "name": "my_schema", "schema": MyModel.model_json_schema()}},
)

if response.parsed_output is None:
    # Claude refused
    print(f"Refusal: {response.stop_reason}")
else:
    print(response.parsed_output.some_field)
```

### Token Limits and Schema Size

Complex schemas consume input tokens. Very large schemas (deeply nested objects, many `$ref` references) reduce the effective token budget available for conversation content. Keep schemas as concise as possible; use `description` sparingly on individual properties (rely on the top-level `description` or system prompt for context).

### Incompatibilities

The following combinations are not supported and will return a `400 invalid_request_error`:

| Combination | Reason |
|-------------|--------|
| `output_config` + streaming | Structured outputs require complete response validation; they cannot be streamed incrementally |
| `output_config` + `tool_choice: "auto"` with multiple tools | When using output format, set `tool_choice` to `"none"` or use only strict tools |
| `output_config` on unsupported models | Claude 3, 3.5, and Sonnet 4.5 do not support this field |
| `strict: true` + `additionalProperties` not set to `false` | Always pair `strict: true` with `"additionalProperties": false` in the schema |

### Using System Prompts with Structured Outputs

You can combine a system prompt with structured outputs. The system prompt guides Claude's reasoning and content; the output format governs the shape of the response. If you ask Claude to "think step by step" in the system prompt, include a `reasoning` field in your schema so the chain-of-thought is captured rather than discarded:

**TypeScript**
```typescript
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const AnalysisSchema = z.object({
  reasoning: z.string().describe("Step-by-step analysis"),
  verdict:   z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

const response = await client.messages.parse({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  system: "You are a sentiment analyst. Think through your reasoning carefully before giving a verdict.",
  messages: [{ role: "user", content: "Analyze the sentiment: 'The product exceeded all expectations!'" }],
  output_config: { format: zodOutputFormat(AnalysisSchema, "sentiment_analysis") },
});

const result = response.parsed_output!;
console.log("Reasoning:", result.reasoning);
console.log("Verdict:", result.verdict);
console.log("Confidence:", result.confidence);
```

---

## Zod Helper Reference (TypeScript)

The `@anthropic-ai/sdk/helpers/zod` module provides `zodOutputFormat`, which converts a Zod schema into the JSON Schema object expected by `output_config.format`.

```typescript
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Signature:
// zodOutputFormat(schema: ZodType, name: string) => OutputFormatConfig

const format = zodOutputFormat(
  z.object({ answer: z.string(), confidence: z.number() }),
  "answer_with_confidence"   // 'name' field in the API — used for logging/debugging
);
```

The `name` parameter is a human-readable identifier for the schema. It appears in API logs and error messages but does not affect validation behavior.

---

## Pydantic Helper Reference (Python)

Use `BaseModel.model_json_schema()` to generate the JSON Schema dict required by the API.

```python
from pydantic import BaseModel, Field
from typing import Literal

class SentimentResult(BaseModel):
    reasoning: str = Field(description="Step-by-step chain of thought")
    verdict: Literal["positive", "negative", "neutral"]
    confidence: float = Field(ge=0.0, le=1.0)

# Generate JSON Schema for the API
schema_dict = SentimentResult.model_json_schema()

response = client.messages.parse(
    model="claude-opus-4-6",
    max_tokens=4096,
    messages=[...],
    output_config={
        "format": {
            "type": "json_schema",
            "name": "sentiment_result",
            "schema": schema_dict,
            "strict": True,
        }
    },
)

result: SentimentResult = response.parsed_output
```

---

## Related Documentation

- [TypeScript SDK Reference](TypeScript%20SDK%20reference.md) — Full API surface including `messages.parse()`
- [Python SDK Reference](Python%20SDK%20reference.md) — Full API surface including `messages.parse()`
- [Models Reference](Models%20Reference.md) — Model support matrix and capability flags
- [Custom Tools](Custom%20Tools.md) — Defining and registering tools, including strict mode
- [Error Codes](Error%20Codes.md) — Handling `400 invalid_request_error` for schema violations
