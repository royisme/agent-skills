---
description: Show selfwork dispatchable task queue. Lists tasks grouped by role that are ready for dispatch.
---

Use the `selfwork` skill to compute the dispatch queue and return the list of dispatchable tasks.

Primary data source: run `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/reconcile-state.ts"`, `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/dispatch-next.ts"`, and `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/execute-next.ts"`, then use their outputs together with state.json.

Display the following:

1. **Current phase dispatch target**:
   - analyzing → Analyst pending dispatch
   - specifying → Architect pending dispatch
   - executing → grouped by task
2. **Dispatchable tasks** (executing phase):
   - Pending tasks with all dependencies satisfied
   - Per task: id, title, complexity, suggested agent_type, task_type, criticality
3. **Pending review tasks**:
   - Tasks in agent_done status
   - Per task: id, title, whether dev-report exists
4. **Blocked tasks**: pending tasks with unsatisfied dependencies, showing block reason
