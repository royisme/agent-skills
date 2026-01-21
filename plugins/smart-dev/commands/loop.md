---
name: loop
description: "Iterative feature development with automatic retry until completion"
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
  - name: max-iterations
    required: false
    default: 20
    description: "Maximum iteration attempts before forced stop"
  - name: confidence-threshold
    required: false
    default: 95
    description: "Readiness score required to proceed to implementation"
  - name: question-rounds
    required: false
    default: 2
    description: "Max Q&A rounds before assumptions pack"
  - name: completion-promise
    required: false
    default: "DONE"
    description: "String to output when truly complete"
---

# Loop Mode: Iterative Feature Development

You are executing smart-dev in **LOOP MODE**. This means:

1. **Iteration lifecycle**: Each iteration does ONE of:
   - Spec refinement (if spec not locked)
   - Implementation + verification (if spec locked)
   - Error fixing (if last verification failed)

2. **Stop conditions**: Only stop when:
   - Spec locked + implementation complete + verification passed
   - `iteration >= max_iterations` (output timeout report)
   - User cancels via `/smart-dev:cancel`

3. **Stop hook active**: Do NOT exit until stop condition met.
   The Stop hook will block your exit and force continuation.

## Iteration Flow

On each iteration:

### 1. Read State

Load `.works/spec/{feature}/progress.md` and extract:
- `iteration` (current iteration count)
- `status` (collecting/implementing/fixing/done/blocked)
- `spec_locked` (true/false)
- `last_verification_status` (pass/fail/"")
- `readiness_score` (0-100)
- `semantic_ok` (true/false)
- `question_round` (Q&A attempts used)

### 2. Decide Action Based on State

**If spec NOT locked** (`status: collecting`):
1. Run Phase 1-3c (Discovery → Exploration → Spec → Readiness Gate)
2. Update `readiness_score` and `semantic_ok` in progress.md
3. If gate **passes**:
   - Create `spec.lock`
   - Set `status=implementing`
   - Set `spec_locked=true`
4. If gate **fails**:
   - If `question_round < {question-rounds}`:
     - Ask blocking questions via AskUserQuestion
     - Record Q&A in `qa.md`
     - Increment `question_round`
     - Retry gate (next iteration)
   - If budget exhausted:
     - Offer assumptions pack (see Phase 3c in SKILL.md)
     - If accepted: Lock spec, proceed
     - If rejected: Set `status=blocked`, output Stuck Report

**If spec locked** (`status: implementing`):
1. Run Phase 4 (Implementation)
2. After writing code, run verification:
   ```bash
   bun run check && bun run test && bun run build 2>&1 | tee -a .works/spec/{feature}/verification.log
   ```
3. Append verification attempt to `verification.log`:
   ```markdown
   ## Attempt {N} - {timestamp}
   **Status**: pass/fail
   **Output**:
   ```
   [command output]
   ```
   ```
4. If **PASS**:
   - Set `status=done`
   - Set `last_verification_status=pass`
5. If **FAIL**:
   - Set `status=fixing`
   - Set `last_error={error summary}`
   - Set `last_verification_status=fail`

**If status=fixing**:
1. Read `last_error` and tail of `verification.log`
2. Analyze failures
3. Fix the specific failures (do NOT rewrite entire files)
4. Re-run verification
5. Update state based on result (pass → done, fail → stay in fixing)

**If status=done**:
1. Run Phase 5 (Review + PR)
2. Output completion promise: `{completion-promise}`
3. Stop hook will allow exit

**If status=blocked**:
1. Output Stuck Report
2. Wait for user to provide info or cancel
3. Do NOT increment iteration (stuck state)

### 3. Update Progress

After each action, update progress.md:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/update-progress.sh {feature-name} \
  --set-field iteration=$((iteration + 1)) \
  --set-field status={new_status} \
  --set-field last_verification_status={result} \
  --set-field updated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

### 4. Check Stop Condition

- If `status=done` AND `last_verification_status=pass`:
  - Output `{completion-promise}`
  - STOP (Stop hook will allow exit)

