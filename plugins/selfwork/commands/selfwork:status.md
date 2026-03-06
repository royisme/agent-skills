---
description: Show current selfwork execution state. Displays current phase, agent statuses, artifact statuses, and blocking information.
---

Use the `selfwork` skill to query run state and return a CEO orchestration status summary.

Also run `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/reconcile-state.ts"`, `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/dispatch-next.ts"`, and `bun "${CLAUDE_PLUGIN_ROOT}/skills/selfwork/scripts/execute-next.ts"` to report the authoritative next action and execution plan.

Display the following (read state.json and artifacts directory via Read/Bash):

1. **Run info**: run_id, status, spec_status, input_source
2. **Phase progress**: current phase (planning/analyzing/specifying/executing/completed/blocked)
3. **Artifact status**:
   - analysis-report.json: present / missing
   - plan.json: present / missing
   - dev-report-tN.json: per-task status
   - review-report-tN.json: per-task status
4. **Task statistics**: total, completed, pending, failed, dispatched, reviewing
5. **Blocking info**: blocked reason (if any)
6. **Spec gate**: spec_status value, whether execution is allowed
