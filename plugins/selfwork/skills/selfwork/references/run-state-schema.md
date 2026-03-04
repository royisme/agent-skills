# Run State Schema

## Authoritative Definition

JSON Schema file: `references/schemas/run-state.schema.json`

This document is a human-readable supplement. On conflict, the JSON Schema takes precedence.

## Status Values

### Run Status

| Value | Description | Precondition |
|-------|-------------|-------------|
| `planning` | Initializing, gathering requirements | New run created |
| `analyzing` | Analyst agent exploring codebase | Planning complete |
| `specifying` | Architect agent producing spec | Analysis report ready |
| `executing` | Developer + Reviewer loop | spec_status=approved |
| `completed` | All tasks done | All tasks completed |
| `blocked` | Unrecoverable blockage | Max retries exceeded / architectural issue |

### spec_status

| Value | Description |
|-------|-------------|
| `draft` | Architect producing / pending review |
| `approved` | User confirmed, execution allowed |
| `obsolete` | Needs re-specification |

### Task Status

| Value | Description |
|-------|-------------|
| `pending` | Awaiting dependencies or dispatch |
| `dispatched` | Assigned to an agent |
| `agent_done` | Agent completed, awaiting review |
| `reviewing` | Reviewer auditing |
| `completed` | Review passed |
| `failed` | Failed (max retries or blocked) |

## Artifacts Directory

```
runs/<run-id>/
├── state.json
└── artifacts/
    ├── analysis-report.json     # Analyst output
    ├── plan.json                # Architect output
    ├── dev-report-<tid>.json    # Developer output
    └── review-report-<tid>.json # Reviewer output
```

Each artifact has a corresponding JSON Schema: `references/schemas/<name>.schema.json`

## State Transition Gates

| Transition | Precondition |
|------------|-------------|
| planning → analyzing | Run created |
| analyzing → specifying | analysis-report.json exists and is valid |
| specifying → executing | plan.json exists + spec_status=approved |
| executing → completed | All task status=completed |
| any → blocked | Unrecoverable error |

## Compatibility

- Legacy runs (missing new fields) are **not supported** — they must be re-initialized via `/selfwork`.
- Missing required fields are treated as schema-invalid and block execution.
- No default-value fallbacks or automatic migration.
