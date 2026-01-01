#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
log_dir="${root}/.context-keeper"
mkdir -p "${log_dir}"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
payload="$(cat)"

printf "%s\t%s\n" "${timestamp}" "${payload}" >> "${log_dir}/tool_use.log"
