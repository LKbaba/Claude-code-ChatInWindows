---
id: cmd-code-review
name: Code Review
description: Perform a comprehensive code review on the specified file or selection
category: command
tags:
  - review
  - quality
version: "1.0.0"
author: Claude Code Chat
---

# /code-review

Review the code and provide feedback on:

1. **Code Quality**: Readability, naming, structure
2. **Logic**: Correctness, edge cases, error handling
3. **Performance**: Efficiency, potential bottlenecks
4. **Security**: Vulnerabilities, input validation
5. **Best Practices**: Design patterns, SOLID principles

Format your response as:
- 🔴 Critical issues (must fix)
- ⚠️ Warnings (should fix)
- 💡 Suggestions (nice to have)
- ✅ Positive aspects

Provide specific line references and code examples for improvements.
