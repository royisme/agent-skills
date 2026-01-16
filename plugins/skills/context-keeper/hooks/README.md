# context-keeper hooks

Event-driven hooks that enforce documentation synchronization. These hooks ensure TECH_INFO.md files are kept up-to-date by tracking file modifications and requiring documentation updates before session completion.

## How It Works

### PostToolUse Hook

Tracks file modifications in real-time:

- Monitors tools: `edit_file`, `write`, `create`, `delete`
- Extracts file paths from tool invocations
- Records modifications to `.context-keeper/pending.txt`
- Non-blocking - operates silently in the background

### Stop Hook

Enforces documentation completion at session end:

1. Reads `.context-keeper/pending.txt` to find modified files
2. Groups modifications by directory
3. Displays a **mandatory action list** with:
   - All directories that need TECH_INFO.md updates
   - Specific files that were modified
   - Required documentation actions
   - Template for creating TECH_INFO.md files
4. Blocks session completion (in `--strict` mode) until documentation is updated

### Why This Approach

**Problem**: When using multiple skills, AI agents may forget to maintain documentation.

**Solution**: Event-driven enforcement ensures documentation is never forgotten:

| Traditional | Event-Driven |
|-------------|---------------|
| AI must "remember" to update docs | Hook automatically tracks changes |
| Documentation is easily skipped | Hook blocks completion until docs are updated |
| Multi-skill confusion | All modifications are consolidated into one action list |
| Silent failure | Explicit, actionable output |

## Installation

Configure hooks in your Claude Code settings (adjust paths to your environment):

```json
{
  "hooks": {
    "PostToolUse": "/absolute/path/to/context-keeper/hooks/post_tool_use.sh",
    "Stop": "/absolute/path/to/context-keeper/hooks/stop.sh --strict"
  }
}
```

### Modes

**Normal Mode** (default):
```json
"Stop": "/absolute/path/to/context-keeper/hooks/stop.sh"
```
- Displays mandatory action list
- Session can complete even if documentation is not updated (but AI is strongly encouraged)

**Strict Mode** (recommended):
```json
"Stop": "/absolute/path/to/context-keeper/hooks/stop.sh --strict"
```
- Displays mandatory action list
- **Blocks session completion** until documentation is updated
- Exit code 2 indicates documentation is out of sync

## Example Output

When you modify files during a session, the Stop hook will output:

```
==================================================================================================
[context-keeper] MANDATORY: Complete Documentation Before Session End
==================================================================================================

The following files were modified during this session. You MUST update their documentation:

Directory: src/utils
  - src/utils/http.ts
  - src/utils/retry.ts

Directory: src/components
  - src/components/PaymentForm.tsx

Required Actions:

1. For EACH directory listed above:
   - Read the modified files to understand what changed
   - Create or update <directory>/TECH_INFO.md
   - Update the File Inventory table with accurate descriptions
   - Update the Change Log with today's date and your changes

2. For EACH modified file:
   - Ensure that file header comment is present
   - Update @description if file's purpose changed
   - Update @lastModified to today's date (YYYY-MM-DD)

3. If any NEW directories were created:
   - Create a new TECH_INFO.md file for that directory
   - Use the context-keeper template format

4. If overall project structure changed:
   - Update USERAGENTS.md directory structure

TECH_INFO.md Template:
```markdown
# [Directory Name] - Technical Documentation

> **Directory purpose**: [Based on your analysis]
> **Last updated**: [Today's date]

---

## 📁 File Inventory

| Filename | Description | Input | Output | Dependencies |
|----------|-------------|-------|--------|--------------|
| file1.ts | [Your description] | Type | Type | ./other-file |
```

==================================================================================================
[context-keeper] This is MANDATORY. You cannot skip this step.
[context-keeper] Documentation is critical for maintaining context across sessions.
==================================================================================================
```

## File Tracking

The hooks maintain a `.context-keeper/` directory in your project root:

```
project/
├── .context-keeper/
│   └── pending.txt    # Tracked file modifications (one per line)
└── .gitignore         # Excludes .context-keeper/
```

- `pending.txt` is created/updated by `post_tool_use.sh`
- `pending.txt` is read and deleted by `stop.sh`
- This directory is excluded from git (in `.gitignore`)

## Notes

- Hooks do not modify code files - they only track and prompt
- Documentation updates are still performed by the AI agent
- The hook ensures the AI agent is **reminded** to update documentation
- In strict mode, the hook ensures documentation is **completed** before session end
- All file modifications are captured, regardless of which skill caused them