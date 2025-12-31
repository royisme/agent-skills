---
name: context-keeper
description: Maintains project context through progressive disclosure and enforced documentation. This skill should be used when starting work on a new project to initialize context documentation, or continuously during development to maintain up-to-date project structure and coding conventions. Triggers on project initialization, file modifications, or when the agent needs to understand project architecture.
---

# Context Keeper

Maintains project context through layered documentation and enforced synchronization.

## Overview

Context Keeper implements a three-level documentation system that ensures AI agents always have accurate, up-to-date context about the codebase:

1. **USERAGENTS.md** - Project-level: structure, conventions, and directory index
2. **TECH_INFO.md** - Directory-level: file descriptions, dependencies, and changes
3. **File headers** - File-level: function descriptions, parameters, and modification dates

## When to Use This Skill

- **Project initialization**: Run `scan_project.py` to generate initial documentation
- **Before modifying code**: Read the relevant TECH_INFO.md first
- **After completing changes**: Update TECH_INFO.md and file headers
- **When project structure changes**: Update USERAGENTS.md

## Workflow

### Phase 1: Initialize Project Context

Run the scanner to generate initial documentation:

```bash
python scripts/scan_project.py <project-path>
```

The script will:
1. Detect tech stack (TypeScript, React, Go, Python, etc.)
2. Infer coding conventions based on tech stack
3. Generate USERAGENTS.md with project structure
4. Create TECH_INFO.md templates for each directory
5. Update AGENTS.md/CLAUDE.md with enforcement instructions

Use `--dry-run` to preview changes without modifying files.

### Phase 2: Before Any Code Modification

Before modifying any file, follow this checklist:

```
Pre-modification checklist:
- [ ] Read USERAGENTS.md to understand project conventions
- [ ] Read target directory's TECH_INFO.md
- [ ] Understand file dependencies from TECH_INFO.md
- [ ] Review file header comments for context
```

### Phase 3: After Code Modification

After completing changes, update documentation:

```
Post-modification checklist:
- [ ] Update file header (@description, @lastModified)
- [ ] Update TECH_INFO.md file table if file added/changed
- [ ] Add change record to TECH_INFO.md
- [ ] Update USERAGENTS.md if directory structure changed
```

### Phase 4: Task Completion Review

At the end of each task, verify:

1. **Structure changes**: Did the project structure change? Update USERAGENTS.md
2. **Convention changes**: Were new patterns introduced? Update coding conventions
3. **Documentation sync**: Are all TECH_INFO.md files current?

## Documentation Templates

### TECH_INFO.md Template

See [references/tech_info_template.md](references/tech_info_template.md) for the standard template.

### File Header Template

```typescript
/**
 * @file filename.ts
 * @description Brief description of file purpose
 * @module ModuleName
 * @dependencies ./dependency1, ./dependency2
 * @lastModified YYYY-MM-DD
 */
```

### USERAGENTS.md Sections

See [references/useragents_template.md](references/useragents_template.md) for the standard structure.

## Coding Conventions by Tech Stack

The scanner automatically infers conventions based on detected tech stack. Common rules include:

**TypeScript/JavaScript:**
- No `any` types - use `unknown` for unknown types
- Explicit return types on functions
- Use `interface` for objects, `type` for unions

**React:**
- Function components with hooks only
- PascalCase for component files
- Use React.memo() for optimization

**Go:**
- Follow Effective Go guidelines
- Always handle errors explicitly
- Use gofmt for formatting

**Python:**
- Follow PEP 8
- Use type hints
- Use f-strings and pathlib

**Common (all projects):**
- No direct fetch - use HTTP wrapper utilities
- No hardcoded secrets
- Proper error handling for async operations

## Enforcement Mechanism

The skill adds mandatory instructions to AGENTS.md/CLAUDE.md:

1. **Pre-read requirement**: Agent must read USERAGENTS.md and relevant TECH_INFO.md before any modification
2. **Post-update requirement**: Agent must update documentation after any modification
3. **Structure sync**: Agent must check if USERAGENTS.md needs updating after task completion

This creates a self-maintaining documentation loop.

## File Structure

```
project/
├── AGENTS.md          # Contains enforcement instructions
├── USERAGENTS.md      # Project-level context (auto-generated)
├── src/
│   ├── TECH_INFO.md   # Directory-level documentation
│   ├── components/
│   │   ├── TECH_INFO.md
│   │   └── Button.tsx # With file header comments
│   └── utils/
│       ├── TECH_INFO.md
│       └── http.ts
└── .gitignore         # Contains TECH_INFO.md
```

## Notes

- TECH_INFO.md files are added to .gitignore by default (local context only)
- USERAGENTS.md can be committed if desired for team sharing
- The scanner can be re-run to refresh documentation
