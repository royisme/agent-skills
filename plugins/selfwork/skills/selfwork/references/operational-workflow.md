# Operational Workflow — CEO Orchestration Model

## Overview

The main agent (CEO) only makes dispatch decisions — it never implements. Work flows between agents via structured JSON contracts.

## Phase A: Bootstrap / Resume

1. Check `.claude/dispatch/active`
2. Exists → read `state.json`
   - Resume to the phase matching `status`
   - `analyzing` → check if analysis-report.json is complete
   - `specifying` → check plan.json and spec_status
   - `executing` → check task statuses
3. Missing → Phase B

## Phase B: Planning (status=planning)

1. Receive user requirement
2. Identify `input_source`:
   - `interactive`: conversational requirement gathering
   - `external_plan`: user provides existing plan file → record in `input_refs`
   - `mixed`: partial existing material, partial clarification needed
3. Create run directory and state.json
4. Set active pointer
5. Transition to Phase C

## Phase C: Analysis (status=analyzing)

1. CEO dispatches Analyst agent (read-only exploration)
2. Analyst outputs `artifacts/analysis-report.json`
3. CEO reviews report:
   - Evaluate `requirement_confidence`
   - `low` → clarify with user, optionally re-dispatch
   - `medium/high` → proceed
4. Transition to Phase D

## Phase D: Specification (status=specifying)

1. CEO dispatches Architect agent
2. Architect outputs:
   - Spec document → `devDocs/spec/selfwork/<topic>.md`
   - Implementation plan → `artifacts/plan.json`
3. CEO presents spec summary to user, requests confirmation
4. User confirms → `spec_status=approved`
5. User requests changes → re-dispatch Architect
6. **Gate**: `spec_status` must be `approved` to proceed
7. Sync tasks from plan.json into state.json
8. Transition to Phase E

## Phase E: Execution Loop (status=executing)

For each task in `execution_order`:

### E1: Dispatch Developer

1. Generate subtask spec (see subtask-template.md)
2. Select agent by complexity:
   - `small` → haiku-dev
   - `medium/hard` → sonnet-dev
3. Dispatch agent with full subtask spec as prompt
4. Update task status=dispatched

### E2: Developer Completes

1. Agent returns → read `artifacts/dev-report-<tid>.json`
2. Update task status=agent_done

### E3: Dispatch Reviewer

1. Dispatch code-reviewer agent
2. Reviewer outputs `artifacts/review-report-<tid>.json`
3. Update task status=reviewing

### E4: CEO Reviews Verdict

1. Read review-report verdict:
   - `approved` → task status=completed
   - `changes_requested` → check retry_count
     - Under limit → retry_count++, re-dispatch with issues context
     - Over limit → task status=failed
   - `blocked` → task status=failed, consider rollback
2. Check for newly dispatchable tasks (deps satisfied)
3. Continue loop

## Phase F: Completion (status=completed)

1. All tasks completed
2. Clear active pointer
3. CEO summarizes to user:
   - Changed files overview
   - Test status
   - Quality report
   - Spec document location

## Phase G: Blocked Handling (status=blocked)

1. Failed tasks exist with no dispatchable work remaining
2. Report to user:
   - Failure reasons
   - Review issues
   - Suggestions (split requirement / manual fix / re-specify)

## Safety Constraints

1. **run-id validation**: `^[A-Za-z0-9._-]+$`
2. **Path anchoring**: all paths resolved from repo root
3. **Atomic writes**: state.json via temp + rename
4. **Lock coordination**: check lock file before writing state.json
5. **Legacy run blocking**: old active run → prompt user to handle

## Stop Hook Integration

The hook validates on every agent stop attempt:
- state.json schema compliance
- Artifact existence (per phase transition requirements)
- TDD gate (critical + tdd must have test_command)
- Blocks non-compliant stop requests
