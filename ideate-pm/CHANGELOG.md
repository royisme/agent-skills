# Changelog

All notable changes to ideate-pm will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No changes yet.

## [1.0.0] - 2025-01-03

### Added

#### Core Features
- **Product Requirements Management**
  - Initialize products with `init_product.py`
  - Add requirements with `add_requirement.py`
  - Refine requirements with `refine_requirement.py`
  - Query current product state with `query_state.py`

- **Decision Tracking**
  - Record design decisions with `record_decision.py`
  - Associate decisions with questions and choices
  - Scope-aware decision tracking (product, requirement, etc.)

- **Open Questions Management**
  - Track unresolved questions with `add_open_question.py`
  - Link questions to specific requirements
  - Support for questions across different scopes

- **Full-Text Search**
  - Search across requirements, decisions, and questions
  - FTS5 backend with LIKE fallback for compatibility
  - Configurable search modes (auto, fts, like)

#### Storage & Views
- **SQLite Database**
  - Single-product-per-repo storage in `product/memory.sqlite`
  - FTS5 enabled for multilingual search
  - Automatic schema initialization

- **Markdown View Generation**
  - `PRODUCT.md`: Complete product overview with requirements and decisions
  - `BACKLOG.md`: Requirements organized by priority (P0, P1, P2)
  - `OPEN_QUESTIONS.md`: Unresolved questions grouped by scope
  - Automatic regeneration when data changes

#### Data Model
- **Requirements**
  - Unique IDs (R-001, R-002, etc.)
  - Status tracking: PROPOSED, READY, DONE
  - Priority levels: P0, P1, P2
  - Rich description fields

- **Decisions**
  - Structured decision recording
  - Question/choice pairs
  - Timestamps and operator tracking

- **Questions**
  - Link to requirements or products
  - Status tracking
  - Cross-scope support

#### Developer Tools
- **Python Scripts**
  - All tools implemented as command-line utilities
  - Type hints for all functions
  - Proper error handling and exit codes
  - Help messages for all commands

- **Dependencies**
  - `requirements.txt` with all dependencies
  - FTS5-enabled SQLite build included
  - Standard library only for core utilities

### Documentation
- **SKILL.md**: Complete usage instructions and workflows
- **ref/ops.md**: Detailed operation documentation
- **ref/schema.md**: Database schema documentation
- **ref/templates.md**: Markdown view template documentation

### Design Decisions
- **Skill-local storage**: Data stored inside `product/` directory to avoid extra conventions
- **No git commits**: `product/` directory excluded from version control (per-skill data)
- **Progressive disclosure**: Scripts only output necessary data, not internal structures
- **Separation of concerns**: Skills manage requirements, not engineering tasks or code implementation