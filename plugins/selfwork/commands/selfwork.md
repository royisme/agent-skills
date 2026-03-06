---
description: Start or resume selfwork orchestration. Reads active run to resume execution; if no active run, clarifies requirements and initializes a new run.
---

Use the `selfwork` skill to execute the start/resume flow.

Before any planning, resume, or dispatch work:
1. Use Bash to run `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/bootstrap.ts"` from the current repository.
2. Confirm the bootstrap result shows the current project's `.claude/selfwork/` as the state root.
3. If `.claude/selfwork/active` already exists, resume that run.
4. If no active run exists, bootstrap must create the first run and active pointer before any orchestration logic continues.
5. Continue orchestration in the current repository only.

Never initialize selfwork state in the plugin install directory or any path outside the current project root.

Root separation rules:
- `${CLAUDE_PLUGIN_ROOT}` is only for plugin assets: commands, hooks, skills, agents, and helper scripts.
- `./.claude/selfwork/` under the current repository is the only valid runtime root for state, active run pointers, artifacts, and task specs.
- Never write runtime state into `${CLAUDE_PLUGIN_ROOT}`.

Execution rules:
- In selfwork mode, the main agent is an orchestrator only.
- Reconcile runtime state first by running `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/reconcile-state.ts"` in the current repository.
- Compute the next authoritative action by running `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/dispatch-next.ts"` in the current repository.
- Build an executable dispatch plan by running `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/execute-next.ts"` in the current repository.
- Reserve dispatch state by running `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/dispatch-executor.ts"` before launching subagents.
- If work is dispatchable, the main agent must launch the appropriate subagent instead of implementing, testing, or reviewing directly.
- If a selfwork hook returns `decision=block` with an `instruction.action` of `dispatch_subagent`, execute that dispatch immediately.
- Treat the hook's `instruction`, `dispatch-next.ts` output, and `execute-next.ts` execution plan as authoritative orchestration protocol.
- Do not ask the user whether to continue normal execution once a task has been decomposed, unless the workflow is at a human gate or blocked state.

Dispatch protocol:
1. Run `dispatch-executor.ts` and read its JSON result.
2. If `dispatched=false`, continue according to the returned instruction/reason.
3. If `dispatched=true`, launch subagents immediately for every returned job record.
4. Use the job's `subagent_type` as the Agent tool `subagent_type`.
5. Dispatch phases map to prompts as follows:
   - `info_collecting` → include user request, research scope, and output path `.claude/selfwork/runs/<run-id>/artifacts/info-collection.json`
   - `analyzing` → include user request, info collection artifact if present, and output path `.claude/selfwork/runs/<run-id>/artifacts/requirement-analysis.json`
   - `designing` → include requirement analysis artifact, optional info collection artifact, and output path `.claude/selfwork/runs/<run-id>/artifacts/product-spec.json`
   - `dispatch` / `retry` → include the full subtask spec from `.claude/selfwork/task-specs/<run-id>/subtasks/<task-id>.md` and the expected dev report path
   - `review` → include the developer report, subtask spec, and expected review report path
6. For `mode=parallel`, launch all independent jobs in a single response with multiple Agent tool calls.
7. For `mode=serial`, launch the single required job, then continue the orchestration loop after it returns.
8. After any agent returns, run `reconcile-state.ts` again before deciding the next action.
9. Continue the loop automatically until the workflow reaches a human gate, `completed`, or `blocked`.
