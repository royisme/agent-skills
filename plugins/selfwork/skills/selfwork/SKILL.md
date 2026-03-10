---
name: selfwork
description: >-
  Autonomous end-to-end development orchestrator. Load this skill when a user
  requests a new feature, refactor, or any multi-task implementation that
  benefits from parallel agent execution — e.g. "implement X", "build feature
  Y", "set up selfwork", or resuming an in-progress run. Orchestrates
  Architect, Developer, and Reviewer subagents through a single human approval
  gate, then runs the implementation loop to completion automatically.
user_invocable: false
---

# selfwork — Autonomous Development Orchestrator

## Core Role

You are the CEO. You plan, delegate, and decide — you never write code or run tests yourself.

- Read state → decide → dispatch subagents → loop → report
- One human gate: plan approval. Everything after is fully automatic.
- Never ask the user whether to continue after the plan is approved.

## Bootstrap

Run once at startup to create directories and initialise an empty `state.json`:
```
bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/bootstrap.ts"
```

Returns `run_id` and the path to `state.json`.

> For the full state schema and directory layout, see `references/state-model.md`.

## Phases

### 1. Clarify (optional)

If the requirement is ambiguous, ask the user directly. 1–3 questions max, in one message.
If the requirement is already clear, skip this phase entirely and go straight to Plan.

### 2. Plan

Dispatch the Architect agent. It reads the codebase, designs the solution, decomposes into tasks, and writes:
- `plan.md` — human-readable plan with task list and dependency notes
- `specs/tN.md` — one spec file per task (the execution contract for developers)

After the Architect completes:
1. Read `.claude/selfwork/runs/<run-id>/plan.md`
2. Present a concise summary to the user: what will be built, how many tasks, which run in parallel
3. Wait for user approval (the **one and only human gate**)
4. On approval: populate `tasks` in `state.json` from the plan, set `status=executing`
5. Write the updated `state.json`, then immediately start the Execute loop

> For agent prompt templates and selection rules, see `references/agent-dispatch.md`.

### 3. Execute (fully automatic)

Run this loop until `status=completed` or `status=blocked`. Do not stop to ask the user.

```
loop:
  runnable = tasks where status=pending AND all deps have status=done

  if runnable is empty AND any task has status=running OR reviewing:
    subagents are still working — wait for them to return

  if runnable is empty AND all tasks have status=done:
    → set status=completed, go to Report

  if runnable is empty AND any task has status=failed:
    → set status=blocked, go to Report

  launch ALL runnable tasks IN PARALLEL
  (one assistant message with multiple Agent tool calls)

  when a developer agent completes:
    update that task's status to reviewing
    dispatch the reviewer for it (can overlap with other running tasks)

  when a reviewer agent completes:
    read verdict from .claude/selfwork/runs/<run-id>/reviews/tN.md
    if verdict = approved:
      task.status = done
    if verdict = changes_requested AND task.retries < task.max_retries:
      task.retries++
      task.failure_notes = issues from review
      task.status = pending  ← re-queues automatically with retry context
    if verdict = changes_requested AND task.retries >= task.max_retries:
      task.status = failed

  write state.json after every status change
  continue loop
```

### 4. Report

**On completed:** Summarize what was built, list changed files, report test results, note any reviewer warnings.

**On blocked:** Explain which tasks failed and why (include reviewer issues), suggest next steps (re-specify, manual fix, re-run with `/selfwork`).

## Resume Behaviour

When an active run exists, read `state.json` and resume from current `status`:
- `planning`: plan.md may or may not exist — if missing, re-dispatch Architect; if present, re-present plan to user for approval
- `executing`: re-enter the Execute loop from current task statuses (running/reviewing tasks may need re-dispatch if agents were lost)
- `completed` / `blocked`: show the Report immediately

## Commands

- `/selfwork` — Start or resume orchestration
- `/selfwork:status` — Show current run state and task progress
- `/selfwork:queue` — Show runnable tasks and what's blocking others
- `/selfwork:clean` — Archive completed runs
