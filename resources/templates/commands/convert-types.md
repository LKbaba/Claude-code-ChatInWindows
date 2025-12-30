---
id: cmd-convert-types
name: Convert to TypeScript
description: Convert JavaScript code to TypeScript with proper type definitions
category: command
tags:
  - typescript
  - types
  - conversion
version: "1.0.0"
author: Claude Code Chat
---

# /convert-types

Convert JavaScript to TypeScript:

1. **Add Type Annotations**: Parameters, returns, variables
2. **Create Interfaces**: For object shapes
3. **Define Types**: For unions, aliases
4. **Handle Nullability**: Proper null/undefined handling

Conversion Steps:
- Analyze existing code structure
- Infer types from usage
- Create necessary interfaces
- Add explicit type annotations
- Handle any edge cases

Guidelines:
- Prefer interfaces over type aliases for objects
- Use strict mode compatible types
- Avoid `any` when possible
- Add generics where beneficial

Provide:
- Converted TypeScript code
- New type/interface definitions
- Any migration notes
