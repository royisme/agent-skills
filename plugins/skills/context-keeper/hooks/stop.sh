#!/usr/bin/env bash
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
context_keeper_dir="${root}/.context-keeper"
pending_file="${context_keeper_dir}/pending.txt"

# Check if there are any pending changes
if [[ -f "${pending_file}" && -s "${pending_file}" ]]; then
    echo "=================================================================================================="
    echo "[context-keeper] MANDATORY: Complete Documentation Before Session End"
    echo "=================================================================================================="
    echo ""
    echo "The following files were modified during this session. You MUST update their documentation:"
    echo ""

    # Group files by directory
    declare -A dir_map
    declare -a all_files

    while IFS= read -r file; do
        [[ -z "${file}" ]] && continue

        # Get directory (file path without filename)
        dir_path=$(dirname "${file}")

        # If file is in root, use "." as directory
        if [[ "${dir_path}" == "." ]]; then
            dir_path="(root)"
        fi

        # Add file to directory group
        if [[ -z "${dir_map[${dir_path}]+x}" ]]; then
            dir_map[${dir_path}]=""
        fi
        dir_map[${dir_path}]="${dir_map[${dir_path}]}  - ${file}$(printf '\n')"

        all_files+=("${file}")
    done < "${pending_file}"

    # Print grouped files
    for dir in $(printf '%s\n' "${!dir_map[@]}" | sort); do
        echo "Directory: ${dir}"
        echo "${dir_map[${dir}]}"
        echo ""
    done

    echo "Required Actions:"
    echo ""
    echo "1. For EACH directory listed above:"
    echo "   - Read the modified files to understand what changed"
    echo "   - Create or update <directory>/TECH_INFO.md"
    echo "   - Update the File Inventory table with accurate descriptions"
    echo "   - Update the Change Log with today's date and your changes"
    echo ""
    echo "2. For EACH modified file:"
    echo "   - Ensure the file header comment is present"
    echo "   - Update @description if the file's purpose changed"
    echo "   - Update @lastModified to today's date (YYYY-MM-DD)"
    echo ""
    echo "3. If any NEW directories were created:"
    echo "   - Create a new TECH_INFO.md file for that directory"
    echo "   - Use the context-keeper template format"
    echo ""
    echo "4. If the overall project structure changed:"
    echo "   - Update USERAGENTS.md directory structure"
    echo ""
    echo "TECH_INFO.md Template:"
    echo '```markdown'
    echo '# [Directory Name] - Technical Documentation'
    echo ''
    echo '> **Directory purpose**: [Based on your analysis]'
    echo '> **Last updated**: [Today'"'"'s date]'
    echo ''
    echo '---'
    echo ''
    echo '## 📁 File Inventory'
    echo ''
    echo '| Filename | Description | Input | Output | Dependencies |'
    echo '|----------|-------------|-------|--------|--------------|'
    echo '| file1.ts | [Your description] | Type | Type | ./other-file |'
    echo '```'
    echo ""
    echo "=================================================================================================="
    echo "[context-keeper] This is MANDATORY. You cannot skip this step."
    echo "[context-keeper] Documentation is critical for maintaining context across sessions."
    echo "=================================================================================================="

    # Clean up pending file
    rm -f "${pending_file}"

    # If --strict mode, exit with error code to block completion
    if [[ "${1:-}" == "--strict" ]]; then
        exit 2
    fi
else
    # No pending changes, all good
    echo "[context-keeper] ✓ Documentation is in sync. No changes detected."
    rm -f "${pending_file}" 2>/dev/null || true
fi
