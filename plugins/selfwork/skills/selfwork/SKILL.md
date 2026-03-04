---
name: selfwork
description: >-
  SDD+TDD orchestration for autonomous multi-step development.
  Main agent acts as CEO (read state, make decisions, dispatch, accept delivery).
  Specialized agents handle analysis, architecture, implementation, and review.
  Enforces spec-driven development with test-first execution and full traceability.
user_invocable: false
---

# selfwork — CEO Orchestration Skill

## Trigger Mapping

- `/selfwork` — Start or resume orchestration
- `/selfwork:status` — Show current run state
- `/selfwork:queue` — Show dispatchable task queue
- `/selfwork:clean` — Clean up completed run history

## Core Principles

- **Main = CEO**: Read state → decide → dispatch → accept → deliver
- **Agent = Specialist**: Each has a clear role, input contract, and output contract
- **JSON = Communication Protocol**: The only reliable structured interface between agents
- **Hook = Enforcer**: Validates state compliance, blocks illegal transitions
- **CEO never implements**: No code writing, no spec authoring, no test running

## Roles

| Role | Agent | Responsibility | Output Artifact |
|------|-------|----------------|-----------------|
| Analyst | Agent(subagent_type=Explore) | Explore codebase, assess feasibility | analysis-report.json |
| Architect | Agent(subagent_type=Plan) | Author spec and implementation plan | spec file + plan.json |
| Developer | Agent(subagent_type=haiku-dev/sonnet-dev) | Implement per spec | code changes + dev-report.json |
| Reviewer | Agent(subagent_type=code-reviewer) | Review, test, quality report | review-report.json |

## Directory Layout

- Dispatch root: `.claude/dispatch/`
- Active run pointer: `.claude/dispatch/active`
- Run directory: `.claude/dispatch/runs/<run-id>/`
  - `state.json` — Master state file (schema: `references/schemas/run-state.schema.json`)
  - `artifacts/` — Agent output contracts
    - `analysis-report.json`
    - `plan.json`
    - `dev-report-<task-id>.json`
    - `review-report-<task-id>.json`
- Task specs: `.claude/task-specs/<run-id>/subtasks/tN.md`
- Authoritative specs: `devDocs/spec/selfwork/<topic>.md`

## State Model

See `references/run-state-schema.md` for full schema documentation.

### Run Status Flow

```
planning → analyzing → specifying → executing → completed
                                                    ↓
                                                 blocked
```

### spec_status Gate

- `draft` — Architect producing/pending review
- `approved` — User confirmed, execution allowed
- `obsolete` — Needs re-specification

### Task Status

`pending → dispatched → agent_done → reviewing → completed | failed`

## CEO Orchestration Flow

Detailed workflow is in `references/operational-workflow.md`. Summary below.

### Phase 0: Bootstrap

1. Check `.claude/dispatch/active`
2. Exists → read `state.json`, resume from breakpoint
3. Missing → enter Phase 1

### Phase 1: Planning (status=planning)

1. Identify `input_source`: `interactive` | `external_plan` | `mixed`
2. Create run, initialize `state.json`
3. Set active pointer

### Phase 2: Analysis (status=analyzing)

1. Dispatch Analyst agent (read-only exploration)
2. Read `analysis-report.json`
3. Assess `requirement_confidence`
4. Low confidence → clarify with user, optionally re-dispatch

### Phase 3: Specification (status=specifying)

1. Dispatch Architect agent
2. Architect outputs spec file + `plan.json`
3. Present spec summary to user for confirmation
4. **Gate**: `spec_status` must be `approved` to proceed

### Phase 4: Execution (status=executing)

1. Generate subtask specs from `plan.json` (see `references/subtask-template.md`)
2. Dispatch Developer agents by complexity
3. On completion, dispatch Reviewer for each task
4. Handle verdicts: approved → complete, changes_requested → retry, blocked → fail

### Phase 5: Completion (status=completed)

1. All tasks completed → clear active pointer
2. Summarize delivery to user: changed files, test status, quality report

## Agent Dispatch Templates

### Analyst Dispatch
```
Agent tool:
- subagent_type: Explore (or general-purpose)
- prompt: requirement description + codebase scope + output path + schema reference
- Key: must write analysis-report.json to artifacts/
```

### Architect Dispatch
```
Agent tool:
- subagent_type: Plan (or general-purpose)
- prompt: analysis report + requirement + output paths
- Key: must output both spec file and plan.json
```

### Developer Dispatch
```
Agent tool:
- subagent_type: haiku-dev (small) or sonnet-dev (medium/hard)
- prompt: subtask spec content + dev-report output path
- Key: must write dev-report.json on completion
```

### Reviewer Dispatch
```
Agent tool:
- subagent_type: code-reviewer
- prompt: dev-report + spec reference + review-report output path
- Key: must run quality gates and write review-report.json
```

## Decision Rules

### Agent Selection

| Task Complexity | Agent |
|----------------|-------|
| small | haiku-dev |
| medium | sonnet-dev |
| hard | sonnet-dev |

### Retry Strategy

- Max retries: `max_retries` (default 2)
- Retry includes review issues as additional context
- Exceeds max → status=blocked, report to user

## Safety Constraints

1. `run-id` must match `^[A-Za-z0-9._-]+$`
2. All paths resolved from repo root
3. `state.json` writes use atomic operation (temp file + rename)
4. Hook validates every state transition
