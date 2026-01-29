#!/usr/bin/env bash
# Stop hook: Block exit unless loop completion conditions met
# Reads from stdin (Claude Code hook API provides session context)
# Returns:
#   0 = Allow stop
#   2 = Block stop (continue iteration)

set -euo pipefail

# Read hook input from stdin (for future use if needed)
HOOK_INPUT=$(cat)

FEATURE_DIR=".works/spec"

# Early exit: Check if feature directory exists
if [[ ! -d "$FEATURE_DIR" ]]; then
  exit 0
fi

# Find all in-progress features with mode=loop
LOOP_FEATURES=$(find "$FEATURE_DIR" -name "progress.md" -type f 2>/dev/null | while read -r file; do
  if [[ -f "$file" ]]; then
    mode=$(grep "^mode:" "$file" 2>/dev/null | head -n1 | awk '{print $2}' || echo "")
    status=$(grep "^status:" "$file" 2>/dev/null | head -n1 | awk '{print $2}' || echo "")

    if [[ "$mode" == "loop" ]] && [[ "$status" != "completed" ]] && [[ "$status" != "canceled" ]]; then
      dirname "$file"
    fi
  fi
done)

if [[ -z "$LOOP_FEATURES" ]]; then
  # No active loop features
  exit 0
fi

# Check each loop feature
for feature_path in $LOOP_FEATURES; do
  progress_file="$feature_path/progress.md"

  if [[ ! -f "$progress_file" ]]; then
    continue
  fi

  # Parse frontmatter
  iteration=$(grep "^iteration:" "$progress_file" 2>/dev/null | head -n1 | awk '{print $2}' || echo "0")
  max_iterations=$(grep "^max_iterations:" "$progress_file" 2>/dev/null | head -n1 | awk '{print $2}' || echo "20")
  status=$(grep "^status:" "$progress_file" 2>/dev/null | head -n1 | awk '{print $2}' || echo "")
  last_verification=$(grep "^last_verification_status:" "$progress_file" 2>/dev/null | head -n1 | awk '{print $2}' | tr -d '"' || echo "")
  completion_promise=$(grep "^completion_promise:" "$progress_file" 2>/dev/null | head -n1 | cut -d':' -f2- | tr -d ' "' || echo "DONE")

  feature_name=$(basename "$feature_path")

  # Check stop conditions
  if [[ "$status" == "done" ]] && [[ "$last_verification" == "pass" ]]; then
    # Feature complete - allow stop
    echo "✓ Feature $feature_name completed (iteration $iteration/$max_iterations)" >&2
    continue
  fi

  if [[ "$iteration" -ge "$max_iterations" ]]; then
    # Max iterations reached - allow stop (will output timeout report)
    echo "⚠ Feature $feature_name reached max iterations ($max_iterations)" >&2
    continue
  fi

  # Feature still in progress - BLOCK STOP
  echo "⟳ Loop active: $feature_name (iteration $iteration/$max_iterations, status: $status)" >&2
  echo "" >&2
  echo "Next action required:" >&2

  case "$status" in
    collecting)
      echo "- Continue spec refinement and readiness gating (Phase 3c)" >&2
      ;;
    implementing)
      echo "- Continue implementation (Phase 4)" >&2
      ;;
    fixing)
      echo "- Fix verification failures and retry" >&2
      ;;
    blocked)
      echo "- Resolve blocking issues or cancel with /smart-dev:cancel $feature_name" >&2
      ;;
    *)
      echo "- Check progress.md and continue workflow" >&2
      ;;
  esac

  echo "" >&2
  echo "To cancel: /smart-dev:cancel $feature_name" >&2

  # Block stop
  exit 2
done

# All features complete
exit 0
