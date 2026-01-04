# CLAUDE SKILLS - PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-03
**Commit:** cd27986
**Branch:** main

## OVERVIEW

Claude Code skills collection extending AI agent capabilities. Python + Node.js implementations following Anthropic Skills specification.

## STRUCTURE

```
claude-skills/
├── auto-browser/     # Puppeteer web automation (Node.js)
├── context-keeper/   # Documentation maintenance (Python)
├── ideate-pm/        # Product requirements (Python + SQLite)
├── README.md
└── LICENSE           # MIT
```

## BUILD/LINT/TEST COMMANDS

### Python Skills (context-keeper, ideate-pm)
```bash
# Install dependencies (ideate-pm only)
pip install -r ideate-pm/requirements.txt

# Run context-keeper scanner
python3 context-keeper/scripts/scan_project.py <project-path>
python3 context-keeper/scripts/scan_project.py <project-path> --dry-run

# Initialize product requirements
python3 ideate-pm/scripts/init_product.py --title "Product Name"

# Product management commands
python3 ideate-pm/scripts/add_requirement.py --description "Requirement"
python3 ideate-pm/scripts/query_state.py
python3 ideate-pm/scripts/search.py --query "keyword"

# No automated tests - manual verification via documentation
```

### JavaScript Skills (auto-browser)
```bash
# Install dependencies (required first)
cd auto-browser && npm install

# Browser automation
node auto-browser/scripts/start.js --profile --port 9222
node auto-browser/scripts/nav.js https://example.com --new
node auto-browser/scripts/eval.js "document.title"
node auto-browser/scripts/screenshot.js --file screenshot.png --fullpage
node auto-browser/scripts/pick.js

# No automated tests - manual verification via browser
```

## CODE STYLE GUIDELINES

### Python Standards
- **PEP 8 compliance** with 4-space indentation
- **Type hints required** for all function parameters and returns
- **pathlib** for file operations, not os.path
- **argparse** for CLI interfaces with proper help messages
- **Explicit error handling** - no bare except clauses
- **f-strings** for string formatting

```python
#!/usr/bin/env python3
"""Module docstring"""

import argparse
from pathlib import Path
from typing import Optional

def main() -> None:
    """Entry point with proper error handling."""
    parser = argparse.ArgumentParser(description="Tool description")
    parser.add_argument("input", help="Input file")
    args = parser.parse_args()
    
    try:
        process_file(Path(args.input))
    except FileNotFoundError as e:
        print(f"Error: {e}")
        exit(1)

if __name__ == "__main__":
    main()
```

### JavaScript Standards
- **ESM modules only** (import/export, no require)
- **Node.js 18+** with modern syntax
- **Manual argument parsing** via process.argv (no CLI frameworks)
- **Process exit codes** (0 for success, 1 for errors)
- **Descriptive error messages** to console.error

```javascript
#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function printUsage() {
  console.log('Usage: script.js [options]');
  console.log('  --option    Description');
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    printUsage();
    return;
  }
  
  try {
    // Main logic
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
```

### Import/Export Conventions
- **Python**: Use absolute imports when possible, relative for local modules
- **JavaScript**: Named imports preferred, default imports for main exports
- **No circular dependencies** - keep skill boundaries clear

### Error Handling Patterns
- **Python**: Try/except with specific exceptions, meaningful messages
- **JavaScript**: Try/catch with console.error, process.exit(1) on failure
- **Graceful fallbacks** (e.g., FTS5 → LIKE in sqlite_support.py)

### File Naming and Structure
- **Scripts**: `snake_case.py` for Python, `camelCase.js` for JavaScript
- **Documentation**: `UPPER_CASE.md` (USERAGENTS.md, TECH_INFO.md)
- **No package.json files** in repo (except where required for npm install)
- **Each skill is self-contained** with its own dependencies

### Anti-Patterns (DO NOT DO)
- **TypeScript**: Never use `any` type, use `unknown` instead
- **Python**: Never commit .env files, never ignore errors silently
- **JavaScript**: No native fetch (use wrapped utilities when available)
- **Documentation**: Hooks should track but not modify code directly
- **Tests**: No automated test framework - manual verification only

## WORKFLOW REQUIREMENTS

### Before Modifying Code
1. Read `USERAGENTS.md` for project context
2. Read directory's `TECH_INFO.md` for local conventions  
3. Understand file dependencies from TECH_INFO.md tables
4. Check existing patterns in similar files

### After Modifying Code
1. Update file headers (@description, @lastModified)
2. Update TECH_INFO.md file table if files added/changed
3. Add change record to TECH_INFO.md change log
4. Update USERAGENTS.md if directory structure changed

### Context Keeper Integration
- `TECH_INFO.md` files are **local only** (excluded from git)
- Documentation is created **on-demand** when working in directories
- **Hooks enforce updates** via mandatory action lists at session end
- Use `--dry-run` flag to preview changes before applying

## ARCHITECTURAL PATTERNS

### Skill Structure (Required)
```
skill-name/
├── SKILL.md          # YAML frontmatter + instructions (REQUIRED)
├── scripts/          # Executable tools (at least one recommended)
├── references/       # Documentation or ref/ for ideate-pm
└── config.json       # Optional runtime configuration
```

### Data Storage Conventions
- **SQLite**: `ideate-pm/product/memory.sqlite` (skill-local)
- **Config**: JSON files in skill roots or specific config dirs
- **Temp**: System temp directories for generated files
- **Git ignored**: `.context-keeper/`, `TECH_INFO.md` files

## NOTES

- **No linting/formatting configs** - intentionally minimal
- **Mixed languages** appropriate to skill domains
- **FTS5 search** in ideate-pm with LIKE fallback for compatibility
- **Hook enforcement** blocks session until docs updated (--strict mode)
- **Cross-platform Chrome detection** in auto-browser skill
- **Progressive disclosure** documentation pattern for context management