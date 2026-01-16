#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
context-keeper reminder:
- Read USERAGENTS.md and relevant TECH_INFO.md before edits.
- Update TECH_INFO.md and file headers after changes.
- Update USERAGENTS.md if structure changed.
EOF
