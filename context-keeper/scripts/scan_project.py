#!/usr/bin/env python3
"""
Project Scanner for context-keeper

Scans a project directory to:
1. Detect tech stack from config files (package.json, go.mod, pyproject.toml, etc.)
2. Infer coding conventions based on tech stack
3. Generate USERAGENTS.md with project structure and coding rules
4. Create TECH_INFO.md templates for each directory
5. Update AGENTS.md/CLAUDE.md to enforce reading USERAGENTS.md

Usage:
    python scan_project.py <project-path> [--dry-run]
"""

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime
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
        "check": lambda p: (p / "package.json").exists() and not (p / "tsconfig.json").exists(),
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
        "check": lambda p: any((p / f).exists() for f in ["pyproject.toml", "requirements.txt", "setup.py"]),
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
        "禁止使用 `any` 类型，必须使用明确的类型定义",
        "使用 `unknown` 代替 `any` 处理未知类型",
        "所有函数必须有明确的返回类型声明",
        "使用 `interface` 定义对象结构，`type` 定义联合类型或复杂类型",
        "启用 strict 模式下的所有检查",
    ],
    "javascript": [
        "使用 ES6+ 语法",
        "使用 const 和 let，禁止 var",
        "使用解构赋值简化代码",
    ],
    "react": [
        "使用函数组件和 Hooks，避免 class 组件",
        "组件文件使用 PascalCase 命名",
        "使用 React.memo() 优化渲染性能",
        "使用 useMemo/useCallback 避免不必要的重渲染",
    ],
    "astro": [
        "使用 Astro 组件处理静态内容",
        "仅在需要交互时使用 React/Vue 岛屿组件",
        "遵循 Astro 的文件路由约定",
    ],
    "nextjs": [
        "使用 App Router (app/) 而非 Pages Router",
        "使用 Server Components 作为默认",
        "仅在需要交互时使用 'use client'",
    ],
    "go": [
        "遵循 Go 官方代码规范 (Effective Go)",
        "使用 gofmt 格式化代码",
        "错误必须显式处理，禁止忽略 error 返回值",
        "使用有意义的变量名，避免单字母变量（循环变量除外）",
    ],
    "python": [
        "遵循 PEP 8 代码规范",
        "使用类型提示 (Type Hints)",
        "使用 f-string 进行字符串格式化",
        "使用 pathlib 而非 os.path",
    ],
    "rust": [
        "使用 cargo fmt 格式化代码",
        "使用 cargo clippy 进行代码检查",
        "优先使用 Result 而非 panic",
        "所有公共 API 必须有文档注释",
    ],
    "common": [
        "禁止直接使用原生 fetch，必须通过封装的 HTTP 工具类发起请求",
        "禁止硬编码敏感信息（API keys、密码等）",
        "禁止提交 .env 等配置文件到 git",
        "所有异步操作必须有适当的错误处理",
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
    ".git", ".svn",
    # IDE & editors
    ".idea", ".vscode", ".cursor",
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


def analyze_directory_structure(project_path: Path, max_depth: int = 3) -> dict:
    """Analyze project directory structure."""
    structure = {}

    # Get ignore patterns from .gitignore
    ignore_dirs = get_ignore_dirs(project_path)

    def scan_dir(path: Path, current_depth: int = 0) -> Optional[dict]:
        if current_depth > max_depth:
            return None
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
                    subdir = scan_dir(item, current_depth + 1)
                    if subdir:
                        result["subdirs"].append(subdir)
        except PermissionError:
            pass

        return result

    return scan_dir(project_path, 0)


def infer_directory_purpose(dir_name: str, files: list[str]) -> str:
    """Infer the purpose of a directory based on its name and contents."""
    name_lower = dir_name.lower()

    purpose_map = {
        "src": "源代码主目录",
        "lib": "库文件和工具函数",
        "utils": "通用工具函数",
        "helpers": "辅助函数",
        "components": "UI 组件",
        "pages": "页面组件/路由",
        "app": "应用核心逻辑",
        "api": "API 接口定义",
        "services": "业务服务层",
        "hooks": "React Hooks",
        "stores": "状态管理",
        "store": "状态管理",
        "types": "类型定义",
        "interfaces": "接口定义",
        "models": "数据模型",
        "schemas": "数据校验 schema",
        "config": "配置文件",
        "constants": "常量定义",
        "assets": "静态资源",
        "public": "公共静态文件",
        "static": "静态文件",
        "styles": "样式文件",
        "css": "CSS 样式",
        "tests": "测试文件",
        "test": "测试文件",
        "__tests__": "测试文件",
        "spec": "测试规范",
        "scripts": "脚本文件",
        "bin": "可执行文件",
        "docs": "文档",
        "migrations": "数据库迁移",
        "middleware": "中间件",
        "plugins": "插件",
        "layouts": "布局组件",
        "templates": "模板文件",
        "features": "功能模块",
        "modules": "业务模块",
        "domain": "领域模型",
        "infrastructure": "基础设施层",
        "adapters": "适配器层",
        "ports": "端口定义",
    }

    for key, purpose in purpose_map.items():
        if name_lower == key or name_lower.endswith(key):
            return purpose

    return "[待补充：请描述该目录的功能]"


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

    content = f"""# {project_name} - 项目上下文引导

> **自动生成时间**: {timestamp}
> **技术栈**: {', '.join(tech_stacks) if tech_stacks else '未检测到'}

---

## ⚠️ 强制执行规则

**每次操作前，必须执行以下步骤：**

1. **阅读相关目录的 TECH_INFO.md** - 了解该目录下各文件的功能和依赖关系
2. **遵循下方的编码规范** - 确保代码符合项目标准
3. **修改完成后更新文档** - 同步更新 TECH_INFO.md 和文件头注释

---

## 📁 项目目录结构

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
            lines.append(f"└── USERAGENTS.md  # 📌 本引导文件")
            lines.append(f"```")

        return "\n".join(lines)

    if structure:
        content += render_structure(structure)

    content += f"""

---

## 📋 编码规范

以下规范必须严格遵守：

"""

    for i, conv in enumerate(conventions, 1):
        content += f"{i}. {conv}\n"

    content += """

---

## 📝 文档维护规则

### TECH_INFO.md 维护

每个目录必须包含 `TECH_INFO.md` 文件，内容包括：

```markdown
# [目录名] 技术文档

## 文件清单

| 文件名 | 功能描述 | 入参 | 出参 | 依赖 |
|--------|----------|------|------|------|
| xxx.ts | 描述功能 | 类型 | 类型 | 依赖文件 |

## 最近变更

- [日期] [变更内容]
```

### 文件头注释规范

每个代码文件必须包含头部注释：

```typescript
/**
 * @file 文件名
 * @description 功能描述
 * @module 所属模块
 * @dependencies 依赖的其他文件
 * @lastModified YYYY-MM-DD
 */
```

### 强制更新时机

在以下情况下，**必须**更新相关文档：

1. ✅ 新增文件 → 更新 TECH_INFO.md 文件清单
2. ✅ 修改文件功能 → 更新文件头注释和 TECH_INFO.md
3. ✅ 删除文件 → 从 TECH_INFO.md 移除
4. ✅ 修改依赖关系 → 更新依赖说明
5. ✅ 新增目录 → 创建新的 TECH_INFO.md

---

## 🔗 目录文档索引

"""

    def list_tech_info_links(node: dict, base_path: str = "") -> list[str]:
        links = []
        current_path = f"{base_path}/{node['name']}" if base_path else node['name']

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

    content = f"""# {dir_name} - 技术文档

> **目录功能**: {purpose}
> **最后更新**: {timestamp}

---

## 📁 文件清单

| 文件名 | 功能描述 | 入参 | 出参 | 依赖 |
|--------|----------|------|------|------|
"""

    for file in sorted(files):
        if file.endswith(('.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs')):
            content += f"| `{file}` | [待补充] | [待补充] | [待补充] | [待补充] |\n"

    if not any(f.endswith(('.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs')) for f in files):
        content += "| (无代码文件) | - | - | - | - |\n"

    content += """

---

## 🔄 变更记录

| 日期 | 变更内容 | 操作者 |
|------|----------|--------|
| {timestamp} | 初始化技术文档 | context-keeper |

---

## 📝 备注

[在此添加该目录的特殊说明、架构决策或注意事项]
""".format(timestamp=timestamp)

    return content


def generate_agents_patch(project_path: Path) -> str:
    """Generate content to add to AGENTS.md/CLAUDE.md."""

    return """
## 🔒 强制执行：上下文维护 (context-keeper)

**在开始任何代码修改前，必须执行以下步骤：**

1. **阅读 USERAGENTS.md** - 了解项目结构和编码规范
2. **阅读目标目录的 TECH_INFO.md** - 了解该目录下各文件的功能
3. **遵循编码规范** - 确保代码符合项目标准

**完成代码修改后，必须执行以下步骤：**

1. **更新 TECH_INFO.md** - 如果新增/修改/删除了文件
2. **更新文件头注释** - 确保 @description 和 @lastModified 准确
3. **检查 USERAGENTS.md** - 如果项目结构发生变化则更新

**这是强制要求，不可跳过。**

"""


# ============================================================================
# Main Execution
# ============================================================================

def create_tech_info_files(project_path: Path, structure: dict, dry_run: bool = False):
    """Create TECH_INFO.md files for each directory."""

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

            new_content = "\n".join(lines[:insert_idx]) + "\n" + patch_content + "\n".join(lines[insert_idx:])

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
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")

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
    useragents_content = generate_useragents_md(project_path, tech_stacks, conventions, structure)
    useragents_path = project_path / "USERAGENTS.md"

    if args.dry_run:
        print(f"[DRY-RUN] Would create: {useragents_path}")
    else:
        useragents_path.write_text(useragents_content)
        print(f"✅ Created: {useragents_path}")
    print()

    # Step 5: Create TECH_INFO.md files
    print("📄 Creating TECH_INFO.md files...")
    create_tech_info_files(project_path, structure, args.dry_run)
    print()

    # Step 6: Update AGENTS.md/CLAUDE.md
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
    print("3. The agent will now maintain these documents automatically")


if __name__ == "__main__":
    main()
