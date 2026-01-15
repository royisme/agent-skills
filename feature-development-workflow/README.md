# Feature Development Workflow

A systematic 5-phase workflow for feature development in Claude Code.

## Overview

This skill provides a structured approach to feature development:

1. **Discovery** - Clarify requirements, make product decisions
2. **Exploration** - Understand existing codebase patterns
3. **Documentation** - Create spec documents before code
4. **Implementation** - Build incrementally with verification
5. **Review & PR** - Ensure quality and submit

## Key Features

- **Multi-model agents**: Right model for each task
  - Opus for deep product thinking
  - Haiku for fast exploration
  - Sonnet for architecture and review
- **Progress persistence**: Resume interrupted work seamlessly
- **Fork context**: Agents don't pollute main session context
- **Documentation-first**: Spec documents before code

## Installation

Add this skill to your Claude Code marketplace:

```bash
claude plugin marketplace add royisme/agent-skills
claude plugin install feature-development-workflow
```

Or add to `.claude/settings.json`:

```json
{
  "plugins": {
    "marketplaces": ["royisme/agent-skills"]
  }
}
```

## Usage

Invoke the skill:
- Say "implement a feature" or "add new feature"
- Use `/feature` command
- Ask for "feature workflow"

Example:
```
User: I want to add user authentication with OAuth
Claude: [Launches feature-development-workflow skill]
        Let me help you implement this feature systematically...
```

## File Structure

The skill creates spec files in `.works/spec/{feature-name}/`:

```
.works/spec/{feature-name}/
├── progress.md        # Progress tracking
├── README.md          # Index + decisions
├── contracts.md       # Data contracts
├── tasks.md           # Task breakdown
└── PR.md              # PR template
```

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `product-thinker` | Opus | Deep product decisions, UX analysis |
| `codebase-explorer` | Haiku | Fast codebase exploration |
| `architect` | Sonnet | Architecture design |
| `reviewer` | Sonnet | Code quality review |
| `react-coder` | Sonnet | Code writer |

## Scripts

| Script | Purpose |
|--------|---------|
| `init.sh {name}` | Initialize feature workspace |
| `check-progress.sh` | Check for incomplete features |
| `update-progress.sh` | Update progress state |
| `update-changelog.sh` | Update CHANGELOG.md |

## Requirements

- Claude Code 2.1.0+ (for `context: fork` support)
- Git repository
- Project with existing codebase

## License

MIT
