#!/bin/bash
# Stop hook test - logs when Claude finishes
# Read stdin
input=$(cat)
# Log
echo "$(date '+%Y-%m-%d %H:%M:%S') STOP_HOOK_FIRED" >> "$HOME/hook-test.log"
echo "Input: $input" >> "$HOME/hook-test.log"
echo "---" >> "$HOME/hook-test.log"
# Return continue=false (let Claude exit normally)
echo '{"continue": false}'