- If `iteration >= {max-iterations}`:
  - Output Timeout Report
  - STOP (Stop hook will allow exit)

- Otherwise:
  - Continue to next iteration
  - Stop hook will BLOCK exit and force continuation

## Completion Promise Format

When truly complete, output exactly:

```
✓ Feature {feature-name} completed successfully

{completion-promise}
```

The Stop hook detects this and allows exit.

## Timeout Report Format

If max iterations reached without completion:

```markdown
# Loop Timeout: {feature-name}

**Iterations**: {iteration}/{max-iterations}
**Last Status**: {status}
**Spec Locked**: {spec_locked}
**Last Verification**: {last_verification_status}

## Progress Summary
- Phases completed: [List phases that finished]
- Implementation: {estimate}% of tasks complete
- Last error: {last_error}

## Recommendations
- If close to completion: Increase max-iterations and retry with `/smart-dev:loop --max-iterations 30`
- If stuck in verification: Review verification.log for systematic issues
- If stuck in spec: May need more user input - switch to `/smart-dev:dev` mode for guided workflow

## Next Steps
1. Review `.works/spec/{feature-name}/verification.log`
2. Check if spec needs refinement (delete `spec.lock` to unlock)
3. Consider switching to dev mode for manual control
```

## Important Loop Behavior

- **One action per iteration**: Don't try to do spec + implementation in same iteration
- **Always update progress.md**: Before iteration ends (state machine tracking)
- **Trust the Stop hook**: It will prevent premature exit
- **Question budget applies across ALL iterations**: Not per-iteration
- **Verification log is append-only**: Track all attempts for debugging

## State Machine Diagram

```
collecting (spec refinement)
    |
    | [gate passes]
    v
implementing (write code)
    |
    | [verification fails]
    v
fixing (fix errors)
    |
    | [verification passes]
    v
done (complete)
```

Special states:
- `blocked`: Assumptions rejected, need user input (doesn't count toward iteration limit)

## Example Iteration Sequence

1. **Iteration 1**: Discovery + Exploration (status: collecting)
2. **Iteration 2**: Write spec, run gate → fails (status: collecting, question_round=1)
3. **Iteration 3**: Ask user Q&A, update spec, run gate → passes (status: implementing, spec_locked=true)
4. **Iteration 4**: Implement tasks 1-3 (status: implementing)
5. **Iteration 5**: Run verification → fails (status: fixing)
6. **Iteration 6**: Fix errors, re-run verification → passes (status: done)
7. **Iteration 7**: Review + PR, output "DONE" → STOP

## Debugging Commands

During loop execution, you can check state:

```bash
# View current state
cat .works/spec/{feature-name}/progress.md

# Check readiness scores
cat .works/spec/{feature-name}/score.json
cat .works/spec/{feature-name}/semantic-check.json

# View verification history
tail -50 .works/spec/{feature-name}/verification.log

# Count iterations
grep "^iteration:" .works/spec/{feature-name}/progress.md
```

## Cancel Loop

To stop loop before completion:
```
/smart-dev:cancel {feature-name}
```

This sets `status: canceled` and Stop hook will allow exit.

## Key Differences from Dev Mode

| Aspect | Dev Mode | Loop Mode |
|--------|----------|-----------|
| Iterations | 1 (single-shot) | Up to max-iterations |
| Verification retries | 3 attempts, then fail | Unlimited (within iteration budget) |
| Stop behavior | Exits immediately | Blocked by Stop hook until done |
| State tracking | Simple (phase only) | Complex (iteration + status machine) |
| Use case | Manual control | Autonomous completion |

## Best Practices

1. **Start with lower max-iterations** (10-15) to avoid runaway loops
2. **Monitor progress.md** to see iteration count
3. **Check verification.log** if stuck in fixing state
4. **Use cancel command** if loop is not making progress
5. **Switch to dev mode** if you need manual control over workflow

Follow the state machine strictly. Each iteration must advance the feature toward completion.
