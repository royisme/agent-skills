---
name: acpx
description: >
  Multi-agent orchestrator — delegates coding tasks to other AI coding CLIs
  (Gemini, Codex, Cursor, Copilot, Claude, Kiro, Qwen, Droid, etc.) via acpx,
  a headless CLI for the Agent Client Protocol (ACP). Use this skill whenever
  the user wants another agent to handle part of the work, run multiple agents
  in parallel, get a second opinion from a different model, or orchestrate
  multi-agent workflows. Trigger aggressively on: "use gemini/codex/cursor
  for...", "delegate to...", "have codex review...", "let gemini do the
  frontend", "split this across agents", "run agent...", "second opinion",
  "multi-agent", "acpx", "让gemini/codex做...", "分发任务", "用其他agent",
  "交给codex", or any mention of delegating work to a specific AI coding tool.
  Even if the user just names another agent casually ("gemini could do this
  faster"), consider triggering this skill.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# acpx — Multi-Agent Orchestration

Delegate coding tasks to other AI coding CLIs via `acpx`, a headless CLI client for the Agent Client Protocol (ACP). You are the orchestrator — you decompose work, dispatch to the right agents, collect results, and synthesize the final output.

## 1. Prerequisites

Before first use, check that acpx is installed and discover available agents:

```bash
which acpx || npm i -g acpx@0.3.0
acpx --version
```

## 2. Discover Available Agents

Before dispatching to any agent, you must verify it exists. Run this check and parse the output:

```bash
acpx --help
```

The `Commands` section lists all registered agents. **If the user's requested agent is NOT in the list, do not attempt to run it.** Instead: tell the user it's not available, show the list of agents that are available, and suggest the best alternative for their task. Only proceed with dispatch after confirming the target agent is listed.

**Routing guidance** (use as soft defaults — always defer to user preference):

| Task Type | Recommended Agents | Why |
|---|---|---|
| Frontend / UI | gemini, cursor | Fast iteration, visual understanding |
| Code review | codex, claude | Thorough analysis, catches subtle issues |
| Backend / infra | claude, codex | Strong at architecture, system design |
| Rapid prototyping | gemini, codex | Fast turnaround |
| Cloud / AWS | kiro | AWS-specialized |

If the user specifies an agent, use that agent regardless of the table above.

## 3. Core Commands

All global flags (`--cwd`, `--approve-all`, `--format`, `--model`, `--timeout`, etc.) go **before** the agent name. Agent-specific flags (`-s`, `--no-wait`, `-f`) go after.

### One-shot task (`exec`)

For self-contained tasks that need no follow-up. The agent runs, returns output, and exits — no session is persisted.

```bash
acpx --cwd "$(pwd)" --approve-reads --format json <agent> exec "<task description>"
```

Use `exec` when:
- The task is clearly scoped (a review, a single function, a question)
- You don't need to iterate with the agent

### Persistent session (multi-turn)

For tasks that require back-and-forth conversation or multiple steps.

```bash
# Create a named session
acpx --cwd "$(pwd)" <agent> sessions new --name <task-name>

# Send prompts to it
acpx --cwd "$(pwd)" --approve-reads <agent> -s <task-name> "<prompt>"

# Continue the conversation — the agent remembers prior context
acpx --cwd "$(pwd)" --approve-reads <agent> -s <task-name> "<follow-up>"

# Read what happened
acpx --cwd "$(pwd)" <agent> sessions history <task-name>
acpx --cwd "$(pwd)" <agent> sessions read <task-name>
```

Use sessions when:
- The task is complex and may require course corrections
- You need to pass feedback back to the agent
- Multiple related prompts build on each other

### Parallel dispatch (`--no-wait`)

Run multiple agents concurrently. `--no-wait` queues the prompt and returns immediately.

```bash
acpx --cwd "$(pwd)" --approve-reads gemini -s ui-task --no-wait "implement login form per docs/login-spec.md"
acpx --cwd "$(pwd)" --approve-reads codex -s review-task --no-wait "review src/auth/ for security issues"
```

Then poll for completion:

```bash
acpx --cwd "$(pwd)" codex -s review-task status
acpx --cwd "$(pwd)" gemini -s ui-task status
```

And read results:

```bash
acpx --cwd "$(pwd)" codex sessions read review-task
acpx --cwd "$(pwd)" gemini sessions read ui-task
```

## 4. Context Passing

Agents work in isolation — they don't share your conversation context. You must explicitly provide what they need.

- **Always pass `--cwd "$(pwd)"`** so the agent operates in the correct project directory.
- **Reference files by path** in your prompts: "Review the file at src/auth/login.ts" rather than "review the login code".
- **Provide relevant context inline**: if Claude found a bug, include the details in the prompt to the agent rather than saying "fix the bug we discussed".
- **For large context**, write it to a temp file and use `-f`: `acpx codex exec -f /tmp/task-brief.md`.

## 5. Result Collection & Synthesis

After agents complete work:

1. **Read results**: Use `acpx <agent> sessions read <name>` or `sessions history <name> --limit 5` to see what the agent did.
2. **Check file changes**: Read any files the agent claims to have modified. Verify the changes are correct.
3. **Synthesize**: If multiple agents contributed, merge their outputs — resolve conflicts, pick the best parts, fill gaps.
4. **Report to user**: Summarize what each agent produced, what you kept/changed, and any issues found.

## 6. Orchestration Patterns

### Fan-Out / Fan-In

Best for: large tasks with independent subtasks (e.g., "build this full-stack feature").

1. Decompose the task into independent subtasks.
2. Assign each subtask to the best available agent.
3. Dispatch all in parallel with `--no-wait` and named sessions.
4. Poll status until all complete.
5. Read all results, review for conflicts or gaps.
6. Merge into final output; fix integration issues yourself.

**Worked example** — user says "Build a user settings page with API endpoint":

```bash
# Confirm user consent before using --approve-all (writes files)
# User approved: proceed with dispatch

# Fan-out: frontend + backend in parallel
acpx --cwd "$(pwd)" --approve-all gemini -s settings-ui --no-wait \
  "Create a React settings page at src/components/Settings.tsx. It should have form fields for name, email, and notification preferences. Use the existing Button and Input components from src/components/ui/. The API endpoint will be PATCH /api/users/settings."

acpx --cwd "$(pwd)" --approve-all codex -s settings-api --no-wait \
  "Create a PATCH /api/users/settings endpoint in src/api/routes/users.ts. Accept JSON body with fields: name (string), email (string), notifications (boolean). Validate input, update the database, return the updated user object. Follow the patterns in the existing routes."

# Poll until done
acpx --cwd "$(pwd)" gemini -s settings-ui status
acpx --cwd "$(pwd)" codex -s settings-api status

# Fan-in: read results and verify integration
acpx --cwd "$(pwd)" gemini sessions read settings-ui
acpx --cwd "$(pwd)" codex sessions read settings-api
```

Then read the generated files, verify the frontend calls the correct API endpoint, fix any mismatches, and report to the user.

### Pipeline

Best for: sequential refinement (generate → review → fix).

1. Agent A produces initial output.
2. Claude (you) reviews the output, identifies issues.
3. Agent B (or A again) refines based on your feedback.

### Review Loop

Best for: quality-critical code that benefits from a separate reviewer.

1. Dispatch coding task to developer agent.
2. Once done, dispatch review task to reviewer agent (include the file paths).
3. If reviewer finds issues, send feedback back to developer agent's session.
4. Repeat until reviewer approves.

## 7. Session Cleanup

Always clean up after workflows complete:

```bash
# List active sessions
acpx --cwd "$(pwd)" <agent> sessions list

# Close completed sessions
acpx --cwd "$(pwd)" <agent> sessions close <name>

# Cancel in-flight work if needed
acpx --cwd "$(pwd)" <agent> cancel
```

## 8. Permissions & Safety

- **Default to `--approve-reads`** — agents can read files but cannot write without explicit approval.
- **Use `--approve-all`** only when the user explicitly says the agent should make changes (write files, run commands).
- **Use `--deny-all`** only when passing all context inline in the prompt and the agent needs zero tool access. Note: most tasks — including reviews and explanations — require the agent to read files, so `--approve-reads` is almost always the correct minimum. Reserve `--deny-all` for cases like "explain this concept" where no file access is needed.
- **Always confirm with the user** before dispatching with `--approve-all`, especially on production code.
- **Review diffs** after any agent writes files — don't blindly trust agent output.

## 9. Error Handling

| Situation | Action |
|---|---|
| Agent not in `acpx --help` list | Tell user it's not installed. Suggest alternatives from available agents. |
| Agent process fails to start | Run `acpx <agent> status` to diagnose. Check `acpx config show` for misconfig. |
| Session times out | Check `acpx <agent> -s <name> status`. If stuck, `acpx <agent> cancel` and retry. |
| `--format json` returns malformed output | Fall back to text format: drop `--format json`. Parse the text output. |
| Agent produces wrong/broken code | Don't silently retry. Show the user what went wrong, suggest a different agent or revised prompt. |

## 10. Decision Guide

Use this to decide whether and how to delegate:

- **Don't delegate** if the task is small (< 2 min of your own work) or requires deep context from the current conversation.
- **Use `exec`** for one-off, well-scoped tasks: reviews, explanations, single-file changes.
- **Use sessions** for multi-step tasks where you'll need to iterate with the agent.
- **Use parallel dispatch** when subtasks are independent and you can merge results afterward.
- **Stay as orchestrator** — you own the final output quality. Agents are helpers, not replacements.
