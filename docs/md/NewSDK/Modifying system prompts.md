# Modifying system prompts

Learn how to customize Claude's behavior by modifying system prompts using four approaches — output styles, appendSystemPrompt, customSystemPrompt, and the preset mode.

System prompts define Claude's behavior, capabilities, and response style. The Claude Agent SDK provides multiple ways to customize system prompts: using output styles (persistent, file-based configurations), appending to the default prompt, replacing it entirely, or using the `preset` mode to restore the standard Claude Code system prompt.

## Understanding system prompts

A system prompt is the initial instruction set that shapes how Claude behaves throughout a conversation. Claude Code's default system prompt includes:

- Tool usage instructions and available tools
- Code style and formatting guidelines
- Response tone and verbosity settings
- Security and safety instructions
- Context about the current working directory and environment

> **Important (v0.1.0+)**: As of v0.1.0, system prompts are **no longer loaded by default** when using the SDK. If you want the standard Claude Code behavior (tool instructions, environment context, safety guidelines), you must explicitly request it using `systemPrompt: { type: 'preset', preset: 'claude_code' }`. Without this, the session starts with no system prompt at all.

## Methods of modification

### Method 1: Output styles (persistent configurations)

Output styles are saved configurations that modify Claude's system prompt. They're stored as markdown files and can be reused across sessions and projects.

#### Creating an output style

**TypeScript**
```typescript
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

async function createOutputStyle(name: string, description: string, prompt: string) {
  // User-level: ~/.claude/output-styles
  // Project-level: .claude/output-styles
  const outputStylesDir = join(homedir(), '.claude', 'output-styles')

  await mkdir(outputStylesDir, { recursive: true })

  const content = `---
name: ${name}
description: ${description}
---

${prompt}`

  const filePath = join(outputStylesDir, `${name.toLowerCase().replace(/\s+/g, '-')}.md`)
  await writeFile(filePath, content, 'utf-8')
}

// Example: Create a code review specialist
await createOutputStyle(
  'Code Reviewer',
  'Thorough code review assistant',
  `You are an expert code reviewer.

For every code submission:
1. Check for bugs and security issues
2. Evaluate performance
3. Suggest improvements
4. Rate code quality (1-10)`
)
```

**Python**
```python
from pathlib import Path
import os

async def create_output_style(name: str, description: str, prompt: str):
    # User-level: ~/.claude/output-styles
    # Project-level: .claude/output-styles
    output_styles_dir = Path.home() / ".claude" / "output-styles"

    output_styles_dir.mkdir(parents=True, exist_ok=True)

    content = f"""---
name: {name}
description: {description}
---

{prompt}"""

    file_path = output_styles_dir / f"{name.lower().replace(' ', '-')}.md"
    file_path.write_text(content, encoding='utf-8')

# Example: Create a code review specialist
await create_output_style(
    'Code Reviewer',
    'Thorough code review assistant',
    """You are an expert code reviewer.

For every code submission:
1. Check for bugs and security issues
2. Evaluate performance
3. Suggest improvements
4. Rate code quality (1-10)"""
)
```

#### Using output styles

Once created, activate output styles via:

- **CLI**: `/output-style [style-name]`
- **Settings**: `.claude/settings.local.json`
- **Create new**: `/output-style:new [description]`

### Method 2: Using the preset mode

The `preset` mode for `systemPrompt` is the recommended way to explicitly load the standard Claude Code system prompt. Use this when you want the full default Claude Code behavior without writing your own system prompt.

**TypeScript**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"

// Restore the default Claude Code system prompt
for await (const message of query({
  prompt: "Help me refactor this module",
  options: {
    systemPrompt: { type: 'preset', preset: 'claude_code' }
  }
})) {
  if (message.type === 'assistant') {
    console.log(message.message.content)
  }
}

// Restore the default prompt AND append custom instructions
for await (const message of query({
  prompt: "Help me refactor this module",
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: "Always prefer functional programming patterns."
    }
  }
})) {
  if (message.type === 'assistant') {
    console.log(message.message.content)
  }
}
```

**Python**
```python
from claude_agent_sdk import query

# Restore the default Claude Code system prompt
async for message in query(
    prompt="Help me refactor this module",
    options={
        "system_prompt": { "type": "preset", "preset": "claude_code" }
    }
):
    if message["type"] == "assistant":
        print(message["message"]["content"])

# Restore the default prompt AND append custom instructions
async for message in query(
    prompt="Help me refactor this module",
    options={
        "system_prompt": {
            "type": "preset",
            "preset": "claude_code",
            "append": "Always prefer functional programming patterns."
        }
    }
):
    if message["type"] == "assistant":
        print(message["message"]["content"])
```

### Method 3: Using appendSystemPrompt

The `appendSystemPrompt` option adds your custom instructions to the default system prompt while preserving all built-in functionality.

> **Note**: With v0.1.0+ default behavior (no system prompt loaded), `appendSystemPrompt` appends to an empty prompt. To append to the full Claude Code system prompt, use the `preset` mode with the `append` field instead.

**TypeScript**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"

const messages = []

for await (const message of query({
  prompt: "Help me write a Python function to calculate fibonacci numbers",
  options: {
    appendSystemPrompt: "Always include detailed docstrings and type hints in Python code."
  }
})) {
  messages.push(message)
  if (message.type === 'assistant') {
    console.log(message.message.content)
  }
}
```

