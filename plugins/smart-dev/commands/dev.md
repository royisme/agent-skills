---
name: dev
description: "Single-pass feature development with readiness gating"
version: 1.0.0
context: fork
model: sonnet
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TodoWrite
  - AskUserQuestion
parameters:
  - name: prompt
    required: true
    description: "Feature requirement description"
  - name: confidence-threshold
    required: false
    default: 95
    description: "Readiness score required to proceed"
  - name: question-rounds
    required: false
    default: 2
    description: "Max Q&A rounds during spec refinement"
---

# Dev Mode: Single-Shot Feature Development

Execute the standard smart-dev workflow **ONCE**, with readiness gating.

## Workflow

Follow these phases in order:

### Phase 1: Discovery
- Initialize workspace: `bash ${CLAUDE_PLUGIN_ROOT}/scripts/init.sh {feature-name}`
- Clarify requirements with user
- Record decisions in README.md
- **GATE**: Confirm all decisions with user

### Phase 2: Codebase Exploration
- Launch 2-3 `codebase-explorer` agents in parallel
- Understand existing patterns and architecture
- Present findings summary
- Update progress.md

### Phase 3a: Documentation
- Write contracts.md with field definitions, types, examples
- Update README.md with decisions summary
- **GATE**: User approves spec documents

### Phase 3b: Task Breakdown
- Launch `architect` agent for implementation design
- Split feature into atomic tasks in tasks.md
- Each task: Goal, Size, Files, Acceptance criteria
- **GATE**: User confirms task list

### Phase 3c: Readiness Gate (NEW - 95% Confidence Check)

**CRITICAL**: Do not proceed to implementation until this gate passes.

1. **Run structural scoring** (Track A):
   ```bash
   bun run ${CLAUDE_PLUGIN_ROOT}/scripts/score-spec.ts \
     --feature {feature-name} \
     --threshold {confidence-threshold}
   ```

2. **Run semantic check** (Track B):
   ```bash
   bun run ${CLAUDE_PLUGIN_ROOT}/scripts/check-semantic.ts \
     --feature {feature-name}
   ```
   Note: If ANTHROPIC_API_KEY not set, semantic check will be skipped with a warning.

3. **Evaluate gate condition**:
   - Pass if: `readiness_score >= {confidence-threshold}` AND `semantic_ok == true`
   - Fail if: Either check fails

4. **If gate FAILS**:

   a. Generate blocking questions list:
      - Combine gaps from `score.json` + `semantic-check.json`
      - Filter to blocking items only
      - Max 3-5 questions per round

   b. Check question budget:
      - If `question_round < {question-rounds}`:
        - Use AskUserQuestion to ask targeted questions
        - Record Q&A in `qa.md`
        - Update `question_round` in progress.md
        - Re-run readiness gate (steps 1-3)
      - If budget exhausted: Go to step 4c

   c. **Assumptions Pack** (budget exhausted):
      - Write to `.works/spec/{feature}/assumptions.md`:
        ```markdown
        ## Unresolved Gaps
        [List blocking gaps]

        ## Proposed Assumptions
        - Gap: [description]
          Assumption: [what we'll assume]
          Risk: [what could go wrong]
        ```
      - Use AskUserQuestion with 2 options:
        - "Accept assumptions and proceed (Recommended if risks are acceptable)"
        - "Provide more information (will ask targeted questions)"

      - If **accepted**: Mark `assumptions_accepted: true`, create `spec.lock`, proceed to Phase 4
      - If **rejected**: Output Stuck Report, mark `status: blocked`, STOP

5. **If gate PASSES**:
   - Create `.works/spec/{feature}/spec.lock`
   - Update progress.md:
     ```bash
     bash ${CLAUDE_PLUGIN_ROOT}/scripts/update-progress.sh {feature-name} \
       --set-field spec_locked=true \
       --set-field readiness_score={score} \
       --set-field semantic_ok=true \
       --set-field phase=4 \
       --set-field phase_name=implementation
     ```

### Phase 4: Implementation
- Create feature branch: `git checkout -b feat/{feature-name}`
- For each task in tasks.md:
  - Update task status to "in_progress"
  - Implement changes
  - Run verification (after significant changes)
  - Update task status to "completed"
- Final verification:
  ```bash
  bun run check && bun run test && bun run build
  ```
- If verification **fails**: Fix and retry (max 3 attempts)
- If verification **passes**: Proceed to Phase 5

### Phase 5: Review & PR
- Launch `reviewer` agent for code quality review
- Present findings, ask user decision
- Final verification: `bun run check && bun run test && bun run build`
- Create PR with spec reference
- Update CHANGELOG.md
- Mark progress.md as completed

## Key Differences from Loop Mode

- Executes phases 1-5 exactly **ONCE**
- If verification fails in Phase 5: Fix and retry verification (limited to 3 attempts)
- If still failing after 3 attempts: Output failure report and STOP
- Does **NOT** use Stop hook iteration control

## Failure Report Format

If verification fails 3 times in Phase 5:

```markdown
# Feature Implementation Failed: {feature-name}

**Verification Attempts**: 3/3
**Last Error**: {error summary}

## Verification Log
{last 50 lines of verification.log}

## Recommendation
Use `/smart-dev:loop` mode to iteratively fix issues, or:
1. Fix manually and re-run verification
2. Relax verification requirements if issues are non-critical

## Next Steps
- Review verification.log for systematic issues
- Consider if specification needs updating
- Use loop mode for iterative debugging
```

## Stuck Report Format

If assumptions pack is rejected (Phase 3c):

```markdown
# Feature Blocked: {feature-name}

## Blocking Gaps
[List from score.json + semantic-check.json]

## Information Needed
[Specific questions that must be answered]

## Attempts Made
- Question rounds: {question_round}/{question-rounds}
- Assumptions offered: Yes
- User response: Rejected assumptions

## Recommendation
Please provide answers to "Information Needed" section, then:
1. Update contracts.md and/or tasks.md with missing info
2. Re-run: /smart-dev:dev "{updated prompt}"
```

## Important Notes

- Spec files are **locked after Phase 3c passes** (cannot edit contracts.md, tasks.md)
- To unlock: Delete `.works/spec/{feature}/spec.lock` (only if readiness gate needs re-run)
- Question budget applies across **entire session** (not per-phase)
- ANTHROPIC_API_KEY required for semantic check (falls back to Track A only if missing)

## Quick Reference

```bash
# Check readiness score manually
bun run ${CLAUDE_PLUGIN_ROOT}/scripts/score-spec.ts --feature {feature-name}

# Check semantic sufficiency manually
ANTHROPIC_API_KEY=xxx bun run ${CLAUDE_PLUGIN_ROOT}/scripts/check-semantic.ts --feature {feature-name}

# View current progress
cat .works/spec/{feature-name}/progress.md

# View readiness results
cat .works/spec/{feature-name}/score.json
cat .works/spec/{feature-name}/semantic-check.json
```

Follow the workflow systematically. Trust the readiness gate - it prevents wasted implementation effort on incomplete specs.
