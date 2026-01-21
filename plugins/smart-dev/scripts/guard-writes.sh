#!/usr/bin/env bash
# PreToolUse hook: Block writes to spec files if spec locked
# Args: $1=tool_name, $2=file_path (from Claude Code hook context)
# Returns:
#   0 = Allow tool use
#   2 = Block tool use

set -euo pipefail

TOOL_NAME="${1:-}"
FILE_PATH="${2:-}"

# Only guard Write/Edit tools
if [[ "$TOOL_NAME" != "Write" ]] && [[ "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Check if file is a spec file in a locked feature
if [[ "$FILE_PATH" =~ \.works/spec/([^/]+)/(contracts|tasks|README)\.md ]]; then
  feature_name="${BASH_REMATCH[1]}"
  spec_dir=".works/spec/$feature_name"

  if [[ -f "$spec_dir/spec.lock" ]]; then
    # Spec is locked - block edits
    echo "✗ Cannot edit spec files after spec.lock created" >&2
    echo "" >&2
    echo "File: $FILE_PATH" >&2
    echo "Feature: $feature_name" >&2

    # Try to get lock timestamp (cross-platform)
    if command -v stat &>/dev/null; then
      if stat -f %Sm "$spec_dir/spec.lock" &>/dev/null 2>&1; then
        # macOS
        lock_time=$(stat -f %Sm "$spec_dir/spec.lock")
        echo "Spec locked at: $lock_time" >&2
      elif stat -c %y "$spec_dir/spec.lock" &>/dev/null 2>&1; then
        # Linux
        lock_time=$(stat -c %y "$spec_dir/spec.lock")
        echo "Spec locked at: $lock_time" >&2
      fi
    fi

    echo "" >&2
    echo "To unlock (only if readiness gate needs re-run):" >&2
    echo "  rm $spec_dir/spec.lock" >&2

    # Block tool use
    exit 2
  fi
fi

# Allow tool use
exit 0
