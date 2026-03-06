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
- must compute next action from `scripts/dispatch-next.ts` in the current repository before ordinary execution decisions
- must compute the executable dispatch plan from `scripts/execute-next.ts` before launching subagents
- must run `scripts/reconcile-state.ts` to consume artifacts and advance run/task state before computing the next action
- must use `scripts/dispatch-executor.ts` to reserve dispatch work in state before launching subagents
- must treat a selfwork hook `instruction` payload as the authoritative next-action protocol when present
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
| Info Collector | Agent(subagent_type=info-collector) | Research, competitive analysis, context gathering | info-collection.json |
| Requirement Analyst | Agent(subagent_type=requirement-analyst) | User stories, acceptance criteria, requirement structuring | requirement-analysis.json |
| Product Designer | Agent(subagent_type=product-designer) | PRD, user flows, UI/UX specs | product-spec.md + product-spec.json |
| Architect | Agent(subagent_type=architect) | Technical spec, task decomposition | spec file + plan.json |
| Senior Developer | Agent(subagent_type=sonnet-dev) | Complex implementation | code + dev-report.json |
| Developer | Agent(subagent_type=haiku-dev) | Simple implementation | code + dev-report.json |
| Reviewer | Agent(subagent_type=code-reviewer) | Code review, quality gate | review-report.json |

## Directory Layout

- Dispatch root: `.claude/selfwork/`
- Active run pointer: `.claude/selfwork/active`
- Run directory: `.claude/selfwork/runs/<run-id>/`
  - `state.json` — Master state file (schema: `references/schemas/run-state.schema.json`)
  - `artifacts/` — Agent output contracts
    - `info-collection.json`
    - `requirement-analysis.json`
    - `product-spec.json`
    - `plan.json`
    - `dev-report-<task-id>.json`
    - `review-report-<task-id>.json`
- Task specs: `.claude/selfwork/task-specs/<run-id>/subtasks/tN.md`
- Authoritative specs: `devDocs/spec/selfwork/<topic>.md`

## State Model

See `references/run-state-schema.md` for full schema documentation.

### Run Status Flow

```
planning → intent_recognition → info_collecting → analyzing → designing → specifying → executing → completed
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

1. Ensure the current repository contains `.claude/selfwork/`
2. If missing, initialize it with:
   - `.claude/selfwork/runs/`
   - `.claude/selfwork/task-specs/`
   - `.claude/selfwork/archive/`
3. Check `.claude/selfwork/active`
4. Exists → read `state.json`, resume from breakpoint
5. Missing → bootstrap must create the first run, including:
   - `.claude/selfwork/runs/<run-id>/state.json`
   - `.claude/selfwork/runs/<run-id>/artifacts/`
   - `.claude/selfwork/task-specs/<run-id>/subtasks/`
   - `.claude/selfwork/active`
6. Enter Phase 1 with the newly created run

Bootstrap helper script: `scripts/bootstrap.ts`

### Phase 1: Planning (status=planning)

1. Identify `input_source`: `interactive` | `external_plan` | `mixed`
2. Create run, initialize `state.json`
3. Set active pointer

### Phase 2: Intent Recognition (status=intent_recognition)

1. Analyze user input to determine requirement clarity
2. **If clear requirement** (has PRD, issue, spec) → skip to Phase 6 (specifying)
3. **If unclear/vague** → proceed to Phase 3 (info collecting)
4. Update `intent_recognition_result`: `clear` | `needs_research`

### Phase 3: Info Collecting (status=info_collecting)

1. Run `reconcile-state.ts`
2. Run `dispatch-next.ts` and `execute-next.ts`
3. Run `dispatch-executor.ts` to reserve dispatch state
4. Launch Info Collector agent immediately
5. After the agent returns, run `reconcile-state.ts` again and pass control to Requirement Analyst if the artifact is complete

### Phase 4: Analysis (status=analyzing)

1. Run `reconcile-state.ts`
2. Run `dispatch-next.ts` and `execute-next.ts`
3. Run `dispatch-executor.ts` to reserve dispatch state
4. Launch Requirement Analyst agent immediately
5. After the agent returns, run `reconcile-state.ts`
6. If `clarity=unclear` → ask user clarifying questions, re-dispatch
7. If `clarity=clear|partial` → proceed to design

### Phase 5: Design (status=designing)

1. Run `reconcile-state.ts`
2. Run `dispatch-next.ts` and `execute-next.ts`
3. Run `dispatch-executor.ts` to reserve dispatch state
4. Launch Product Designer agent immediately
5. Read product-spec.md and product-spec.json
6. Present design summary to user
7. **Gate**: User confirms design to proceed

### Phase 6: Specification (status=specifying)

1. Run `reconcile-state.ts`
2. Run `dispatch-next.ts` and `execute-next.ts`
3. If the next action is dispatchable architect work, run `dispatch-executor.ts` to reserve dispatch state
4. Launch Architect agent immediately
5. Architect outputs technical spec file + `plan.json`
6. Re-run `reconcile-state.ts` and present spec summary to user for confirmation
7. **Gate**: `spec_status` must be `approved` to proceed

### Phase 7: Execution (status=executing)

1. Generate subtask specs from `plan.json` (see `references/subtask-template.md`)
2. Run `reconcile-state.ts` before every dispatch decision
3. Run `dispatch-next.ts` and `execute-next.ts`
4. Run `dispatch-executor.ts` to reserve dispatch state before any launch
5. Dispatch Developer agents by complexity using the execution plan jobs
6. On completion, re-run `reconcile-state.ts`, then dispatch Reviewer for each `agent_done` task
7. Handle verdicts automatically through review artifacts: approved → complete, changes_requested → retry, blocked → fail
8. Automatic progression rules:
   - dispatchable pending task → dispatch immediately to the correct developer subagent
   - `agent_done` task → dispatch reviewer immediately
   - retryable failed task → re-dispatch automatically with failure context
9. Do not ask the user whether to continue normal task execution in this phase

### Phase 8: Completion (status=completed)

1. All tasks completed → clear active pointer
2. Summarize delivery to user: changed files, test status, quality report

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
- Key: must write product-spec.md and product-spec.json
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
