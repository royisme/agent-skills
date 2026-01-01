#!/usr/bin/env python3
"""
Project Scanner for context-keeper

Scans a project directory to:
1. Detect tech stack from config files (package.json, go.mod, pyproject.toml, etc.)
2. Infer coding conventions based on tech stack
3. Generate USERAGENTS.md with project structure and coding rules
4. Update AGENTS.md/CLAUDE.md to enforce reading USERAGENTS.md

NOTE: TECH_INFO.md files are NOT pre-generated. They are created on-demand
when the AI agent works in a directory, ensuring only relevant directories
have documentation.

Usage:
    python scan_project.py <project-path> [--dry-run]
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# ============================================================================
# Tech Stack Detection
# ============================================================================

TECH_STACK_DETECTORS = {
    "typescript": {
        "files": ["package.json", "tsconfig.json"],
        "check": lambda p: (p / "tsconfig.json").exists() or _has_ts_dep(p),
    },
    "javascript": {
        "files": ["package.json"],
        "check": lambda p: (p / "package.json").exists()
        and not (p / "tsconfig.json").exists(),
    },
    "react": {
        "files": ["package.json"],
        "check": lambda p: _has_dep(p, "react"),
    },
    "vue": {
        "files": ["package.json"],
        "check": lambda p: _has_dep(p, "vue"),
    },
    "astro": {
        "files": ["package.json", "astro.config.mjs"],
        "check": lambda p: _has_dep(p, "astro"),
    },
    "nextjs": {
        "files": ["package.json", "next.config.js", "next.config.mjs"],
        "check": lambda p: _has_dep(p, "next"),
    },
    "go": {
        "files": ["go.mod"],
        "check": lambda p: (p / "go.mod").exists(),
    },
    "python": {
        "files": ["pyproject.toml", "requirements.txt", "setup.py"],
        "check": lambda p: any(
            (p / f).exists() for f in ["pyproject.toml", "requirements.txt", "setup.py"]
        ),
    },
    "rust": {
        "files": ["Cargo.toml"],
        "check": lambda p: (p / "Cargo.toml").exists(),
    },
    "java": {
        "files": ["pom.xml", "build.gradle"],
        "check": lambda p: (p / "pom.xml").exists() or (p / "build.gradle").exists(),
    },
}


def _read_package_json(project_path: Path) -> dict:
    """Read package.json if exists."""
    pkg_path = project_path / "package.json"
    if pkg_path.exists():
        try:
            return json.loads(pkg_path.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def _has_dep(project_path: Path, dep_name: str) -> bool:
    """Check if a dependency exists in package.json."""
    pkg = _read_package_json(project_path)
    deps = pkg.get("dependencies", {})
    dev_deps = pkg.get("devDependencies", {})
    return dep_name in deps or dep_name in dev_deps


def _has_ts_dep(project_path: Path) -> bool:
    """Check if TypeScript is a dependency."""
    return _has_dep(project_path, "typescript")


def detect_tech_stack(project_path: Path) -> list[str]:
    """Detect all tech stacks used in the project."""
    detected = []
    for tech, config in TECH_STACK_DETECTORS.items():
        try:
            if config["check"](project_path):
                detected.append(tech)
        except Exception:
            pass
    return detected


# ============================================================================
# Coding Conventions Inference
# ============================================================================

CODING_CONVENTIONS = {
    "typescript": [
        "Do not use `any` type; must use explicit type definitions",
        "Use `unknown` instead of `any` for unknown types",
        "All functions must have explicit return type declarations",
        "Use `interface` for object structures, `type` for unions and complex types",
        "Enable all strict mode checks",
    ],
    "javascript": [
        "Use ES6+ syntax",
        "Use const and let; avoid var",
        "Use destructuring to simplify code",
    ],
    "react": [
        "Use function components and Hooks; avoid class components",
        "Use PascalCase for component file names",
        "Use React.memo() for rendering optimization",
        "Use useMemo/useCallback to avoid unnecessary re-renders",
    ],
    "astro": [
        "Use Astro components for static content",
        "Use React/Vue island components only when interaction is needed",
        "Follow Astro file routing conventions",
    ],
    "nextjs": [
        "Use App Router (app/) instead of Pages Router",
        "Use Server Components by default",
        "Only use 'use client' when interaction is needed",
    ],
    "go": [
        "Follow Go official coding standards (Effective Go)",
        "Use gofmt for code formatting",
        "Errors must be handled explicitly; never ignore error return values",
        "Use meaningful variable names; avoid single-letter variables (except for loop variables)",
    ],
    "python": [
        "Follow PEP 8 coding standards",
        "Use type hints",
        "Use f-strings for string formatting",
        "Use pathlib instead of os.path",
    ],
    "rust": [
        "Use cargo fmt for code formatting",
        "Use cargo clippy for code linting",
        "Prefer Result over panic",
        "All public APIs must have documentation comments",
    ],
    "common": [
        "Do not use native fetch directly; must use wrapped HTTP utility",
        "Do not hardcode sensitive information (API keys, passwords, etc.)",
        "Do not commit .env files to git",
        "All async operations must have proper error handling",
    ],
}


def get_coding_conventions(tech_stacks: list[str]) -> list[str]:
    """Get coding conventions based on detected tech stacks."""
    conventions = []

    # Add common conventions first
    conventions.extend(CODING_CONVENTIONS.get("common", []))

    # Add tech-specific conventions
    for tech in tech_stacks:
        if tech in CODING_CONVENTIONS:
            conventions.extend(CODING_CONVENTIONS[tech])

    return conventions


# ============================================================================
# Directory Structure Analysis
# ============================================================================

# Default directories to always ignore
DEFAULT_IGNORE_DIRS = {
    # Version control
    ".git",
    ".svn",
    # IDE & editors
    ".idea",
    ".vscode",
    ".cursor",
    # Context-keeper internal
    ".context-keeper",
}


def parse_gitignore(project_path: Path) -> set[str]:
    """Parse .gitignore and extract directory patterns to ignore."""
    gitignore_path = project_path / ".gitignore"
    ignore_dirs = set()

    if not gitignore_path.exists():
        return ignore_dirs

    try:
        content = gitignore_path.read_text()
        for line in content.splitlines():
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith("#"):
                continue
            # Skip negation patterns
            if line.startswith("!"):
                continue
            # Handle directory patterns (ending with / or just directory names)
            if line.endswith("/"):
                ignore_dirs.add(line.rstrip("/"))
            else:
                # Also treat non-path patterns as potential directory names
                # Only if they don't contain wildcards or path separators
                if "*" not in line and "?" not in line:
                    # Remove leading slash if present
                    clean_line = line.lstrip("/")
                    if "/" not in clean_line:
                        ignore_dirs.add(clean_line)
    except Exception:
        pass

    return ignore_dirs


def get_ignore_dirs(project_path: Path) -> set[str]:
    """Get combined set of directories to ignore."""
    # Start with default ignores
    ignore_dirs = DEFAULT_IGNORE_DIRS.copy()

    # Add patterns from .gitignore
    gitignore_patterns = parse_gitignore(project_path)
    ignore_dirs.update(gitignore_patterns)

    return ignore_dirs


def analyze_directory_structure(project_path: Path) -> dict:
    """Analyze project directory structure."""
    structure = {}

    # Get ignore patterns from .gitignore
    ignore_dirs = get_ignore_dirs(project_path)

    def scan_dir(path: Path) -> Optional[dict]:
        if path.name in ignore_dirs:
            return None
        if not path.is_dir():
            return None

        result = {
            "name": path.name,
            "path": str(path.relative_to(project_path)),
            "files": [],
            "subdirs": [],
        }

        try:
            for item in sorted(path.iterdir()):
                if item.is_file() and not item.name.startswith("."):
                    result["files"].append(item.name)
                elif item.is_dir() and item.name not in ignore_dirs:
                    subdir = scan_dir(item)
                    if subdir:
                        result["subdirs"].append(subdir)
        except PermissionError:
            pass

        return result

    return scan_dir(project_path)


def infer_directory_purpose(dir_name: str, files: list[str]) -> str:
    """Infer the purpose of a directory based on its name and contents."""
    name_lower = dir_name.lower()

    purpose_map = {
        "src": "Source code root",
        "lib": "Library files and utility functions",
        "utils": "Utility functions",
        "helpers": "Helper functions",
        "components": "UI components",
        "pages": "Page components/routes",
        "app": "Application core logic",
        "api": "API interface definitions",
        "services": "Business service layer",
        "hooks": "React Hooks",
        "stores": "State management",
        "store": "State management",
        "types": "Type definitions",
        "interfaces": "Interface definitions",
        "models": "Data models",
        "schemas": "Data validation schemas",
        "config": "Configuration files",
        "constants": "Constant definitions",
        "assets": "Static assets",
        "public": "Public static files",
        "static": "Static files",
        "styles": "Style files",
        "css": "CSS stylesheets",
        "tests": "Test files",
        "test": "Test files",
        "__tests__": "Test files",
        "spec": "Test specifications",
        "scripts": "Script files",
        "bin": "Executable files",
        "docs": "Documentation",
        "migrations": "Database migrations",
        "middleware": "Middleware",
        "plugins": "Plugins",
        "layouts": "Layout components",
        "templates": "Template files",
        "features": "Feature modules",
        "modules": "Business modules",
        "domain": "Domain models",
        "infrastructure": "Infrastructure layer",
        "adapters": "Adapter layer",
        "ports": "Port definitions",
    }

    for key, purpose in purpose_map.items():
        if name_lower == key or name_lower.endswith(key):
            return purpose

    # Tier 2: Path semantics (e.g., payment-gateway -> Payment Gateway)
    readable = name.replace("-", " ").replace("_", " ").title()
    if readable != name:
        return f"{readable} module"

    # Tier 3: AI fallback
    return "[To be analyzed by AI based on file contents]"


# ============================================================================
# File Generation
# ============================================================================


def generate_useragents_md(
    project_path: Path,
    tech_stacks: list[str],
    conventions: list[str],
    structure: dict,
) -> str:
    """Generate USERAGENTS.md content."""

    project_name = project_path.name
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    content = f"""# {project_name} - Project Context Guide

