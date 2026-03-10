---
description: Show selfwork dispatchable task queue. Lists tasks ready for dispatch and what's blocking others.
---

Read `.claude/selfwork/active` to get the run-id, then read `.claude/selfwork/runs/<run-id>/state.json`.

Display:

1. **Immediately dispatchable** (status=pending, all deps done):
   - task id, title, complexity, suggested agent (haiku-dev / sonnet-dev)
   - Can these run in parallel? Show parallel groups.

2. **In progress** (status=running or reviewing):
   - task id, title, current status

3. **Waiting on deps** (status=pending, deps not done):
   - task id, title → waiting on: [dep-id: dep-title (dep status)]

4. **Done / Failed**:
   - Brief summary count

If no active run, say so.
