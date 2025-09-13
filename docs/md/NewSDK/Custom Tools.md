# Custom Tools

Build and integrate custom tools to extend Claude Code SDK functionality

Custom tools allow you to extend Claude Code's capabilities with your own functionality through in-process MCP servers, enabling Claude to interact with external services, APIs, or perform specialized operations.

## Creating Custom Tools

Use the `createSdkMcpServer` and `tool` helper functions to define type-safe custom tools:

**TypeScript**
```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-code";
import { z } from "zod";

// Create an SDK MCP server with custom tools
const customServer = createSdkMcpServer({
  name: "my-custom-tools",
  version: "1.0.0",
  tools: [
    tool(
      "get_weather",
      "Get current weather for a location",
      {
        location: z.string().describe("City name or coordinates"),
        units: z.enum(["celsius", "fahrenheit"]).default("celsius").describe("Temperature units")
      },
      async (args) => {
        // Call weather API
        const response = await fetch(
          `https://api.weather.com/v1/current?q=${args.location}&units=${args.units}`
        );
        const data = await response.json();
        
        return {
          content: [
            {
              type: "text",
              text: `Temperature: ${data.temp}°\nConditions: ${data.conditions}\nHumidity: ${data.humidity}%`
            }
          ]
        };
      }
    )
  ]
});
```

**Python**
```python
from claude_code import query, tool, create_sdk_mcp_server
from pydantic import BaseModel, Field
from enum import Enum
import httpx

class TemperatureUnits(str, Enum):
    celsius = "celsius"
    fahrenheit = "fahrenheit"

class WeatherInput(BaseModel):
    location: str = Field(description="City name or coordinates")
    units: TemperatureUnits = Field(default=TemperatureUnits.celsius, description="Temperature units")

@tool("get_weather", "Get current weather for a location", WeatherInput)
async def get_weather(args: WeatherInput):
    # Call weather API
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.weather.com/v1/current",
            params={"q": args.location, "units": args.units}
        )
        data = response.json()
    
    return {
        "content": [
            {
                "type": "text",
                "text": f"Temperature: {data['temp']}°\nConditions: {data['conditions']}\nHumidity: {data['humidity']}%"
            }
        ]
    }

# Create an SDK MCP server with custom tools
custom_server = create_sdk_mcp_server(
    name="my-custom-tools",
    version="1.0.0",
    tools=[get_weather]
)
```

## Using Custom Tools

Pass the custom server to the `query` function via the `mcpServers` option as a dictionary/object.

**Important:** Custom MCP tools require streaming input mode. You must use an async generator/iterable for the `prompt` parameter - a simple string will not work with MCP servers.

### Tool Name Format

When MCP tools are exposed to Claude, their names follow a specific format:

- **Pattern:** `mcp__{server_name}__{tool_name}`
- **Example:** A tool named `get_weather` in server `my-custom-tools` becomes `mcp__my-custom-tools__get_weather`

### Configuring Allowed Tools

You can control which tools Claude can use via the `allowedTools` option:

**TypeScript**
```typescript
import { query } from "@anthropic-ai/claude-code";

// Use the custom tools in your query with streaming input
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: "What's the weather in San Francisco?"
    }
  };
}