> **Generated at**: {timestamp}
> **Tech stack**: {", ".join(tech_stacks) if tech_stacks else "Not detected"}

---

## ⚠️ Mandatory Rules

**Before any operation, you must:**

1. **Read relevant directory's TECH_INFO.md** - Understand file functions and dependencies
2. **Follow coding conventions below** - Ensure code meets project standards
3. **Update documentation after changes** - Sync TECH_INFO.md and file header comments

---

## 📁 Project Directory Structure

"""

    def render_structure(node: dict, indent: int = 0) -> str:
        lines = []
        prefix = "  " * indent
        purpose = infer_directory_purpose(node["name"], node["files"])

        if indent == 0:
            lines.append(f"```")
            lines.append(f"{node['name']}/")
        else:
            lines.append(f"{prefix}├── {node['name']}/  # {purpose}")
            lines.append(f"{prefix}│   └── TECH_INFO.md  # 📄 目录技术文档")

        for subdir in node.get("subdirs", []):
            lines.append(render_structure(subdir, indent + 1))

        if indent == 0:
            lines.append(f"└── USERAGENTS.md  # 📌 This guide file")
            lines.append(f"```")

        return "\n".join(lines)

    if structure:
        content += render_structure(structure)

    content += f"""

---

## 📋 Coding Conventions

