# Subtask Specification Template

Path: `.claude/task-specs/<run-id>/subtasks/tN.md`

## Format

Header uses a JSON code block for structured contract fields. Descriptive content uses markdown.

```
\`\`\`json
{
  "task_id": "t1",
  "task_type": "tdd",
  "criticality": "critical",
  "test_command": "bun run test:run src/xxx.test.ts",
  "spec_source": "devDocs/spec/selfwork/xxx.md#section",
  "output_artifact": ".claude/dispatch/runs/<run-id>/artifacts/dev-report-t1.json"
}
\`\`\`

# tN: <task title>

## Goal
One sentence describing the core objective of this task.

## Target Files
- `path/to/file-a.ts`
- `path/to/file-b.ts`

## Dependencies
- tX (reason)
- tY (reason)

## Implementation Notes
- 3-6 key implementation points
- Each should be specific to the function/module level

## Acceptance Criteria
1. Verifiable behavioral outcome
2. Specified test_command passes
3. No scope creep

## On Completion

Developer must write a dev-report JSON to the `output_artifact` path:
\`\`\`json
{
  "run_id": "<run-id>",
  "task_id": "tN",
  "files_changed": ["path/to/file.ts"],
  "tests_written": ["path/to/file.test.ts"],
  "test_result": "pass",
  "notes": "Implementation notes"
}
\`\`\`
```