for await (const message of query({
  prompt: generateMessages(), // Use async generator for streaming input
  options: {
    mcpServers: {
      "my-custom-tools": customServer // Pass as object/dictionary, not array
    },
    // Optionally specify which tools Claude can use
    allowedTools: [
      "mcp__my-custom-tools__get_weather", // Allow the weather tool
      // Add other tools as needed
    ],
    maxTurns: 3
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

# Use the custom tools in your query with streaming input
async def generate_messages():
    yield {
        "type": "user",
        "message": {
            "role": "user",
            "content": "What's the weather in San Francisco?"
        }
    }

async for message in query(
    prompt=generate_messages(),  # Use async generator for streaming input
    options={
        "mcp_servers": {
            "my-custom-tools": custom_server  # Pass as object/dictionary, not array
        },
        # Optionally specify which tools Claude can use
        "allowed_tools": [
            "mcp__my-custom-tools__get_weather",  # Allow the weather tool
            # Add other tools as needed
        ],
        "max_turns": 3
    }
):
    if message["type"] == "result" and message.get("subtype") == "success":
        print(message["result"])
```

### Multiple Tools Example

When your MCP server has multiple tools, you can selectively allow them:

**TypeScript**
```typescript
const multiToolServer = createSdkMcpServer({
  name: "utilities",
  version: "1.0.0",
  tools: [
    tool("calculate", "Perform calculations", { /* ... */ }, async (args) => { /* ... */ }),
    tool("translate", "Translate text", { /* ... */ }, async (args) => { /* ... */ }),
    tool("search_web", "Search the web", { /* ... */ }, async (args) => { /* ... */ })
  ]
});

// Allow only specific tools with streaming input
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: "Calculate 5 + 3 and translate 'hello' to Spanish"
    }
  };
}

for await (const message of query({
  prompt: generateMessages(), // Use async generator for streaming input
  options: {
    mcpServers: {
      utilities: multiToolServer
    },
    allowedTools: [
      "mcp__utilities__calculate",  // Allow calculator
      "mcp__utilities__translate",  // Allow translator
      // "mcp__utilities__search_web" is NOT allowed
    ]
  }
})) {
  // Process messages
}
```

**Python**
```python
multi_tool_server = create_sdk_mcp_server(
    name="utilities",
    version="1.0.0",
    tools=[calculate, translate, search_web]
)

# Allow only specific tools with streaming input
async def generate_messages():
    yield {
        "type": "user",
        "message": {
            "role": "user",
            "content": "Calculate 5 + 3 and translate 'hello' to Spanish"
        }
    }

async for message in query(
    prompt=generate_messages(),  # Use async generator for streaming input
    options={
        "mcp_servers": {
            "utilities": multi_tool_server
        },
        "allowed_tools": [
            "mcp__utilities__calculate",  # Allow calculator
            "mcp__utilities__translate",  # Allow translator
            # "mcp__utilities__search_web" is NOT allowed
        ]
    }
):
    # Process messages
    pass
```

## Type Safety with Python

The `@tool` decorator supports various schema definition approaches for type safety:

**TypeScript**
```typescript
import { z } from "zod";

tool(
  "process_data",
  "Process structured data with type safety",
  {
    // Zod schema defines both runtime validation and TypeScript types
    data: z.object({
      name: z.string(),
      age: z.number().min(0).max(150),
      email: z.string().email(),
      preferences: z.array(z.string()).optional()
    }),
    format: z.enum(["json", "csv", "xml"]).default("json")
  },
  async (args) => {
    // args is fully typed based on the schema
    // TypeScript knows: args.data.name is string, args.data.age is number, etc.
    console.log(`Processing ${args.data.name}'s data as ${args.format}`);
    
    // Your processing logic here
    return {
      content: [{ type: "text", text: `Processed data for ${args.data.name}` }]
    };
  }
)
```

**Python**
```python
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Literal

class DataInput(BaseModel):
    name: str
    age: int = Field(ge=0, le=150)
    email: EmailStr
    preferences: Optional[List[str]] = None

class ProcessDataInput(BaseModel):
    data: DataInput
    format: Literal["json", "csv", "xml"] = "json"

@tool("process_data", "Process structured data with type safety", ProcessDataInput)
async def process_data(args: ProcessDataInput):
    # args is fully typed based on the Pydantic model
    print(f"Processing {args.data.name}'s data as {args.format}")
    
    # Your processing logic here
    return {
        "content": [{"type": "text", "text": f"Processed data for {args.data.name}"}]
    }
```

## Error Handling

Handle errors gracefully to provide meaningful feedback:

**TypeScript**
```typescript
tool(
  "fetch_data",
  "Fetch data from an API",
  {
    endpoint: z.string().url().describe("API endpoint URL")
  },
  async (args) => {
    try {
      const response = await fetch(args.endpoint);
      
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `API error: ${response.status} ${response.statusText}`
            }
          ]
        };
      }
      
      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to fetch data: ${error.message}`
          }
        ]
      };
    }
  }
)
```

**Python**
```python
from pydantic import BaseModel, HttpUrl
import httpx

class FetchDataInput(BaseModel):
    endpoint: HttpUrl = Field(description="API endpoint URL")

@tool("fetch_data", "Fetch data from an API", FetchDataInput)
async def fetch_data(args: FetchDataInput):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(str(args.endpoint))
            
            if response.status_code != 200:
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": f"API error: {response.status_code} {response.reason_phrase}"
                        }
                    ]
                }
            
            data = response.json()
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(data, indent=2)
                    }
                ]
            }
    except Exception as error:
        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Failed to fetch data: {str(error)}"
                }
            ]
        }
```

## Example Tools

### Database Query Tool

**TypeScript**
```typescript
const databaseServer = createSdkMcpServer({
  name: "database-tools",
  version: "1.0.0",
  tools: [
    tool(
      "query_database",
      "Execute a database query",
      {
        query: z.string().describe("SQL query to execute"),
        params: z.array(z.any()).optional().describe("Query parameters")
      },
      async (args) => {
        const results = await db.query(args.query, args.params || []);
        
        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} rows:\n${JSON.stringify(results, null, 2)}`
            }
          ]
        };
      }
    )
  ]
});
```

**Python**
```python
from pydantic import BaseModel, Field
from typing import Optional, List, Any

