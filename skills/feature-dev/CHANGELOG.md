# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-13

### Added

- Initial release of Feature Development Workflow skill
- 5-phase workflow: Discovery → Exploration → Documentation → Implementation → Review
- Multi-model agent support:
  - `product-thinker` (Opus) - Deep product decisions
  - `codebase-explorer` (Haiku) - Fast codebase exploration
  - `architect` (Sonnet) - Architecture design
  - `reviewer` (Sonnet) - Code quality review
- Progress persistence with `progress.md` (YAML frontmatter + markdown)
- Session recovery via `check-progress.sh` hook
- Automatic CHANGELOG.md updates on feature completion
- Spec file templates in `.works/spec/{feature}/`
- Scripts:
  - `init.sh` - Initialize feature workspace
  - `check-progress.sh` - Check for incomplete features
  - `update-progress.sh` - Update progress state
  - `update-changelog.sh` - Update CHANGELOG.md
- Reference documentation:
  - `workflow-phases.md` - Detailed phase instructions
  - `file-structure.md` - Spec file templates
  - `code-organization.md` - Code layer conventions
