# Schema (repo-scoped)

This skill assumes **one product per repo**. The SQLite database at
`product/memory.sqlite` (inside the skill folder) is the source of truth.

## Tables

### `meta`

Repo-level product identity and settings.

| Column | Type |
|---|---|
| `key` | TEXT PRIMARY KEY |
| `value` | TEXT |

Common keys:

- `title`
- `vision`
- `constraints`

### `requirement`

Requirement items (the “set elements”).

| Column | Type |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `req_id` | TEXT UNIQUE |
| `title` | TEXT |
| `description` | TEXT |
| `status` | TEXT |
| `priority` | TEXT |
| `created_at` | DATETIME |
| `updated_at` | DATETIME |

`status` values: `PROPOSED`, `READY`, `DONE`.

### `acceptance`

Acceptance criteria for a requirement.

| Column | Type |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `requirement_id` | INTEGER |
| `text` | TEXT |
| `type` | TEXT |
| `created_at` | DATETIME |

`type` values: `CHECKLIST`, `GWT`.

### `decision`

Design decisions and assumptions.

| Column | Type |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `scope_type` | TEXT |
| `scope_ref` | TEXT |
| `question` | TEXT |
| `choice` | TEXT |
| `rationale` | TEXT |
| `confidence` | REAL |
| `created_at` | DATETIME |

`scope_type` values: `product`, `requirement`.

`scope_ref` is `product` or a `req_id` (e.g., `R-001`).

### `open_question`

Unresolved questions.

| Column | Type |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `scope_type` | TEXT |
| `scope_ref` | TEXT |
| `question` | TEXT |
| `severity` | TEXT |
| `created_at` | DATETIME |
| `resolved_by_decision_id` | INTEGER |

### `entity` and `edge`

Optional graph layer (terms, roles, data objects).

`entity(id, type, name, payload_json)`

`edge(id, src_entity_id, rel, dst_entity_id, evidence_ref, created_at)`
