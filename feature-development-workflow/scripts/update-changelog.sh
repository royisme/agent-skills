#!/bin/bash
# Update CHANGELOG.md with completed feature
# Usage: update-changelog.sh <feature-name> <version> <type>

set -euo pipefail

FEATURE_NAME="${1:-}"
VERSION="${2:-Unreleased}"
CHANGE_TYPE="${3:-Added}"

if [ -z "$FEATURE_NAME" ]; then
    echo "Usage: $0 <feature-name> [version] [type]"
    echo "Example: $0 user-auth 1.2.0 Added"
    echo ""
    echo "Types: Added, Changed, Deprecated, Removed, Fixed, Security"
    exit 1
fi

CHANGELOG_FILE="CHANGELOG.md"
PROGRESS_FILE=".works/spec/${FEATURE_NAME}/progress.md"

# Check if progress file exists
if [ ! -f "$PROGRESS_FILE" ]; then
    echo "Warning: Progress file not found: $PROGRESS_FILE"
    echo "Creating changelog entry without spec details..."
fi

# Get feature summary from README if available
SPEC_README=".works/spec/${FEATURE_NAME}/README.md"
FEATURE_SUMMARY=""
if [ -f "$SPEC_README" ]; then
    # Extract goal from README (first line after "Goal:")
    FEATURE_SUMMARY=$(grep -A1 "^> Goal:" "$SPEC_README" 2>/dev/null | tail -1 | sed 's/^> //' || echo "")
fi

# Get PR URL if available from progress.md
PR_URL=""
if [ -f "$PROGRESS_FILE" ]; then
    PR_URL=$(grep "^pr_url:" "$PROGRESS_FILE" 2>/dev/null | cut -d: -f2- | tr -d ' ' || echo "")
fi

# Generate changelog entry
TIMESTAMP=$(date +"%Y-%m-%d")
ENTRY="- **${FEATURE_NAME}**: ${FEATURE_SUMMARY:-Feature implementation}"
if [ -n "$PR_URL" ]; then
    ENTRY="${ENTRY} ([PR](${PR_URL}))"
fi

# Create CHANGELOG.md if it doesn't exist
if [ ! -f "$CHANGELOG_FILE" ]; then
    cat > "$CHANGELOG_FILE" << 'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

EOF
    echo "Created new CHANGELOG.md"
fi

# Find the section to add the entry
# Look for the version section, then the type section
if grep -q "## \[${VERSION}\]" "$CHANGELOG_FILE"; then
    # Version section exists, find the type section
    if grep -q "### ${CHANGE_TYPE}" "$CHANGELOG_FILE"; then
        # Add entry after the type header
        # Use awk to insert after the first occurrence of the type header under the version
        awk -v version="$VERSION" -v type="$CHANGE_TYPE" -v entry="$ENTRY" '
            BEGIN { found_version=0; found_type=0; inserted=0 }
            /^## \[/ {
                if (found_version && !inserted) { print entry; inserted=1 }
                found_version = ($0 ~ "\\[" version "\\]")
            }
            /^### / && found_version {
                if (found_type && !inserted) { print entry; inserted=1 }
                found_type = ($0 ~ type)
            }
            { print }
            END { if (!inserted) print entry }
        ' "$CHANGELOG_FILE" > "${CHANGELOG_FILE}.tmp" && mv "${CHANGELOG_FILE}.tmp" "$CHANGELOG_FILE"
    else
        echo "Warning: ${CHANGE_TYPE} section not found under ${VERSION}"
        echo "Please add manually: ${ENTRY}"
    fi
else
    echo "Warning: Version ${VERSION} section not found"
    echo "Please add manually: ${ENTRY}"
fi

echo ""
echo "Changelog entry prepared:"
echo "  Version: ${VERSION}"
echo "  Type: ${CHANGE_TYPE}"
echo "  Entry: ${ENTRY}"
echo ""
echo "Please review CHANGELOG.md and adjust as needed."
