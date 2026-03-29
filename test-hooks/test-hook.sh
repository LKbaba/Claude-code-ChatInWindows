#!/bin/bash
# Minimal hook test - logs every tool use to a file
# Read stdin (required - hook receives JSON context via stdin)
input=$(cat)
# Extract tool name from JSON input
tool_name=$(echo "$input" | grep -o '"tool_name":"[^"]*"' | head -1)
# Log to file
echo "$(date '+%Y-%m-%d %H:%M:%S') HOOK_FIRED $tool_name" >> "$HOME/hook-test.log"
# Return empty JSON = passthrough (don't modify Claude's behavior)
echo '{}'