The following conventions must be strictly followed:

"""

    for i, conv in enumerate(conventions, 1):
        content += f"{i}. {conv}\n"

    content += """

---

## 📝 Documentation Maintenance Rules

### TECH_INFO.md Maintenance

Each directory must contain a `TECH_INFO.md` file with the following content:

```markdown
# [Directory Name] Technical Documentation

## File Inventory

| Filename | Description | Input | Output | Dependencies |
|----------|-------------|-------|--------|--------------|
| xxx.ts | Function description | Type | Type | Dependent files |

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

"""

    def list_tech_info_links(node: dict, base_path: str = "") -> list[str]:
        links = []
        current_path = f"{base_path}/{node['name']}" if base_path else node["name"]

        if base_path:  # Skip root
            purpose = infer_directory_purpose(node["name"], node["files"])
            links.append(f"- [{node['name']}]({current_path}/TECH_INFO.md) - {purpose}")

        for subdir in node.get("subdirs", []):
            links.extend(list_tech_info_links(subdir, current_path))

        return links

    if structure:
        for link in list_tech_info_links(structure):
            content += link + "\n"

    return content


def generate_tech_info_md(dir_name: str, files: list[str]) -> str:
    """Generate TECH_INFO.md template for a directory."""

    purpose = infer_directory_purpose(dir_name, files)
    timestamp = datetime.now().strftime("%Y-%m-%d")

    content = f"""# {dir_name} - Technical Documentation

> **Directory purpose**: {purpose}
> **Last updated**: {timestamp}

---

## 📁 File Inventory

| Filename | Description | Input | Output | Dependencies |
|----------|-------------|-------|--------|--------------|
"""

    for file in sorted(files):
        if file.endswith((".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs")):
            content += f"| `{file}` | [待补充] | [待补充] | [待补充] | [待补充] |\n"

    if not any(
        f.endswith((".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs")) for f in files
    ):
        content += "| (无代码文件) | - | - | - | - |\n"

    content += """

---

## 🔄 Change Log

| Date | Change | Operator |
|------|--------|----------|
| {timestamp} | Initialized technical documentation | context-keeper |

---

## 📝 Notes

[Add special notes, architectural decisions, or considerations for this directory]
""".format(timestamp=timestamp)

    return content


def generate_agents_patch(project_path: Path) -> str:
    """Generate content to add to AGENTS.md/CLAUDE.md."""

    return """
## 🔒 MANDATORY: Context Maintenance (context-keeper)

**Before modifying any code, you must:**

1. **Read USERAGENTS.md** - Understand project structure and coding conventions
2. **Read target directory's TECH_INFO.md** - Understand file functions in that directory
3. **Follow coding conventions** - Ensure code meets project standards

**After completing code changes, you must:**

1. **Update TECH_INFO.md** - If files were added/modified/deleted
2. **Update file header comments** - Ensure @description and @lastModified are accurate
3. **Check USERAGENTS.md** - Update if project structure has changed

**Optional Enhancement (Recommended)**

- Install context-keeper hooks to check documentation sync at session end

**This is mandatory and cannot be skipped.**

"""


# ============================================================================
# Main Execution
# ============================================================================


def create_tech_info_files(project_path: Path, structure: dict, dry_run: bool = False):
    """
    Create TECH_INFO.md files for each directory.

    NOTE: This function is deprecated. TECH_INFO.md files should be created
    on-demand by the AI agent when working in a directory, rather than
    pre-generating for all directories.
    """

    def process_dir(node: dict, parent_path: Path):
        if node["path"] == ".":
            dir_path = parent_path
        else:
            dir_path = parent_path / node["path"]

        # Skip root directory
        if node["path"] != ".":
            tech_info_path = dir_path / "TECH_INFO.md"
            content = generate_tech_info_md(node["name"], node["files"])

            if dry_run:
                print(f"[DRY-RUN] Would create: {tech_info_path}")
            else:
                tech_info_path.write_text(content)
                print(f"✅ Created: {tech_info_path}")

        for subdir in node.get("subdirs", []):
            process_dir(subdir, parent_path)

    if structure:
        process_dir(structure, project_path)


def update_agents_file(project_path: Path, dry_run: bool = False) -> bool:
    """Update AGENTS.md or CLAUDE.md with context-keeper instructions."""

    agents_files = ["AGENTS.md", "CLAUDE.md"]
    patch_content = generate_agents_patch(project_path)
    marker = "## 🔒 强制执行：上下文维护 (context-keeper)"

    for filename in agents_files:
        filepath = project_path / filename
        if filepath.exists():
            current_content = filepath.read_text()

            # Check if already patched
            if marker in current_content:
                print(f"ℹ️  {filename} already contains context-keeper instructions")
                continue

            # Add patch at the beginning after any frontmatter
            lines = current_content.split("\n")
            insert_idx = 0

            # Skip YAML frontmatter if present
            if lines and lines[0].strip() == "---":
                for i, line in enumerate(lines[1:], 1):
                    if line.strip() == "---":
                        insert_idx = i + 1
                        break

            new_content = (
                "\n".join(lines[:insert_idx])
                + "\n"
                + patch_content
                + "\n".join(lines[insert_idx:])
            )

            if dry_run:
                print(f"[DRY-RUN] Would update: {filepath}")
            else:
                filepath.write_text(new_content)
                print(f"✅ Updated: {filepath}")

            return True

    # No existing file found, create AGENTS.md
    filepath = project_path / "AGENTS.md"
    content = f"# Agent Instructions\n\n{patch_content}"

    if dry_run:
        print(f"[DRY-RUN] Would create: {filepath}")
    else:
        filepath.write_text(content)
        print(f"✅ Created: {filepath}")

    return True


def main():
    parser = argparse.ArgumentParser(
        description="Scan project and generate context documentation"
    )
    parser.add_argument("project_path", help="Path to the project directory")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )

    args = parser.parse_args()
    project_path = Path(args.project_path).resolve()

    if not project_path.exists():
        print(f"❌ Error: Project path does not exist: {project_path}")
        sys.exit(1)

    if not project_path.is_dir():
        print(f"❌ Error: Project path is not a directory: {project_path}")
        sys.exit(1)

    print(f"🔍 Scanning project: {project_path}")
    print()

    # Step 1: Detect tech stack
    print("📊 Detecting tech stack...")
    tech_stacks = detect_tech_stack(project_path)
    print(f"   Found: {', '.join(tech_stacks) if tech_stacks else 'None detected'}")
    print()

    # Step 2: Get coding conventions
    print("📋 Inferring coding conventions...")
    conventions = get_coding_conventions(tech_stacks)
    print(f"   {len(conventions)} rules generated")
    print()

    # Step 3: Analyze directory structure
    print("📁 Analyzing directory structure...")
    structure = analyze_directory_structure(project_path)
    print()

    # Step 4: Generate USERAGENTS.md
    print("📝 Generating USERAGENTS.md...")
    useragents_content = generate_useragents_md(
        project_path, tech_stacks, conventions, structure
    )
    useragents_path = project_path / "USERAGENTS.md"

    if args.dry_run:
        print(f"[DRY-RUN] Would create: {useragents_path}")
    else:
        useragents_path.write_text(useragents_content)
        print(f"✅ Created: {useragents_path}")
    print()

    # Step 5: Update AGENTS.md/CLAUDE.md
    print("🔧 Updating agent configuration...")
    update_agents_file(project_path, args.dry_run)
    print()

    # Step 7: Update .gitignore
    gitignore_path = project_path / ".gitignore"
    tech_info_pattern = "TECH_INFO.md"

    if gitignore_path.exists():
        gitignore_content = gitignore_path.read_text()
        if tech_info_pattern not in gitignore_content:
            if args.dry_run:
                print(f"[DRY-RUN] Would add TECH_INFO.md to .gitignore")
            else:
                with open(gitignore_path, "a") as f:
                    f.write(f"\n# context-keeper\n{tech_info_pattern}\n")
                print(f"✅ Added TECH_INFO.md to .gitignore")

    print()
    print("🎉 Done! Project context documentation generated successfully.")
    print()
    print("Next steps:")
    print("1. Review and customize USERAGENTS.md")
    print("2. Fill in [待补充] sections in TECH_INFO.md files")
    print("3. Optionally install hooks for stop-time documentation checks")


if __name__ == "__main__":
    main()
