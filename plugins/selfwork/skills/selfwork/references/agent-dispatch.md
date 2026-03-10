# Agent Dispatch Reference

## Architect

```
subagent_type: architect
prompt: requirement + run_id + output paths (plan.md and specs/ dir)
produces: plan.md + specs/tN.md for each task
```

## Developer

```
subagent_type: haiku-dev (small) | sonnet-dev (medium/hard)
prompt: spec path + done output path + failure_notes if this is a retry
produces: implementation code + done/tN.md completion note
```

## Reviewer

```
subagent_type: reviewer
prompt: spec path + done note path + reviews output path
produces: reviews/tN.md verdict
```

## Agent Selection

| Complexity | Agent      |
|------------|------------|
| small      | haiku-dev  |
| medium     | sonnet-dev |
| hard       | sonnet-dev |

On retry, escalate to `sonnet-dev` when the failure context or reviewer issues make the task materially harder.

## Prompt Templates

### Architect prompt
```
## Requirement
<user requirement>

## Run ID
<run-id>

## Output Paths
- plan.md: .claude/selfwork/runs/<run-id>/plan.md
- specs dir: .claude/selfwork/runs/<run-id>/specs/
```

### Developer prompt
```
Spec: .claude/selfwork/runs/<run-id>/specs/tN.md
Done output: .claude/selfwork/runs/<run-id>/done/tN.md
[Retry context: <failure_notes from previous attempt>]  ← only on retry
```

### Reviewer prompt
```
Spec: .claude/selfwork/runs/<run-id>/specs/tN.md
Done note: .claude/selfwork/runs/<run-id>/done/tN.md
Review output: .claude/selfwork/runs/<run-id>/reviews/tN.md
```
