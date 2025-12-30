---
id: cmd-write-tests
name: Write Tests
description: Generate comprehensive test cases for the specified code
category: command
tags:
  - testing
  - unit-tests
version: "1.0.0"
author: Claude Code Chat
---

# /write-tests

Generate tests for the specified code:

1. **Analyze the Code**: Understand what needs to be tested
2. **Identify Test Cases**: 
   - Happy path scenarios
   - Edge cases
   - Error conditions
   - Boundary values
3. **Write Tests**: Using the project's testing framework

Test Structure (AAA Pattern):
- **Arrange**: Set up test data
- **Act**: Execute the code
- **Assert**: Verify results

Include:
- Descriptive test names
- Clear assertions
- Appropriate mocking when needed
- Coverage of main functionality

Output format:
```
// Test file with comprehensive test cases
describe('ComponentName', () => {
  it('should handle expected behavior', () => {
    // test implementation
  });
});
```
