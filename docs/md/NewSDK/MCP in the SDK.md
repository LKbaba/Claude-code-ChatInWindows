# MCP in the SDK

Extend Claude Code with custom tools using Model Context Protocol servers

## Overview

Model Context Protocol (MCP) servers extend Claude Code with custom tools and capabilities. MCPs can run as external processes, connect via HTTP/SSE, or execute directly within your SDK application.

## Configuration

### Basic Configuration

Configure MCP servers in `.mcp.json` at your project root:

**TypeScript**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_PATHS": "/Users/me/projects"
      }
    }
  }
}
```

**Python**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "python",
      "args": ["-m", "mcp_server_filesystem"],
      "env": {
        "ALLOWED_PATHS": "/Users/me/projects"
      }
    }
  }
}
```

### Using MCP Servers in SDK

**TypeScript**
```typescript
import { query } from "@anthropic-ai/claude-code";

for await (const message of query({
  prompt: "List files in my project",
  options: {
    mcpConfig: ".mcp.json",
    allowedTools: ["mcp__filesystem__list_files"]
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

**Python**
```python
from claude_code import query

async for message in query(
    prompt="List files in my project",
    options={
        "mcp_config": ".mcp.json",
        "allowed_tools": ["mcp__filesystem__list_files"]
    }
):
    if message["type"] == "result" and message.get("subtype") == "success":
        print(message["result"])
```

## Transport Types

### stdio Servers

External processes communicating via stdin/stdout:

**TypeScript/Python**
```json
// .mcp.json configuration
{
  "mcpServers": {
    "my-tool": {
      "command": "node",
      "args": ["./my-mcp-server.js"],
      "env": {
        "DEBUG": "${DEBUG:-false}"
      }
    }
  }
}
```

### HTTP/SSE Servers

Remote servers with network communication:

```json
// SSE server configuration
{
  "mcpServers": {
    "remote-api": {
      "type": "sse",
      "url": "https://api.example.com/mcp/sse",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}

// HTTP server configuration
{
  "mcpServers": {
    "http-service": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "X-API-Key": "${API_KEY}"
      }
    }
  }
}
```

### SDK MCP Servers

In-process servers running within your application. For detailed information on creating custom tools, see the [Custom Tools guide](/en/docs/claude-code/sdk/custom-tools):

**TypeScript**
```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-code";
import { z } from "zod";

const customServer = createSdkMcpServer({
  name: "my-tools",
  version: "1.0.0",
  tools: [
    tool(
      "calculate",
      "Perform calculations",
      { expression: z.string() },
      async (args) => ({
        content: [{ type: "text", text: `Result: ${eval(args.expression)}` }]
      })
    )
  ]
});
```

**Python**
```python
from claude_code import create_sdk_mcp_server, tool

@tool("calculate", "Perform calculations")
async def calculate(expression: str):
    return {
        "content": [{"type": "text", "text": f"Result: {eval(expression)}"}]
    }

custom_server = create_sdk_mcp_server(
    name="my-tools",
    version="1.0.0",
    tools=[calculate]
)
```

## Resource Management

MCP servers can expose resources that Claude can list and read:

**TypeScript**
```typescript
import { query } from "@anthropic-ai/claude-code";

// List available resources
for await (const message of query({
  prompt: "What resources are available from the database server?",
  options: {
    mcpConfig: ".mcp.json",
    allowedTools: ["mcp__list_resources", "mcp__read_resource"]
  }
})) {
  if (message.type === "result") console.log(message.result);
}
```

**Python**
```python
from claude_code import query

# List available resources
async for message in query(
    prompt="What resources are available from the database server?",
    options={
        "mcp_config": ".mcp.json",
        "allowed_tools": ["mcp__list_resources", "mcp__read_resource"]
    }
):
    if message["type"] == "result":
        print(message["result"])
```

## Authentication

### Environment Variables

```json
// .mcp.json with environment variables
{
  "mcpServers": {
    "secure-api": {
      "type": "sse",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}",
        "X-API-Key": "${API_KEY:-default-key}"
      }
    }
  }
}
```

**TypeScript**
```typescript
// Set environment variables
process.env.API_TOKEN = "your-token";
process.env.API_KEY = "your-key";
```

**Python**
```python
# Set environment variables
import os
os.environ["API_TOKEN"] = "your-token"
os.environ["API_KEY"] = "your-key"
```

### OAuth2 Authentication

OAuth2 MCP authentication in-client is not currently supported.

## Error Handling

Handle MCP connection failures gracefully:

**TypeScript**
```typescript
import { query } from "@anthropic-ai/claude-code";

for await (const message of query({
  prompt: "Process data",
  options: {
    mcpServers: {
      "data-processor": dataServer
    }
  }
})) {
  if (message.type === "system" && message.subtype === "init") {
    // Check MCP server status
    const failedServers = message.mcp_servers.filter(s => s.status !== "connected");
    if (failedServers.length > 0) {
      console.warn("Failed to connect:", failedServers);
    }
  }
  
  if (message.type === "result" && message.subtype === "error_during_execution") {
    console.error("Execution failed");
  }
}
```

**Python**
```python
from claude_code import query

async for message in query(
    prompt="Process data",
    options={
        "mcp_servers": {
            "data-processor": data_server
        }
    }
):
    if message["type"] == "system" and message.get("subtype") == "init":
        # Check MCP server status
        failed_servers = [s for s in message["mcp_servers"] if s["status"] != "connected"]
        if failed_servers:
            print(f"Failed to connect: {failed_servers}")
    
    if message["type"] == "result" and message.get("subtype") == "error_during_execution":
        print("Execution failed")
```

## Related Resources

- [Custom Tools Guide](/en/docs/claude-code/sdk/custom-tools) - Detailed guide on creating SDK MCP servers
- [TypeScript SDK Reference](/en/docs/claude-code/sdk/sdk-typescript)
- [Python SDK Reference](/en/docs/claude-code/sdk/sdk-python)
- [SDK Permissions](/en/docs/claude-code/sdk/sdk-permissions)
- [Common Workflows](/en/docs/claude-code/common-workflows)