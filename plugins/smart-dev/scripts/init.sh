#!/bin/bash
# Initialize feature development workspace
# Usage: bash .claude/skills/smart-dev/scripts/init.sh <feature-name>

set -euo pipefail

FEATURE_NAME="${1:-}"

if [ -z "$FEATURE_NAME" ]; then
  echo "Usage: $0 <feature-name>"
  echo "Example: $0 user-auth"
  exit 1
fi

SPEC_DIR=".works/spec/${FEATURE_NAME}"

if [ -d "$SPEC_DIR" ]; then
  echo "Error: ${SPEC_DIR} already exists"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Creating feature workspace: ${SPEC_DIR}"
mkdir -p "$SPEC_DIR"

# Create progress.md
cat > "${SPEC_DIR}/progress.md" << EOF
---
feature: ${FEATURE_NAME}
phase: 1
phase_name: discovery
status: in_progress
branch: feat/${FEATURE_NAME}
started_at: ${TIMESTAMP}
updated_at: ${TIMESTAMP}
decisions: []
completed_phases: []

# NEW: Mode and iteration tracking
mode: dev
iteration: 0
max_iterations: 20
completion_promise: "DONE"

# NEW: Readiness gating
confidence_threshold: 95
readiness_score: 0
semantic_ok: false
semantic_skipped: false
spec_locked: false
question_round: 0
question_budget: 2

# NEW: Loop state
last_verification_status: ""
last_error: ""
assumptions_accepted: false
---

# Progress: ${FEATURE_NAME}

## Current State
- **Phase**: 1 - Discovery
- **Status**: In Progress
- **Started**: ${TIMESTAMP}
- **Mode**: dev (single-shot)

## Completed Phases
(none yet)

## Pending Phases
- [x] Phase 1: Discovery (current)
- [ ] Phase 2: Codebase Exploration
- [ ] Phase 3: Documentation & Tasks
- [ ] Phase 3c: Readiness Gate (NEW - 95% confidence check)
- [ ] Phase 4: Implementation
- [ ] Phase 5: Review & PR

## Resume Context
<!-- Key information for resuming work -->
- Last action: Initialized feature workspace
- Blocking issues: None
- Next steps: Clarify requirements, make key decisions

## Readiness Gate Status
- Structural score: 0/100
- Semantic check: not run
- Spec locked: No
- Question rounds used: 0/2

## Decision Log
<!-- Q1, Q2, etc. will be recorded here -->
EOF

# Create README.md
cat > "${SPEC_DIR}/README.md" << 'EOF'
# {FEATURE_NAME}

> Goal: [One sentence describing the problem this solves]
> Scope: [What's included / what's NOT included]

## Core Decisions

- Decision 1: **[Choice]** - [brief explanation]
- Decision 2: **[Choice]** - [brief explanation]

## Document Navigation

- Progress: `progress.md`
- Data Contracts: `contracts.md`
- Task Breakdown: `tasks.md`

## Execution Guide

- To check current state: read `progress.md`
- To modify a module: check `tasks.md` for the corresponding task
- To modify fields/API: refer to `contracts.md` as source of truth
EOF
sed -i '' "s/{FEATURE_NAME}/${FEATURE_NAME}/g" "${SPEC_DIR}/README.md" 2>/dev/null || \
sed -i "s/{FEATURE_NAME}/${FEATURE_NAME}/g" "${SPEC_DIR}/README.md"

# Create contracts.md
cat > "${SPEC_DIR}/contracts.md" << 'EOF'
# {FEATURE_NAME} Data Contracts

> This document defines input/output contracts to ensure doc-code consistency.

## 1. Input Contracts

### 1.1 User Input

- Field definitions...
- Type constraints...

## 2. Output Contracts

### 2.1 Response Structure

```typescript
// Example response type
interface Response {
  // fields...
}
```

### 2.2 Example Response

```json
{
  "example": "data"
}
```

## 3. API Contracts

### 3.1 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/{feature}` | Create... |
| GET | `/api/{feature}/:id` | Get... |

### 3.2 Error Responses

