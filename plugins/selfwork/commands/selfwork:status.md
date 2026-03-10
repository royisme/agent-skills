---
description: Show current selfwork execution state. Displays run status, task progress, and what's running or blocked.
---

Read `.claude/selfwork/active` to get the run-id, then read `.claude/selfwork/runs/<run-id>/state.json`.

Display:

1. **Run info**: run_id, status
2. **Requirement**: first 100 chars of `requirement`
3. **Task progress**:
   - Total / done / running / reviewing / pending / failed
   - Per-task row: id, title, status, retries (if > 0)
4. **Runnable now**: tasks where status=pending and all deps have status=done
5. **Blocked tasks**: pending tasks whose deps are not yet done — show which dep is blocking
6. **Blocked reason**: if status=blocked, show why

If no active run exists, say so.
