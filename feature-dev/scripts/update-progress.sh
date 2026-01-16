#!/bin/bash
# Update progress.md file for a feature
# Usage: update-progress.sh <feature-name> <phase> <phase_name> <status>

set -euo pipefail

FEATURE_NAME="${1:-}"
PHASE="${2:-}"
PHASE_NAME="${3:-}"
STATUS="${4:-in_progress}"

if [ -z "$FEATURE_NAME" ] || [ -z "$PHASE" ] || [ -z "$PHASE_NAME" ]; then
    echo "Usage: $0 <feature-name> <phase> <phase_name> [status]"
    echo "Example: $0 user-auth 2 exploration in_progress"
    exit 1
fi

PROGRESS_FILE=".works/spec/${FEATURE_NAME}/progress.md"

if [ ! -f "$PROGRESS_FILE" ]; then
    echo "Error: Progress file not found: $PROGRESS_FILE"
    exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update the frontmatter fields using sed
# This is a simple approach - for complex updates, consider using yq or similar

# Update phase
sed -i.bak "s/^phase: .*/phase: $PHASE/" "$PROGRESS_FILE"
# Update phase_name
sed -i.bak "s/^phase_name: .*/phase_name: $PHASE_NAME/" "$PROGRESS_FILE"
# Update status
sed -i.bak "s/^status: .*/status: $STATUS/" "$PROGRESS_FILE"
# Update updated_at
sed -i.bak "s/^updated_at: .*/updated_at: $TIMESTAMP/" "$PROGRESS_FILE"

# Clean up backup files
rm -f "${PROGRESS_FILE}.bak"

echo "Updated progress for $FEATURE_NAME:"
echo "  Phase: $PHASE ($PHASE_NAME)"
echo "  Status: $STATUS"
echo "  Updated: $TIMESTAMP"
