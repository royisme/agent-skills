#!/bin/bash
# Check for incomplete feature development progress
# Called by SessionStart hook

set -euo pipefail

WORKS_DIR=".works/spec"

# Check if .works/spec directory exists
if [ ! -d "$WORKS_DIR" ]; then
    exit 0
fi

# Find all progress.md files with status: in_progress
found_incomplete=false
incomplete_features=""

for progress_file in "$WORKS_DIR"/*/progress.md; do
    [ -f "$progress_file" ] || continue

    # Extract status from YAML frontmatter
    status=$(sed -n '/^---$/,/^---$/p' "$progress_file" 2>/dev/null | grep "^status:" | cut -d: -f2 | tr -d ' ')

    if [ "$status" = "in_progress" ]; then
        found_incomplete=true
        feature_name=$(dirname "$progress_file" | xargs basename)
        phase=$(sed -n '/^---$/,/^---$/p' "$progress_file" 2>/dev/null | grep "^phase_name:" | cut -d: -f2 | tr -d ' ')
        updated=$(sed -n '/^---$/,/^---$/p' "$progress_file" 2>/dev/null | grep "^updated_at:" | cut -d: -f2- | tr -d ' ')

        incomplete_features="$incomplete_features
- Feature: $feature_name
  Phase: $phase
  Last updated: $updated
  Progress file: $progress_file"
    fi
done

if [ "$found_incomplete" = true ]; then
    echo "=== Incomplete Feature Development Found ==="
    echo "$incomplete_features"
    echo ""
    echo "To resume, read the progress file and continue from the recorded state."
fi
