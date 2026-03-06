---
name: selfwork
description: >-
  Use this skill when the user wants to start or resume a selfwork run,
  continue autonomous multi-step development from current project state, or
  orchestrate analysis, design, specification, implementation, and review
  through specialized subagents. It resumes `./.claude/selfwork/active` when
  present, otherwise initializes project-local selfwork state and begins the
  correct orchestration flow without turning the main agent into the implementer.
user_invocable: false
---

# selfwork — CEO Orchestration Skill

## Related Commands

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
- **Plugin root ≠ runtime root**: `${CLAUDE_PLUGIN_ROOT}` stores plugin assets; `./.claude/selfwork/` stores project runtime state only
- **Normal execution is automatic**: once a run is approved for execution, dispatchable work must be delegated to subagents without asking the user for permission to continue

## Root Separation

- **Plugin root**: `${CLAUDE_PLUGIN_ROOT}`
  - read-only source for command definitions, hooks, skills, agents, and helper scripts
  - never used as the storage location for run state
- **Runtime root**: `./.claude/selfwork/` inside the current repository
  - stores `active`, `runs/`, `task-specs/`, `artifacts/`, and archive data
  - all runtime paths must resolve from the current project root

## Orchestrator Constraints

The main agent must behave as a pure orchestrator:
- may bootstrap, read state, decide next action, dispatch subagents, and update state
- must not directly implement task code, run task-level testing, or perform task review work
- must not consume subtask specs as if it were the assigned developer/reviewer
- must run `scripts/reconcile-state.ts` to consume artifacts and advance run/task state before computing the next action
- must compute next action from `scripts/dispatch-next.ts` in the current repository before ordinary execution decisions
- must compute the executable dispatch plan from `scripts/execute-next.ts` before launching subagents
- must use `scripts/dispatch-executor.ts` to reserve dispatch work in state before launching subagents
- must treat `dispatch-next.ts` and `execute-next.ts` as the authoritative orchestration protocol
- must treat a selfwork hook `instruction` payload as authoritative when the hook provides one
- must immediately execute `instruction.action=dispatch_subagent` by launching the required subagent(s)
- must ask the user only at explicit human gates:
  - requirement clarification
  - design confirmation
  - spec approval
  - blocked/manual intervention
- must not ask the user whether to continue ordinary execution after tasks are already decomposed

## Roles

| Role | Agent | Responsibility | Output Artifact |
|------|-------|----------------|-----------------|
| Info Collector | Agent(subagent_type=info-collector) | Research, competitive analysis, context gathering | `artifacts/info-collection.json` |
| Requirement Analyst | Agent(subagent_type=requirement-analyst) | User stories, acceptance criteria, requirement structuring | `artifacts/requirement-analysis.json` |
| Product Designer | Agent(subagent_type=product-designer) | PRD, user flows, UI/UX specs | `.claude/selfwork/docs/<topic>.md` + `artifacts/product-spec.json` |
| Architect | Agent(subagent_type=architect) | Technical spec, task decomposition | spec file + `artifacts/plan.json` |
| Senior Developer | Agent(subagent_type=sonnet-dev) | Complex implementation | code + `artifacts/dev-report-<task-id>.json` |
| Developer | Agent(subagent_type=haiku-dev) | Simple implementation | code + `artifacts/dev-report-<task-id>.json` |
| Reviewer | Agent(subagent_type=code-reviewer) | Code review, quality gate | `artifacts/review-report-<task-id>.json` |

## Directory Layout

- Dispatch root: `.claude/selfwork/`
- Active run pointer: `.claude/selfwork/active`
- Run directory: `.claude/selfwork/runs/<run-id>/`
  - `state.json` — Master state file (schema: `references/schemas/run-state.schema.json`)
  - `artifacts/` — Agent output contracts consumed by runtime scripts
    - `info-collection.json`
    - `requirement-analysis.json`
    - `product-spec.json`
    - `plan.json`
    - `dev-report-<task-id>.json`
    - `review-report-<task-id>.json`
  - product-design and architecture phases may also write human-readable spec documents under `.claude/selfwork/docs/`
- Task specs: `.claude/selfwork/task-specs/<run-id>/subtasks/tN.md`
- Authoritative specs: `.claude/selfwork/docs/<topic>.md`

