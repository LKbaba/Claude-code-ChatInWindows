# Hook Test Instructions

## Step 1: Copy hook scripts to ~/.claude/hooks/

```bash
mkdir -p ~/.claude/hooks
cp test-hooks/test-hook.sh ~/.claude/hooks/
cp test-hooks/stop-hook.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/*.sh
```

## Step 2: Add hooks config to ~/.claude/settings.json

Open `~/.claude/settings.json` and add the `"hooks"` section (merge with existing content):

```json
{
  "permissions": {
    "...existing..."
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/test-hook.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/stop-hook.sh"
          }
        ]
      }
    ]
  },
  "enabledPlugins": {
    "...existing..."
  }
}
```

## Step 3: Clear old log and run test

```bash
rm -f ~/hook-test.log
claude -p "What is 1+1? Please answer briefly." --dangerously-skip-permissions
```

## Step 4: Check result

```bash
cat ~/hook-test.log
```

If hooks are working, you should see lines like:
```
2026-03-29 04:00:00 HOOK_FIRED "tool_name":"Read"
2026-03-29 04:00:05 STOP_HOOK_FIRED
```

If the file is empty or doesn't exist, hooks are NOT firing.

## Step 5: Test through VS Code extension

1. Open the extension chat panel
2. Send any message
3. Check `~/hook-test.log` again

## Troubleshooting

If hooks don't fire:
- Check if `--bare` flag is being used (it skips hooks)
- Try `bash -c "echo test"` as the hook command to test shell availability
- Try full Windows path: `C:/Program Files/Git/bin/bash.exe ~/.claude/hooks/test-hook.sh`
- Check Claude CLI stderr for hook-related errors
