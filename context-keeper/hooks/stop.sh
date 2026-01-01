#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 "${script_dir}/scripts/check_context_sync.py" "${root}" "$@"
