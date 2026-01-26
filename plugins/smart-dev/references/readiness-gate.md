# Readiness Gate Reference

## Overview

Phase 3c (Readiness Gate) is a critical quality checkpoint that prevents implementation of incomplete specifications. It uses a **dual-track scoring system** to ensure both structural completeness and semantic sufficiency before code is written.

## Why Readiness Gating?

**Problem**: Traditional workflows allow implementation to start with vague specs, leading to:
- Wasted implementation effort on incomplete requirements
- Repeated back-and-forth between spec and code
- Bugs from unstated assumptions
- Scope creep from missing constraints

**Solution**: The readiness gate enforces 95% information completeness before Phase 4 begins.

## Dual-Track Scoring

### Track A: Structural Scoring (Deterministic)

**Purpose**: Verify concrete, checkable elements are present.

**Scoring Rubric** (100 points total):

| Category | Points | Checks |
|----------|--------|--------|
| Structure | 25 | Goal/Purpose, Scope, Non-Goals, Interfaces, Data Model sections present |
| Testability | 25 | Task checklists (`- [ ]`), Given/When/Then or executable examples |
| Interfaces | 15 | Type definitions (TypeScript/JSON), Error handling specified |
| Constraints | 15 | Non-Goals non-empty, Performance/security requirements, Compatibility notes |
| Verification | 20 | Test commands (`bun run test`), Build commands specified |

**Penalties** (deducted from total):
- `-5 pts` per placeholder (TBD, TODO, ???, [later])
- `-20 pts` if "Open Questions" section has blocking items
- `-15 pts` if no "How to Verify" or "Test Plan" section

**Pass Criteria**: Score >= 95 (configurable via `--threshold`)

**Implementation**: `scripts/score-spec.ts`

**Speed**: ~100ms (no API calls)

### Track B: Semantic Sufficiency (LLM-based)

**Purpose**: Verify logical completeness and absence of ambiguity.

**Rubric** (all must pass):
1. Goal is unambiguous and measurable
2. Success criteria cover user intent (not just implementation)
3. No implicit dependencies or hidden assumptions
4. Edge cases and error paths addressed
5. Rollback/migration strategy present (if needed)

**Evidence Requirement**: For each criterion, must quote specific text from spec as proof. If no quote found, criterion fails.

**Pass Criteria**: `ok: true` (all 5 criteria have evidence)

**Implementation**: `agents/semantic-checker.md` (in-session model, no external API)

**Speed**: ~1-3 seconds (agent run)

## Gate Execution Flow

```text
1. Run Track A (score-spec.ts)
   ├─ Score >= 95? ──┐
   └─ Score < 95? ───┤
                     │
2. Run Track B (semantic-checker agent)
   ├─ semantic_ok: true ──┐
   └─ semantic_ok: false ─┤
                          │
3. Evaluate Combined Result
   ├─ Both pass? ────────────> PASS → Create spec.lock, Phase 4
   └─ Either fails? ─────────> FAIL → Go to step 4

4. Information Gathering
   ├─ Combine gaps from Track A + Track B
   ├─ Filter to blocking gaps only
   ├─ Generate 3-5 targeted questions
   └─ Check question budget
       ├─ question_round < budget? ──> Ask user → Retry gate
       └─ budget exhausted? ──────────> Offer assumptions pack

5. Assumptions Pack (if budget exhausted)
   ├─ Write assumptions.md
   ├─ Present to user via AskUserQuestion
   └─ User decision:
       ├─ Accept ──────> Lock spec, proceed to Phase 4
       └─ Reject ──────> Output Stuck Report, status=blocked
```text

## Question Budget

**Default**: 2 rounds (configurable via `--question-rounds`)

**Purpose**: Prevent infinite "ask-user loops" where AI repeatedly asks questions without making progress.

**Behavior**:
- Round 1: Ask 3-5 most critical blocking questions
- Round 2 (if needed): Ask remaining blocking questions
- After Round 2: If still failing, offer assumptions pack

**Tracking**: `question_round` field in progress.md (increments with each Q&A round)

**Scope**: Budget applies across entire session (dev mode) or all iterations (loop mode), not per-phase.

## Assumptions Pack

**Triggered**: When question budget exhausted and gate still failing.

**Format** (written to `assumptions.md`):

```markdown
## Unresolved Gaps
[List all blocking gaps that couldn't be resolved via Q&A]

## Proposed Assumptions
- Gap: [description]
  Assumption: [what AI will assume]
  Risk: [what could go wrong if assumption is wrong]

## Acceptance
[ ] User accepts assumptions (allows Phase 4)
[ ] User rejects (requires more info or cancels feature)
```text

**User Choice** (via AskUserQuestion):
1. **Accept assumptions**: AI creates spec.lock and proceeds to implementation
2. **Reject assumptions**: AI outputs Stuck Report and marks `status: blocked`

