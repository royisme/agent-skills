# context-keeper hooks

Optional, non-invasive hooks that help enforce documentation sync without modifying Claude Code itself.

These are templates. Install them via your Claude Code settings and point to the absolute path of each script.

## Suggested hooks

### PostToolUse

Capture tool activity to a local log (for review/debugging).

Script: `context-keeper/hooks/post_tool_use.sh`

### Stop

Run a documentation sync check before the session ends.

Script: `context-keeper/hooks/stop.sh`

Use `--strict` if you want the hook to fail when docs are out of sync.

### SessionStart (optional)

Inject a reminder into the session context.

Script: `context-keeper/hooks/session_start.sh`

## Notes

- These hooks do not edit settings automatically; you must opt in.
- `CLAUDE_PROJECT_DIR` should point to the project root. If not set, the scripts fall back to `pwd`.
