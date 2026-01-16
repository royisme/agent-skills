# [Project Name] - Project Context Guide

> **Generated at**: YYYY-MM-DD HH:MM
> **Tech stack**: TypeScript, React, etc.

---

## Table of Contents

- [Mandatory Rules](#-mandatory-rules)
- [Project Directory Structure](#-project-directory-structure)
- [Coding Conventions](#-coding-conventions)
- [Documentation Maintenance Rules](#-documentation-maintenance-rules)
- [Directory Documentation Index](#-directory-documentation-index)

---

## ⚠️ Mandatory Rules

**Before any operation, you must:**

1. **Read relevant directory's TECH_INFO.md** - Understand file functions and dependencies
2. **Follow coding conventions below** - Ensure code meets project standards
3. **Update documentation after changes** - Sync TECH_INFO.md and file header comments

---

## 📁 Project Directory Structure

```
project-name/
├── src/
│   ├── components/  # UI components
│   │   └── TECH_INFO.md
│   ├── pages/       # Page components/routes
│   │   └── TECH_INFO.md
│   ├── services/    # Business service layer
│   │   └── TECH_INFO.md
│   ├── utils/       # Utility functions
│   │   └── TECH_INFO.md
│   └── types/       # Type definitions
│       └── TECH_INFO.md
├── public/          # Public static files
└── USERAGENTS.md    # This guide file
```

---

## 📋 Coding Conventions

The following conventions must be strictly followed:

1. Do not use native fetch directly; must use wrapped HTTP utility
2. Do not hardcode sensitive information (API keys, passwords, etc.)
3. Do not commit .env files to git
4. All async operations must have proper error handling
5. [Add more conventions based on detected tech stack...]

---

## 📝 Documentation Maintenance Rules

### TECH_INFO.md Maintenance

Each directory must contain a `TECH_INFO.md` file with the following content:

```markdown
# [Directory Name] Technical Documentation

## File Inventory

| Filename | Description | Input | Output | Dependencies |
|----------|-------------|-------|--------|--------------|
| xxx.ts | Description of function | Type | Type | Dependent files |

## Recent Changes

- [Date] [Change description]
```

### File Header Comment Standard

Each code file must contain a header comment:

```typescript
/**
 * @file Filename
 * @description Function description
 * @module Module name
 * @dependencies Dependent files
 * @lastModified YYYY-MM-DD
 */
```

### Mandatory Update Triggers

In the following situations, you **must** update relevant documentation:

1. ✅ New file → Update TECH_INFO.md file inventory
2. ✅ Modified file → Update file header comment and TECH_INFO.md
3. ✅ Deleted file → Remove from TECH_INFO.md
4. ✅ Dependency changes → Update dependency descriptions
5. ✅ New directory → Create new TECH_INFO.md

---

## 🔗 Directory Documentation Index

- [src/components](src/components/TECH_INFO.md) - UI components
- [src/pages](src/pages/TECH_INFO.md) - Page components/routes
- [src/services](src/services/TECH_INFO.md) - Business service layer
- [src/utils](src/utils/TECH_INFO.md) - Utility functions
- [src/types](src/types/TECH_INFO.md) - Type definitions