**Philosophy**: Better to make explicit, documented assumptions than to proceed with implicit ones or get stuck in infinite Q&A.

## Stuck Report

**Triggered**: When assumptions pack is rejected (user wants more info but budget exhausted).

**Format**:

```markdown
# Feature Blocked: {feature-name}

## Blocking Gaps
[List from score.json + semantic-check.json]

## Information Needed
[Specific questions that must be answered]

## Attempts Made
- Question rounds: {question_round}/{question_budget}
- Assumptions offered: Yes
- User response: Rejected assumptions

## Recommendation
Please provide answers to "Information Needed" section, then:
1. Update contracts.md and/or tasks.md with missing info
2. Re-run readiness gate: bun run scripts/score-spec.ts --feature {feature-name}
```text

**State**: `status: blocked` in progress.md (stops workflow, user must intervene).

## spec.lock File

**Created**: When readiness gate passes (Track A >= 95 AND Track B ok).

**Format**: Empty file with timestamp (creation time).

**Purpose**:
1. Marks spec as frozen (no further edits allowed)
2. Enables write-guard hook (PreToolUse) to block changes
3. Visual indicator that gate has passed

**Location**: `.works/spec/{feature-name}/spec.lock`

**Unlock**: Delete file manually (only if gate needs re-run, e.g., after major scope change).

## Protected Files After spec.lock

Once spec.lock is created, the write-guard hook blocks edits to:
- `contracts.md` (data contracts)
- `tasks.md` (task breakdown)
- `README.md` (decisions log)

**Rationale**: These are the "source of truth" for implementation. Changing them mid-implementation breaks Phase 4 assumptions.

**Bypass**: Delete spec.lock (forces gate re-run).

## Scoring Scripts Usage

### Track A: Structural Scoring

```bash
# Basic usage
bun run plugins/smart-dev/scripts/score-spec.ts --feature {feature-name}

# Custom threshold
bun run plugins/smart-dev/scripts/score-spec.ts \
  --feature {feature-name} \
  --threshold 90

# Exit codes
# 0 = score >= threshold (pass)
# 1 = score < threshold (fail)
```text

**Output**:
- Console: Breakdown, penalties, gaps
- File: `.works/spec/{feature-name}/score.json`

**Gaps Format**:
```json
{
  "category": "testability",
  "description": "No checklist items found in tasks.md",
  "blocking": true
}
```text

### Track B: Semantic Check

Use the `semantic-checker` agent to review README.md, contracts.md, and tasks.md.
Launch it via the Task tool, then save its JSON output to
`.works/spec/{feature-name}/semantic-check.json`.

Optional validation:
```bash
bun run plugins/smart-dev/scripts/check-semantic.ts --feature {feature-name}
```

**Output**:
- Console: ok status, confidence, evidence, gaps
- File: `.works/spec/{feature-name}/semantic-check.json`

**Evidence Format**:
```json
{
  "claim": "Goal is unambiguous and measurable",
  "citation": "Implement JWT-based auth with <exact quote from spec>"
}
```text

## Gate Pass Actions

When gate passes (both tracks):

1. **Create spec.lock**:
   ```bash
   touch .works/spec/{feature-name}/spec.lock
   ```

2. **Update progress.md**:
   ```bash
   bash scripts/update-progress.sh {feature-name} \
     --set-field spec_locked=true \
     --set-field readiness_score={score} \
     --set-field semantic_ok=true \
     --set-field phase=4 \
     --set-field phase_name=implementation
   ```

3. **Enable write guard**: PreToolUse hook now active for this feature.

4. **Proceed to Phase 4**: Implementation can begin.

## Common Gate Failure Scenarios

### Scenario 1: Missing Test Plan

**Track A Penalty**: -15 pts (no "How to Verify" section)

**Gap**:
```json
{
  "category": "verification",
  "description": "No regression test command specified",
  "blocking": true
}
```text

**Fix**: Add to contracts.md or tasks.md:
```markdown
## Verification

Run tests:
```bash
bun run test
```text

Expected: All auth-related tests pass, coverage >= 80%
```text

### Scenario 2: Ambiguous Goal

**Track B Failure**: Criterion 1 fails (goal not measurable)

**Gap**: "Goal mentions 'improve performance' but no metrics specified"

**Fix**: Add measurable success criteria:
```markdown
## Goal

Improve API response time from current 800ms (p95) to 200ms (p95) for /api/users endpoint.
```text

### Scenario 3: Implicit Dependencies

**Track B Failure**: Criterion 3 fails (hidden assumptions)

**Gap**: "Spec assumes database supports transactions but not listed in dependencies"

**Fix**: Add to contracts.md:
```markdown
## Dependencies

- PostgreSQL 14+ (requires transaction support for atomic operations)
- Redis 6+ (for rate limiting)
```text

