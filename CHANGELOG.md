# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial marketplace support for Claude Code plugin installation

## [1.0.0] - 2025-01-03

### Added

#### Marketplace
- **feat(marketplace)**: Add Claude Code marketplace support with `.claude-plugin/marketplace.json`
- Enable `claude plugin install` for all skills in the collection
- Plugin marketplace validation compliance

#### Skills
- **feat(auto-browser)**: Chrome browser automation via Puppeteer
  - Cross-platform Chrome detection
  - Page navigation with custom wait conditions
  - JavaScript execution and screenshot capture
  - Interactive DOM element picker

- **feat(context-keeper)**: Project context management system
  - Three-level documentation (USERAGENTS.md, TECH_INFO.md, file headers)
  - Automatic tech stack detection
  - On-demand documentation generation
  - Hook-based enforcement system

- **feat(ideate-pm)**: Product requirements management
  - SQLite-based requirements storage
  - Decision tracking and open questions
  - Full-text search with FTS5 support
  - Markdown view generation (PRODUCT.md, BACKLOG.md, OPEN_QUESTIONS.md)

### Documentation
- **docs**: Add comprehensive README with usage examples
- **docs**: Add AGENTS.md with project conventions
- **docs**: Include SKILL.md files for each skill