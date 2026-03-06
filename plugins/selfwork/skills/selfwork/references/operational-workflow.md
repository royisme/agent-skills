# Operational Workflow — CEO Orchestration Model

## Overview

The main agent (CEO) only makes dispatch decisions — it never implements. Work flows between agents via structured JSON contracts.

## Phase A: Bootstrap / Resume

1. Ensure the current repository has `.claude/selfwork/`
2. Initialize if missing:
   - `.claude/selfwork/runs/`
   - `.claude/selfwork/task-specs/`
   - `.claude/selfwork/archive/`
3. Check `.claude/selfwork/active`
4. Exists → read `state.json`
   - Resume to the phase matching `status`
   - `info_collecting` → check if info-collection.json is complete
   - `analyzing` → check if requirement-analysis.json is complete
   - `designing` → check if product-spec.json is complete
   - `specifying` → check plan.json and spec_status
   - `executing` → check task statuses
5. Missing → create the first run:
   - `runs/<run-id>/state.json`
   - `runs/<run-id>/artifacts/`
   - `task-specs/<run-id>/subtasks/`
   - `active`
6. Continue to Phase B using the new run

## Phase B: Planning (status=planning)

1. Receive user requirement
2. Identify `input_source`:
   - `interactive`: conversational requirement gathering
   - `external_plan`: user provides existing plan file → record in `input_refs`
   - `mixed`: partial existing material, partial clarification needed
3. Create run directory and state.json
4. Set active pointer
5. Transition to Phase C

## Phase C: Intent Recognition (status=intent_recognition)

1. CEO determines whether the user input is already well specified
2. Clear requirement input (PRD/spec/issue) → transition to Phase F
3. Ambiguous or conversational input → transition to Phase D

## Phase D: Info Collecting (status=info_collecting)

1. CEO dispatches Info Collector agent
2. Agent outputs `artifacts/info-collection.json`
3. CEO reviews collected context and transitions to Phase E

## Phase E: Requirement Analysis + Product Design

### E1: Requirement Analysis (status=analyzing)
1. CEO dispatches Requirement Analyst agent
2. Agent outputs `artifacts/requirement-analysis.json`
3. CEO checks clarity and either clarifies with user or proceeds

### E2: Product Design (status=designing)
1. CEO dispatches Product Designer agent
2. Agent outputs `artifacts/product-spec.json` and product spec document
3. CEO confirms design is ready for technical specification

## Phase F: Specification (status=specifying)

1. CEO dispatches Architect agent
2. Architect outputs:
   - Spec document → `devDocs/spec/selfwork/<topic>.md`
   - Implementation plan → `artifacts/plan.json`
3. CEO presents spec summary to user, requests confirmation
4. User confirms → `spec_status=approved`
5. User requests changes → re-dispatch Architect
6. **Gate**: `spec_status` must be `approved` to proceed
7. Sync tasks from plan.json into state.json
8. Transition to Phase G

## Phase G: Execution Loop (status=executing)

For each task in `execution_order`:

### G1: Dispatch Developer

1. Generate subtask spec (see subtask-template.md)
2. Select agent by complexity:
   - `small` → haiku-dev
   - `medium/hard` → sonnet-dev
3. Dispatch agent with full subtask spec as prompt
4. Update task status=dispatched

### G2: Developer Completes

1. Agent returns → read `artifacts/dev-report-<tid>.json`
2. Update task status=agent_done

### G3: Dispatch Reviewer

1. Dispatch code-reviewer agent
2. Reviewer outputs `artifacts/review-report-<tid>.json`
3. Update task status=reviewing

### G4: CEO Reviews Verdict

1. Read review-report verdict:
   - `approved` → task status=completed
   - `changes_requested` → check retry_count
     - Under limit → retry_count++, re-dispatch with issues context
     - Over limit → task status=failed
   - `blocked` → task status=failed, consider rollback
2. Check for newly dispatchable tasks (deps satisfied)
3. Continue loop

## Phase H: Completion (status=completed)

1. All tasks completed
2. Clear active pointer
3. CEO summarizes to user:
   - Changed files overview
   - Test status
   - Quality report
   - Spec document location

## Phase I: Blocked Handling (status=blocked)

1. Failed tasks exist with no dispatchable work remaining
2. Report to user:
   - Failure reasons
   - Review issues
   - Suggestions (split requirement / manual fix / re-specify)

## Automatic Execution Rules

1. The CEO reconciles runtime artifacts with `scripts/reconcile-state.ts` before making ordinary execution decisions.
2. The CEO computes the next action from `scripts/dispatch-next.ts` before making ordinary execution decisions.
3. The CEO computes the executable dispatch plan from `scripts/execute-next.ts` before launching subagents.
4. The CEO reserves dispatch state with `scripts/dispatch-executor.ts` before launching subagents.
5. If a task is dispatchable, the CEO must dispatch a subagent instead of implementing directly.
6. If a task is `agent_done`, the CEO must dispatch review automatically.
7. If a task is retryable, the CEO must re-dispatch automatically with failure context.
8. When the hook returns a structured `instruction`, that instruction is the authoritative next-action protocol.
9. `instruction.action = dispatch_subagent` must be executed immediately by the CEO.
10. Specification-phase architect dispatch follows the same protocol: reconcile → dispatch-next → execute-next → dispatch-executor → Agent launch.
11. Normal execution does not require repeated user confirmation.
12. The user is consulted only at explicit human gates or blocked/manual intervention states.

## Safety Constraints

1. **run-id validation**: `^[A-Za-z0-9._-]+$`
2. **Path anchoring**: all paths resolved from repo root
3. **State root anchoring**: all selfwork runtime data must live under `.claude/selfwork/`
4. **Plugin/runtime separation**: plugin assets are read from `${CLAUDE_PLUGIN_ROOT}`, but runtime state is always written under the current repository's `.claude/selfwork/`
5. **Atomic writes**: state.json via temp + rename
6. **Lock coordination**: check lock file before writing state.json
7. **Legacy run blocking**: old active run → prompt user to handle

## Stop Hook Integration

The hook validates on every agent stop attempt:
- state.json schema compliance
- Artifact existence (per phase transition requirements)
- TDD gate (critical + tdd must have test_command)
- Blocks non-compliant stop requests