| Code | Error | Description |
|------|-------|-------------|
| 400 | INVALID_INPUT | ... |
| 404 | NOT_FOUND | ... |
EOF
sed -i '' "s/{FEATURE_NAME}/${FEATURE_NAME}/g" "${SPEC_DIR}/contracts.md" 2>/dev/null || \
sed -i "s/{FEATURE_NAME}/${FEATURE_NAME}/g" "${SPEC_DIR}/contracts.md"

# Create tasks.md
cat > "${SPEC_DIR}/tasks.md" << 'EOF'
# {FEATURE_NAME} Tasks

> Update status after each task completion.

---

## T1: [Task Name]

**Goal**: [One sentence]
**Size**: S / M / L
**Files**:
- [ ] `path/to/file1.ts`

**Acceptance**:
- [ ] Criterion 1
- [ ] Criterion 2

**Status**: pending

---

## T2: [Next Task]

**Goal**: [One sentence]
**Size**: S / M / L
**Files**:
- [ ] `path/to/file.ts`

**Acceptance**:
- [ ] Criterion 1

**Status**: pending
EOF
sed -i '' "s/{FEATURE_NAME}/${FEATURE_NAME}/g" "${SPEC_DIR}/tasks.md" 2>/dev/null || \
sed -i "s/{FEATURE_NAME}/${FEATURE_NAME}/g" "${SPEC_DIR}/tasks.md"

# Create PR.md template
cat > "${SPEC_DIR}/PR.md" << EOF
## Summary

[Brief description of what this PR does]

## Changes

- [Change 1]
- [Change 2]

## Testing

- [ ] \`bun run check\` passes
- [ ] \`bun run test\` passes
- [ ] \`bun run build\` passes
- [ ] Manual testing of core flow

## Related

- Spec: \`.works/spec/${FEATURE_NAME}/\`

---

🤖 Generated with [Claude Code](https://claude.ai/code)
EOF

# Create qa.md (Q&A log)
cat > "${SPEC_DIR}/qa.md" << 'EOF'
# Q&A Log

> Record of questions asked and answers received during spec refinement

---

<!-- Questions will be appended here in format:
## Q1 (Round 1)
**Asked**: YYYY-MM-DDTHH:MM:SSZ
**Question**: [question text]
**Answer**: [answer text]
-->
EOF

# Create score.json (readiness scoring results)
cat > "${SPEC_DIR}/score.json" << 'EOF'
{
  "total": 0,
  "breakdown": {
    "structure": 0,
    "testability": 0,
    "interfaces": 0,
    "constraints": 0,
    "verification": 0
  },
  "penalties": [],
  "gaps": [],
  "last_updated": null
}
EOF

# Create verification.log (test/build output history)
cat > "${SPEC_DIR}/verification.log" << 'EOF'
# Verification Log

> History of test/build verification attempts

---

<!-- Verification attempts will be appended here in format:
## Attempt 1 - YYYY-MM-DDTHH:MM:SSZ
**Status**: pass/fail
**Output**:
```
[command output]
```
-->
EOF

echo ""
echo "Feature workspace created at: ${SPEC_DIR}"
echo ""
echo "Files created:"
echo "  - ${SPEC_DIR}/progress.md       (progress tracking)"
echo "  - ${SPEC_DIR}/README.md         (index + decisions)"
echo "  - ${SPEC_DIR}/contracts.md      (data contracts)"
echo "  - ${SPEC_DIR}/tasks.md          (task breakdown)"
echo "  - ${SPEC_DIR}/PR.md             (PR template)"
echo "  - ${SPEC_DIR}/qa.md             (Q&A log)"
echo "  - ${SPEC_DIR}/score.json        (readiness scoring)"
echo "  - ${SPEC_DIR}/verification.log  (test/build history)"
echo ""
echo "Next steps:"
echo "  1. Complete Phase 1: Discovery - clarify requirements"
echo "  2. Make key decisions and record in README.md"
echo "  3. progress.md will track your workflow state"
echo "  4. Readiness gate will check 95% confidence before implementation"
