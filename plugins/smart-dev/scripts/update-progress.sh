#!/bin/bash
# Update progress.md file for a feature
# Usage:
#   update-progress.sh <feature-name> <phase> <phase_name> <status>
#   update-progress.sh <feature-name> --set-field key=value [--set-field key2=value2 ...]

set -euo pipefail

FEATURE_NAME="${1:-}"

if [ -z "$FEATURE_NAME" ]; then
    echo "Usage: $0 <feature-name> <phase> <phase_name> [status]"
    echo "   OR: $0 <feature-name> --set-field key=value [--set-field key2=value2 ...]"
    echo "Example: $0 user-auth 2 exploration in_progress"
    echo "Example: $0 user-auth --set-field iteration=5 --set-field status=implementing"
    exit 1
fi

PROGRESS_FILE=".works/spec/${FEATURE_NAME}/progress.md"

if [ ! -f "$PROGRESS_FILE" ]; then
    echo "Error: Progress file not found: $PROGRESS_FILE"
    exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Check if using --set-field mode
if [ "${2:-}" = "--set-field" ]; then
    # --set-field mode: parse key=value pairs
    shift  # Remove feature name

    UPDATES=()
    while [ $# -gt 0 ]; do
        if [ "$1" = "--set-field" ]; then
            shift
            if [ $# -eq 0 ]; then
                echo "Error: --set-field requires a key=value argument"
                exit 1
            fi

            FIELD="$1"
            if [[ ! "$FIELD" =~ ^[a-z_]+= ]]; then
                echo "Error: Invalid field format. Expected key=value, got: $FIELD"
                exit 1
            fi

            KEY="${FIELD%%=*}"
            VALUE="${FIELD#*=}"

            # Escape special characters for sed
            ESCAPED_VALUE=$(echo "$VALUE" | sed 's/[&/\]/\\&/g')

            # Update the field
            sed -i.bak "s/^${KEY}: .*/${KEY}: ${ESCAPED_VALUE}/" "$PROGRESS_FILE"
            UPDATES+=("$KEY=$VALUE")
        else
            echo "Error: Unknown argument: $1"
            exit 1
        fi
        shift
    done

    # Always update timestamp
    sed -i.bak "s/^updated_at: .*/updated_at: $TIMESTAMP/" "$PROGRESS_FILE"

    # Clean up backup files
    rm -f "${PROGRESS_FILE}.bak"

    echo "Updated progress for $FEATURE_NAME:"
    for update in "${UPDATES[@]}"; do
        echo "  ${update}"
    done
    echo "  updated_at=$TIMESTAMP"

else
    # Legacy mode: positional arguments
    PHASE="${2:-}"
    PHASE_NAME="${3:-}"
    STATUS="${4:-in_progress}"

    if [ -z "$PHASE" ] || [ -z "$PHASE_NAME" ]; then
        echo "Usage: $0 <feature-name> <phase> <phase_name> [status]"
        echo "Example: $0 user-auth 2 exploration in_progress"
        exit 1
    fi

    # Update the frontmatter fields using sed
    sed -i.bak "s/^phase: .*/phase: $PHASE/" "$PROGRESS_FILE"
    sed -i.bak "s/^phase_name: .*/phase_name: $PHASE_NAME/" "$PROGRESS_FILE"
    sed -i.bak "s/^status: .*/status: $STATUS/" "$PROGRESS_FILE"
    sed -i.bak "s/^updated_at: .*/updated_at: $TIMESTAMP/" "$PROGRESS_FILE"

    # Clean up backup files
    rm -f "${PROGRESS_FILE}.bak"

    echo "Updated progress for $FEATURE_NAME:"
    echo "  Phase: $PHASE ($PHASE_NAME)"
    echo "  Status: $STATUS"
    echo "  Updated: $TIMESTAMP"
fi