### Scenario 4: No Error Handling

**Track A Loss**: 5 pts from Interfaces category

**Gap**:
```json
{
  "category": "interfaces",
  "description": "Error handling not specified",
  "blocking": false
}
```text

**Fix**: Add error responses to contracts.md:
```markdown
## Error Responses

| Code | Error | Description |
|------|-------|-------------|
| 400 | INVALID_INPUT | Missing required field |
| 401 | UNAUTHORIZED | Invalid credentials |
| 500 | SERVER_ERROR | Database connection failed |
```text

## Best Practices

### For Spec Writers

1. **Use concrete examples**: Don't say "handle errors", say "return 400 with `{error: 'INVALID_INPUT'}` for missing fields"
2. **Include test commands**: Explicitly specify `bun run test`, not just "run tests"
3. **List non-goals**: What you WON'T do is as important as what you will
4. **Add acceptance checklists**: Use `- [ ]` format in tasks.md
5. **Quote code snippets**: Show example API responses, not just describe them

### For AI Agents

1. **Run gate early**: After Phase 3b, before starting implementation
2. **Present gaps clearly**: Show user exactly what's missing, not vague "spec incomplete"
3. **Ask targeted questions**: Don't ask "what should I do?", ask "should error X return 400 or 500?"
4. **Use question budget wisely**: Combine related questions, prioritize blocking gaps
5. **Trust the scores**: If gate passes, proceed confidently to implementation

### For Users

1. **Answer questions directly**: AI has limited rounds, give concrete answers
2. **Accept reasonable assumptions**: Perfect specs are rare, assumptions pack is a feature
3. **Reject vague assumptions**: If assumption has high risk, provide more info instead
4. **Update spec files when needed**: Edit contracts.md/tasks.md before gate re-run
5. **Unlock spec.lock if scope changes**: Major changes require gate re-run

## Comparison: Dev Mode vs Loop Mode

| Aspect | Dev Mode | Loop Mode |
|--------|----------|-----------|
| Gate runs | Once (Phase 3c) | Every iteration until passes |
| Question budget | 2 rounds total | 2 rounds across all iterations |
| Assumptions pack | Offered once | Offered once (not per-iteration) |
| Stuck state | Blocks workflow, manual resume | Sets `status: blocked`, stops iterations |
| spec.lock | Created when gate passes | Created when gate passes |

## Monitoring Gate Performance

### Check current scores:

```bash
# View latest Track A score
cat .works/spec/{feature-name}/score.json | jq '.total'

# View latest Track B result
cat .works/spec/{feature-name}/semantic-check.json | jq '.ok'

# Count question rounds used
grep "^question_round:" .works/spec/{feature-name}/progress.md
```text

### Debug gate failures:

```bash
# View blocking gaps (Track A)
cat .works/spec/{feature-name}/score.json | jq '.gaps[] | select(.blocking == true)'

# View semantic gaps (Track B)
cat .works/spec/{feature-name}/semantic-check.json | jq '.gaps[]'

# View Q&A history
cat .works/spec/{feature-name}/qa.md
```text

### Manual gate re-run:

```bash
# Re-run Track A
bun run plugins/smart-dev/scripts/score-spec.ts --feature {feature-name}

# Re-run Track B
rm .works/spec/{feature-name}/semantic-check.json
# Re-run semantic-checker agent and save semantic-check.json
# Optional validation:
bun run plugins/smart-dev/scripts/check-semantic.ts --feature {feature-name}
```text

## Troubleshooting

**Q: semantic-check.json is missing or invalid**
A: Re-run the semantic-checker agent and confirm the JSON output matches the required schema.

**Q: Score is 94, just 1 point short of threshold**
A: Review `score.json` penalties. Often a single "TBD" placeholder costs 5 points. Remove it to pass.

**Q: Semantic check says "ok: false" but no gaps listed**
A: Evidence citations are missing. Claude couldn't find quotes to support criteria. Add explicit statements to spec.

**Q: Question budget exhausted but I want to provide more info**
A: Reject assumptions pack. AI will output Stuck Report. Then manually edit contracts.md/tasks.md and re-run gate.

**Q: spec.lock created but I need to update spec**
A: Delete spec.lock file. This unlocks spec files and allows edits. Re-run gate after updates.

**Q: Gate passed but implementation reveals spec was incomplete**
A: Normal! Gate checks 95% completeness, not 100%. Phase 5 review catches remaining issues. Can unlock spec if major changes needed.

## References

- Scoring rubric: See `scripts/score-spec.ts` source code
- Semantic prompt: See `agents/semantic-checker.md`
- Validator script: See `scripts/check-semantic.ts`
- Example outputs: See `examples/sample-score.json`, `examples/sample-semantic-check.json`
- Workflow integration: See Phase 3c in `skills/smart-dev/SKILL.md`
