# State Model & Directory Layout

## state.json Schema

File: `.claude/selfwork/runs/<run-id>/state.json`

```json
{
  "run_id": "run-2026-03-09-abc123",
  "status": "planning | executing | completed | blocked",
  "requirement": "The original user requirement",
  "tasks": [
    {
      "id": "t1",
      "title": "Task title",
      "complexity": "small | medium | hard",
      "deps": [],
      "status": "pending | running | reviewing | done | failed",
      "retries": 0,
      "max_retries": 2,
      "spec": ".claude/selfwork/runs/<run-id>/specs/t1.md",
      "failure_notes": ""
    }
  ]
}
```

## Status Transitions

**Run status:**
- `planning` → `executing`: user approved the plan
- `executing` → `completed`: all tasks done
- `executing` → `blocked`: a task failed with retries exhausted

**Task status:**
- `pending` → `running`: dispatched to developer
- `running` → `reviewing`: developer wrote done/tN.md
- `reviewing` → `done`: reviewer approved
- `reviewing` → `pending`: reviewer requested changes, retries remain
- `reviewing` → `failed`: reviewer requested changes, retries exhausted

## Directory Layout

```
.claude/selfwork/
  active                          # contains the active run-id
  runs/<run-id>/
    state.json                    # single source of truth (CEO manages this)
    plan.md                       # architect's plan (presented to user for approval)
    specs/                        # task specs written by architect, read by developers
      t1.md
      t2.md
    done/                         # completion notes written by developers, read by reviewer
      t1.md
    reviews/                      # review verdicts written by reviewer, read by CEO
      t1.md
  archive/                        # completed runs moved here by /selfwork:clean
```