class QueryDatabaseInput(BaseModel):
    query: str = Field(description="SQL query to execute")
    params: Optional[List[Any]] = Field(default=None, description="Query parameters")

@tool("query_database", "Execute a database query", QueryDatabaseInput)
async def query_database(args: QueryDatabaseInput):
    results = await db.query(args.query, args.params or [])
    
    return {
        "content": [
            {
                "type": "text",
                "text": f"Found {len(results)} rows:\n{json.dumps(results, indent=2)}"
            }
        ]
    }

database_server = create_sdk_mcp_server(
    name="database-tools",
    version="1.0.0",
    tools=[query_database]
)
```

### API Gateway Tool

**TypeScript**
```typescript
const apiGatewayServer = createSdkMcpServer({
  name: "api-gateway",
  version: "1.0.0",
  tools: [
    tool(
      "api_request",
      "Make authenticated API requests to external services",
      {
        service: z.enum(["stripe", "github", "openai", "slack"]).describe("Service to call"),
        endpoint: z.string().describe("API endpoint path"),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).describe("HTTP method"),
        body: z.record(z.any()).optional().describe("Request body"),
        query: z.record(z.string()).optional().describe("Query parameters")
      },
      async (args) => {
        const config = {
          stripe: { baseUrl: "https://api.stripe.com/v1", key: process.env.STRIPE_KEY },
          github: { baseUrl: "https://api.github.com", key: process.env.GITHUB_TOKEN },
          openai: { baseUrl: "https://api.openai.com/v1", key: process.env.OPENAI_KEY },
          slack: { baseUrl: "https://slack.com/api", key: process.env.SLACK_TOKEN }
        };
        
        const { baseUrl, key } = config[args.service];
        const url = new URL(`${baseUrl}${args.endpoint}`);
        
        if (args.query) {
          Object.entries(args.query).forEach(([k, v]) => url.searchParams.set(k, v));
        }
        
        const response = await fetch(url, {
          method: args.method,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json"
          },
          body: args.body ? JSON.stringify(args.body) : undefined
        });
        
        const data = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      }
    )
  ]
});
```

### Calculator Tool

**TypeScript**
```typescript
const calculatorServer = createSdkMcpServer({
  name: "calculator",
  version: "1.0.0",
  tools: [
    tool(
      "calculate",
      "Perform mathematical calculations",
      {
        expression: z.string().describe("Mathematical expression to evaluate"),
        precision: z.number().optional().default(2).describe("Decimal precision")
      },
      async (args) => {
        try {
          // Use a safe math evaluation library in production
          const result = eval(args.expression); // Example only!
          const formatted = Number(result).toFixed(args.precision);
          
          return {
            content: [{ type: "text", text: `${args.expression} = ${formatted}` }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: Invalid expression - ${error.message}` }]
          };
        }
      }
    ),
    tool(
      "compound_interest",
      "Calculate compound interest for an investment",
      {
        principal: z.number().positive().describe("Initial investment amount"),
        rate: z.number().describe("Annual interest rate (as decimal, e.g., 0.05 for 5%)"),
        time: z.number().positive().describe("Investment period in years"),
        n: z.number().positive().default(12).describe("Compounding frequency per year")
      },
      async (args) => {
        const amount = args.principal * Math.pow(1 + args.rate/args.n, args.n * args.time);
        const interest = amount - args.principal;
        
        return {
          content: [
            {
              type: "text",
              text: `Investment Analysis:\n` +
                    `Principal: $${args.principal.toFixed(2)}\n` +
                    `Rate: ${(args.rate * 100).toFixed(2)}%\n` +
                    `Time: ${args.time} years\n` +
                    `Compounding: ${args.n} times per year\n\n` +
                    `Final Amount: $${amount.toFixed(2)}\n` +
                    `Interest Earned: $${interest.toFixed(2)}\n` +
                    `Return: ${((interest / args.principal) * 100).toFixed(2)}%`
            }
          ]
        };
      }
    )
  ]
});
```

## Related Documentation

- [TypeScript SDK Reference](/en/docs/claude-code/sdk/sdk-typescript)
- [Python SDK Reference](/en/docs/claude-code/sdk/sdk-python)
- [MCP Documentation](/en/docs/claude-code/mcp)
- [SDK Configuration](/en/docs/claude-code/sdk/sdk-configuration)