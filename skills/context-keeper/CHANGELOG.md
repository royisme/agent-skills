# Changelog

All notable changes to context-keeper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release preparation for marketplace distribution

## [1.0.0] - 2025-01-03

### Added
- **Feature**: Three-level documentation system (USERAGENTS.md, TECH_INFO.md, file headers)
- **Feature**: Automatic tech stack detection (TypeScript, React, Go, Python, etc.)
- **Feature**: Coding conventions inference based on detected stack
- **Feature**: Smart directory filtering using `.gitignore`
- **Feature**: On-demand TECH_INFO.md generation (no pre-generation)
- **Feature**: Hook-based enforcement system for documentation updates
  - `session_start.sh` - Initial context setup
  - `post_tool_use.sh` - Track file modifications
  - `stop.sh` - Mandatory documentation updates at session end
  - `--strict` flag to block completion until docs updated
- **Feature**: Progressive disclosure documentation model
- **Feature**: English-language output for international teams
- **Feature**: No artificial directory depth limitation

### Documentation
- **docs**: Comprehensive SKILL.md with workflow guidance
- **docs**: Template files in `references/` directory
- **docs**: TECH_INFO.md template with file inventory table
- **docs**: USERAGENTS.md template with project structure
- **docs**: File header template with @description, @lastModified tags
- **docs**: Coding conventions by tech stack (TS/React/Go/Python)

### Technical
- **Python**: Standard library only (no external dependencies)
- **Python 3.7+** compatibility
- **Git integration**: .gitignore parsing and change tracking
- **Error handling**: Explicit error handling, no bare except clauses