**Python**
```python
from claude_agent_sdk import query

messages = []

async for message in query(
    prompt="Help me write a Python function to calculate fibonacci numbers",
    options={
        "append_system_prompt": "Always include detailed docstrings and type hints in Python code."
    }
):
    messages.append(message)
    if message["type"] == "assistant":
        print(message["message"]["content"])
```

### Method 4: Using customSystemPrompt

The `customSystemPrompt` option replaces the entire default system prompt with your custom instructions.

**TypeScript**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"

const customPrompt = `You are a Python coding specialist.
Follow these guidelines:
- Write clean, well-documented code
- Use type hints for all functions
- Include comprehensive docstrings
- Prefer functional programming patterns when appropriate
- Always explain your code choices`

const messages = []

for await (const message of query({
  prompt: "Create a data processing pipeline",
  options: {
    customSystemPrompt: customPrompt
  }
})) {
  messages.push(message)
  if (message.type === 'assistant') {
    console.log(message.message.content)
  }
}
```

**Python**
```python
from claude_agent_sdk import query

custom_prompt = """You are a Python coding specialist.
Follow these guidelines:
- Write clean, well-documented code
- Use type hints for all functions
- Include comprehensive docstrings
- Prefer functional programming patterns when appropriate
- Always explain your code choices"""

messages = []

async for message in query(
    prompt="Create a data processing pipeline",
    options={
        "custom_system_prompt": custom_prompt
    }
):
    messages.append(message)
    if message["type"] == "assistant":
        print(message["message"]["content"])
```

## The `effort` parameter

The `output_config` option accepts an `effort` parameter that controls how much reasoning effort Claude applies to each response:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"

for await (const message of query({
  prompt: "Analyze this complex algorithm",
  options: {
    output_config: {
      effort: "high"   // "low" | "medium" | "high" | "max"
    }
  }
})) {
  if (message.type === 'assistant') {
    console.log(message.message.content)
  }
}
```

| Value | Description |
|-------|-------------|
| `"low"` | Faster responses, less reasoning depth — suitable for simple lookups and formatting tasks |
| `"medium"` | Balanced default — good for most coding tasks |
| `"high"` | Extended reasoning — recommended for architecture decisions, complex debugging, and multi-step plans |
| `"max"` | Maximum reasoning budget — use for the hardest problems where latency is not a concern |

## Comparison of all approaches

| Feature | Output Styles | preset mode | appendSystemPrompt | customSystemPrompt |
|---------|--------------|-------------|-------------------|-------------------|
| Persistence | Yes — saved as files | No — session only | No — session only | No — session only |
| Reusability | Yes — across projects | N/A | No — code duplication | No — code duplication |
| Management | Yes — CLI + files | In code | In code | In code |
| Default tools | Yes — preserved | Yes — preserved | Depends on v0.1.0+ behavior | No — lost unless included |
| Built-in safety | Yes — maintained | Yes — maintained | Depends on v0.1.0+ behavior | No — must be added |
| Environment context | Yes — automatic | Yes — automatic | Depends on v0.1.0+ behavior | No — must be provided |
| Customization level | Replace default | Restore + optionally extend | Additions only | Complete control |
| Version control | Yes | Yes — with code | Yes — with code | Yes — with code |
| Discovery | Yes — `/output-style` | N/A | No | No |

## Use cases and best practices

### When to use output styles

Best for:
- Persistent behavior changes across sessions
- Team-shared configurations
- Specialized assistants (code reviewer, data scientist, DevOps)
- Complex prompt modifications that need versioning

Examples:
- Creating a dedicated SQL optimization assistant
- Building a security-focused code reviewer
- Developing a teaching assistant with specific pedagogy

### When to use the preset mode

Best for:
- SDK scripts that need the standard Claude Code behavior
- Migrating from pre-v0.1.0 where system prompts loaded automatically
- Extending the default behavior with a small addition via the `append` field

### When to use appendSystemPrompt

Best for:
- Adding specific coding standards or preferences on top of a custom base
- Customizing output formatting
- Adding domain-specific knowledge
- Modifying response verbosity

### When to use customSystemPrompt

Best for:
- Complete control over Claude's behavior
- Specialized single-session tasks
- Testing new prompt strategies
- Situations where default tools aren't needed

## Combining approaches

You can combine these methods for maximum flexibility:

### Example: Output style with session-specific additions

**TypeScript**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"

// Assuming "Code Reviewer" output style is active (via /output-style)
// Add session-specific focus areas
const messages = []

for await (const message of query({
  prompt: "Review this authentication module",
  options: {
    appendSystemPrompt: `For this review, prioritize:
    - OAuth 2.0 compliance
    - Token storage security
    - Session management`
  }
})) {
  messages.push(message)
}
```

**Python**
```python
from claude_agent_sdk import query

# Assuming "Code Reviewer" output style is active (via /output-style)
# Add session-specific focus areas
messages = []

async for message in query(
    prompt="Review this authentication module",
    options={
        "append_system_prompt": """For this review, prioritize:
        - OAuth 2.0 compliance
        - Token storage security
        - Session management"""
    }
):
    messages.append(message)
```

## See also

- [Output styles](/en/docs/claude-code/output-styles) - Complete output styles documentation
- [TypeScript SDK guide](/en/docs/claude-code/sdk/sdk-typescript) - Complete SDK usage guide
- [TypeScript SDK reference](/en/docs/claude-code/sdk/sdk-typescript) - Full API documentation
- [Configuration guide](/en/docs/claude-code/configuration) - General configuration options
