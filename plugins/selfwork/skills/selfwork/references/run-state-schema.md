# Run State Schema

## Authoritative Definition

JSON Schema file: `references/schemas/run-state.schema.json`

This document is a human-readable supplement. On conflict, the JSON Schema takes precedence.

## Status Values

### Run Status

| Value | Description | Precondition |
|-------|-------------|-------------|
| `planning` | Initial bootstrap and run creation | New run created |
| `intent_recognition` | Determine whether the request is already well specified | Planning complete |
| `info_collecting` | Info collector gathers context and references | Intent needs research |
| `analyzing` | Requirement analyst structures requirements | Research complete or requirement provided |
| `designing` | Product designer produces product spec | Requirements sufficiently clear |
| `specifying` | Architect agent producing technical spec and plan | Product design ready or clear requirement path |
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
| `dispatching` | Reserved for dispatch to avoid duplicate assignment |
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
    ├── info-collection.json       # Info collector output
    ├── requirement-analysis.json  # Requirement analyst output
    ├── product-spec.json          # Product designer output
    ├── plan.json                  # Architect output
    ├── dev-report-<tid>.json      # Developer output
    └── review-report-<tid>.json   # Reviewer output
```

Each artifact has a corresponding JSON Schema: `references/schemas/<name>.schema.json`

## Additional Runtime Fields

- Run-level fields:
  - `blocked_reason`: latest blocking reason
  - `updated_at`: last state write timestamp
  - `current_instruction`: instruction currently being executed
  - `last_instruction`: previously executed instruction
- Task-level fields:
  - `dispatch_count`: number of dispatch attempts
  - `last_artifact`: latest artifact path observed for the task
  - `last_error`: latest failure/review issue summary
  - `updated_at`: last task update timestamp

## State Transition Gates

| Transition | Precondition |
|------------|-------------|
| planning → intent_recognition | Run created |
| intent_recognition → info_collecting | Request needs more research |
| intent_recognition → specifying | Request already has clear specification input |
| info_collecting → analyzing | info-collection.json exists |
| analyzing → designing | requirement-analysis.json exists and is usable |
| designing → specifying | product-spec.json exists |
| specifying → executing | plan.json exists + spec_status=approved |
| executing → completed | All task status=completed |
| any → blocked | Unrecoverable error |

## Compatibility

- Legacy runs (missing new fields) are **not supported** — they must be re-initialized via `/selfwork`.
- Missing required fields are treated as schema-invalid and block execution.
- No default-value fallbacks or automatic migration.
