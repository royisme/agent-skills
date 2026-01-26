# Smart-Dev Configuration Files

This directory contains JSON schema definitions that formally specify the constraints and rules for the smart-dev workflow. These files provide machine-readable specifications that can be used to validate behavior and enforce consistency.

## Files

### `statemachine.json`
**Purpose**: Defines the state machine for feature development workflow

**Contains**:
- Valid states (in_progress, collecting, implementing, fixing, done, blocked, completed, canceled)
- State transitions and conditions
- Mode definitions (dev vs loop)
- Field validation rules and constraints
- State requirements and next-state mappings

**Usage**:
- LLM agents should consult this to validate state transitions
- Scripts can validate progress.md against this schema
- Enforcement of mode-specific state restrictions

**Example validation**:
```bash
# Validate that a state transition is valid
jq -r '.transitions.rules[] | select(.from == "collecting" and .to == "implementing") | .condition' config/statemachine.json
# Output: readiness_score >= confidence_threshold && semantic_ok == true
```

### `scoring-rules.json`
**Purpose**: Defines Track A (structural) and Track B (semantic) scoring rules

**Contains**:
- Track A category weights and point allocations
- Specific checks with regex patterns and point values
- Penalty rules and deductions
- Track B rubric criteria with evidence requirements
- Gate pass criteria and failure handling logic
- Output schema definitions

**Usage**:
- `score-spec.ts` should implement checks according to these rules
- `semantic-checker` agent should enforce the rubric criteria
- Users can customize thresholds and weights
- Documentation reference for understanding scoring

**Example usage**:
```bash
# Get total points for Track A
jq '.track_a.total_points' config/scoring-rules.json
# Output: 100

# Get penalty for placeholders
jq '.track_a.penalties.placeholders.points_per_occurrence' config/scoring-rules.json
# Output: -5
```

### `phase-definitions.json`
**Purpose**: Defines requirements, outputs, and gates for each workflow phase

**Contains**:
- 5 phases with sub-phases (3a, 3b, 3c)
- Required actions, agents, and tools per phase
- Gate definitions (user confirmation, readiness gate)
- Output files and completion criteria
- Agent recommendations and rationale

**Usage**:
- LLM agents should follow the action sequences
- Validate that all required outputs are created
- Ensure gates are checked before phase transitions
- Guide for implementing new phases or modifying existing ones

**Example usage**:
```bash
# Get Phase 3c readiness gate threshold
jq '.phases[] | select(.id == 3) | .sub_phases[] | select(.id == "3c") | .gates[0].threshold' config/phase-definitions.json
# Output: 95

# List all required outputs for Phase 1
jq -r '.phases[0].required_outputs.files[]' config/phase-definitions.json
# Output: progress.md, README.md
```

## Design Philosophy

### Why JSON over Markdown?

**Constraints** belong in JSON:
- ✅ Machine-parseable and validatable
- ✅ Type-safe (schemas enforce structure)
- ✅ Easy to programmatically check
- ✅ Version control shows precise changes
- ✅ Can generate code from schemas

**Guidance** remains in Markdown:
- ✅ Human-readable explanations
- ✅ Examples and troubleshooting
- ✅ Contextual information
- ✅ Progressive disclosure for complex topics

### Hybrid Approach

**Current implementation**:
1. **JSON files** (this directory) - Define rules and constraints
2. **Markdown files** (skills/, commands/, references/) - Explain and guide
3. **YAML frontmatter** (command files) - Metadata and parameters

LLM agents should:
1. **Read JSON** to understand constraints and validation rules
2. **Read Markdown** to understand context and best practices
3. **Follow both** for complete understanding

## Integration with Existing Code

### Scripts Should Reference These Files

**Recommended updates** (future enhancement):

```typescript
// score-spec.ts - Load rules from config
import scoringRules from '../config/scoring-rules.json';
const weights = scoringRules.track_a.categories.structure.points;
```

```typescript
// semantic-checker agent - Load rubric from config
import scoringRules from '../config/scoring-rules.json';
const criteria = scoringRules.track_b.rubric.criteria;
```

```bash
# update-progress.sh - Validate against statemachine
cat .works/spec/$FEATURE/progress.md | validate-against config/statemachine.json
```

### Validation Tools (Not Yet Implemented)

Could create:
- `validate-progress.ts` - Check progress.md against statemachine.json
- `validate-spec.ts` - Check contracts.md/tasks.md against scoring-rules.json
- `validate-phase.ts` - Check current phase outputs against phase-definitions.json

## Customization

Users can customize behavior by editing these JSON files:

**Change readiness threshold**:
```bash
# Edit scoring-rules.json
jq '.track_a.threshold_default = 90' config/scoring-rules.json > tmp.json && mv tmp.json config/scoring-rules.json
```

**Adjust category weights**:
```bash
# Give more weight to testability
jq '.track_a.categories.testability.points = 30' config/scoring-rules.json > tmp.json && mv tmp.json config/scoring-rules.json
```

**Add new state**:
```bash
# Edit statemachine.json to add custom state
jq '.states.custom_review = {...}' config/statemachine.json > tmp.json && mv tmp.json config/scoring-rules.json
```

## Benefits

1. **Consistency**: All agents follow same rules
2. **Transparency**: Rules are explicit and inspectable
3. **Validation**: Can programmatically verify compliance
4. **Customization**: Users can adjust behavior without code changes
5. **Documentation**: Self-documenting constraints
6. **Testing**: Can unit test against schema definitions

## Future Enhancements

Potential improvements:
- [ ] Add JSON Schema validation for progress.md
- [ ] Create validation CLI tools
- [ ] Generate TypeScript types from JSON schemas
- [ ] Add schema versioning and migration tools
- [ ] Create configuration UI for editing rules
- [ ] Add rule inheritance (e.g., per-project overrides)

## Related Files

- `../skills/smart-dev/SKILL.md` - Main workflow documentation
- `../commands/*.md` - Command definitions (frontmatter + guide)
- `../references/readiness-gate.md` - Detailed readiness gate guide
- `../scripts/score-spec.ts` - Structural scoring implementation
- `../agents/semantic-checker.md` - Semantic check instructions (Track B)
- `../scripts/check-semantic.ts` - Semantic check result validator (optional)

---

**Version**: 1.0.0
**Last Updated**: 2026-01-20
**Maintainer**: smart-dev plugin
