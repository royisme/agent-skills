#!/usr/bin/env python3
"""
Check whether TECH_INFO.md and USERAGENTS.md are updated alongside code changes.

This is a lightweight, non-invasive checker intended to be called from a Stop hook.
It only reads the git working tree status and the filesystem; it never writes files.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


CODE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx",
    ".py", ".go", ".rs",
    ".java", ".kt",
    ".c", ".cc", ".cpp", ".h", ".hpp",
    ".cs",
}


def _run_git(args: list[str], cwd: Path) -> str | None:
    try:
        return subprocess.check_output(["git", "-C", str(cwd), *args], text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _get_repo_root(project_path: Path) -> Path | None:
    output = _run_git(["rev-parse", "--show-toplevel"], project_path)
    if not output:
        return None
    return Path(output)


def _parse_status_lines(status_lines: list[str]) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    for line in status_lines:
        if not line:
            continue
        status = line[:2]
        path_part = line[3:]
        if " -> " in path_part:
            path_part = path_part.split(" -> ", 1)[1]
        entries.append((status, path_part))
    return entries


def _is_code_file(path: Path) -> bool:
    return path.suffix in CODE_EXTENSIONS


def _has_status(status: str, codes: set[str]) -> bool:
    return any(code in status for code in codes)


def check_context_sync(project_path: Path) -> int:
    repo_root = _get_repo_root(project_path)
    if not repo_root:
        print("context-keeper: not a git repository; skip check.")
        return 0

    status_output = _run_git(["status", "--porcelain"], repo_root)
    if status_output is None:
        print("context-keeper: unable to read git status; skip check.")
        return 0

    status_lines = status_output.splitlines()
    entries = _parse_status_lines(status_lines)
    if not entries:
        print("context-keeper: no working tree changes detected.")
        return 0

    changed_paths: list[Path] = []
    changed_paths_set: set[str] = set()
    structure_changed = False

    for status, rel_path in entries:
        path = Path(rel_path)
        changed_paths.append(path)
        changed_paths_set.add(path.as_posix())
        if _has_status(status, {"A", "D", "R", "?"}):
            structure_changed = True

    tech_info_dirs_missing: set[str] = set()
    for rel_path in changed_paths:
        if rel_path.name in {"TECH_INFO.md", "USERAGENTS.md"}:
            continue
        if not _is_code_file(rel_path):
            continue
        dir_path = rel_path.parent
        tech_info_path = dir_path / "TECH_INFO.md"
        if (repo_root / tech_info_path).exists():
            if tech_info_path.as_posix() not in changed_paths_set:
                tech_info_dirs_missing.add(dir_path.as_posix() or ".")

    useragents_missing = structure_changed and "USERAGENTS.md" not in changed_paths_set

    if not tech_info_dirs_missing and not useragents_missing:
        print("context-keeper: documentation appears to be in sync.")
        return 0

    print("context-keeper: documentation may be out of sync.")
    if tech_info_dirs_missing:
        dirs = ", ".join(sorted(tech_info_dirs_missing))
        print(f"- TECH_INFO.md not updated in: {dirs}")
    if useragents_missing:
        print("- USERAGENTS.md not updated after structural changes")

    print("Tip: update the docs, then re-run this check.")
    return 2


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check if context-keeper docs were updated with code changes"
    )
    parser.add_argument("project_path", help="Project path to check")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when out of sync")
    args = parser.parse_args()

    exit_code = check_context_sync(Path(args.project_path).resolve())
    if exit_code != 0 and not args.strict:
        sys.exit(0)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