## State Model

See `references/run-state-schema.md` for full schema documentation.

### Run Status Flow

```
planning → intent_recognition → info_collecting → analyzing → designing → specifying → executing → completed
                                                                                                  ↓
                                                                                               blocked
```

### design_status Gate

- `draft` — Product design produced or pending confirmation
- `approved` — User confirmed, specification phase may begin
- `obsolete` — Needs re-design

### spec_status Gate

- `draft` — Architect producing/pending review
- `approved` — User confirmed, execution allowed
- `obsolete` — Needs re-specification

### Task Status

`pending → dispatching → dispatched → agent_done → reviewing → completed | failed`

## CEO Orchestration Flow

The detailed, phase-by-phase workflow lives in `references/operational-workflow.md`. Use that file when you need the full lifecycle.

The core contract is:
1. Bootstrap or resume from project-local `.claude/selfwork/`.
2. Reconcile runtime state with `scripts/reconcile-state.ts` before ordinary execution decisions.
3. Compute the next action with `scripts/dispatch-next.ts`.
4. Build the executable dispatch plan with `scripts/execute-next.ts`.
5. Reserve dispatch state with `scripts/dispatch-executor.ts` before any subagent launch.
6. If work is dispatchable, launch the required subagent instead of implementing directly.
7. Consult the user only at explicit human gates: requirement clarification, design confirmation, spec approval, or blocked/manual intervention.
8. During ordinary execution, continue automatically until the workflow reaches a human gate, `completed`, or `blocked`.

### Human Gates

- `analyzing` may require user clarification when the requirement remains unclear.
- `designing` auto-dispatches `product-designer` while either `product-spec.json` or the design doc is missing.
- `designing` becomes a human confirmation gate once `product-spec.json` and the design doc exist, and remains there until `design_status=approved`.
- `specifying` must stop for spec approval until `spec_status=approved`.
- `blocked` must be reported to the user with the blocking reason.

### Execution Rules

- In `executing`, dispatchable pending work must be delegated immediately to the correct developer subagent.
- In `executing`, `agent_done` work must be handed off to the reviewer automatically.
- Retryable failures should be re-dispatched automatically with failure context.
- Do not ask the user whether ordinary execution should continue once the work has been decomposed.

## Agent Dispatch Templates

### Info Collector Dispatch
```
Agent tool:
- subagent_type: info-collector
- prompt: user request + research scope + output path
- Key: must write info-collection.json to artifacts/
```

### Requirement Analyst Dispatch
```
Agent tool:
- subagent_type: requirement-analyst
- prompt: user request + info collection + output path
- Key: must write requirement-analysis.json to artifacts/
```

### Product Designer Dispatch
```
Agent tool:
- subagent_type: product-designer
- prompt: requirement analysis + output paths
- Key: must write `.claude/selfwork/docs/<topic>.md` and `artifacts/product-spec.json`
- Runtime rule: dispatch automatically only while design artifacts are missing; once they exist, wait at the design approval gate until `design_status=approved`
```

### Architect Dispatch
```
Agent tool:
- subagent_type: architect
- prompt: analysis report + requirement + output paths
- Key: must output both spec file and plan.json
```

### Developer Dispatch
```
Agent tool:
- subagent_type: haiku-dev (small) or sonnet-dev (medium/hard)
- prompt: subtask spec content + dev-report output path
- Key: must write dev-report-<task-id>.json on completion
```

### Reviewer Dispatch
```
Agent tool:
- subagent_type: code-reviewer
- prompt: dev-report + spec reference + review-report output path
- Key: must run quality gates and write review-report-<task-id>.json
```

## Decision Rules

### Agent Selection

| Task Complexity | Agent |
|----------------|-------|
| small | haiku-dev |
| medium | sonnet-dev |
| hard | sonnet-dev |

Retry dispatch may escalate to `sonnet-dev` when failure context or review feedback makes the retry materially harder than the original task.

### Retry Strategy

- Max retries: `max_retries` (default 2)
- Retry includes review issues as additional context
- Exceeds max → status=blocked, report to user

## Safety Constraints

1. `run-id` must match `^[A-Za-z0-9._-]+$`
2. All paths resolved from repo root
3. `state.json` writes use atomic operation (temp file + rename)
4. Hook validates every state transition
