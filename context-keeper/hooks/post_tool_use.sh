#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
context_keeper_dir="${root}/.context-keeper"
mkdir -p "${context_keeper_dir}"

pending_file="${context_keeper_dir}/pending.txt"

# Read tool input from stdin
tool_input=$(cat)

# Extract tool name from first line (format: "tool_name: input")
tool_name=$(echo "${tool_input}" | head -n 1 | cut -d: -f1)

# Only track file-modifying tools
case "${tool_name}" in
    edit_file|write|create|delete)
        # Extract file path from tool input
        # Look for patterns like path="/path/to/file" or "path = '/path/to/file'"
        file_path=$(echo "${tool_input}" | grep -oE 'path\s*=\s*["\x27]([^"\x27]+)["\x27]' | sed 's/.*["\x27]\([^"\x27]*\)["\x27].*/\1/' | head -n 1)

        if [[ -n "${file_path}" ]]; then
            # Make path relative to project root if it's absolute
            if [[ "${file_path}" == "${root}"* ]]; then
                file_path="${file_path#"${root}"/}"
            fi

            # Append to pending list
            echo "${file_path}" >> "${pending_file}"
        fi
        ;;
esac
