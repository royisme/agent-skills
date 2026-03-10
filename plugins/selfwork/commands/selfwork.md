---
description: Start or resume selfwork orchestration. Reads active run to resume execution; if no active run, clarifies requirements and initializes a new run.
---

Use the `selfwork` skill to execute the start/resume flow.

## Startup

Before any other action:

1. Run bootstrap to initialize directories and get the run context:
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/bootstrap.ts"
   ```
2. Confirm the result shows the current project's `.claude/selfwork/` as the state root.
3. If an active run exists (`active` file is present), read `state.json` and resume from current `status`.
4. If no active run exists, bootstrap creates one — proceed with the Clarify or Plan phase.

## Root Separation

- `${CLAUDE_PLUGIN_ROOT}` — plugin assets only (commands, agents, skills, scripts). Read-only.
- `./.claude/selfwork/` — runtime state for the current project. All state writes go here.
- Never write runtime state into `${CLAUDE_PLUGIN_ROOT}`.

## Orchestration

Follow the selfwork skill's phase model:
1. **Clarify** (if requirement is ambiguous) — ask the user, then proceed
2. **Plan** — dispatch Architect, present plan to user, wait for approval
3. **Execute** — fully automatic loop: dispatch developers in parallel, dispatch reviewers, handle retries, loop until done or blocked
4. **Report** — summarize results

The CEO never writes code, runs tests, or performs reviews directly. All implementation work is delegated to subagents.
