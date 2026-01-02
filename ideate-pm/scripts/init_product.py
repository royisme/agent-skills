#!/usr/bin/env python3

"""Initialize repo-scoped product requirements storage.

This skill assumes one product per repo. This script initializes:

- SQLite database: product/memory.sqlite (inside the skill folder)
- Views: product/views/{PRODUCT.md,BACKLOG.md,OPEN_QUESTIONS.md}

This is a v1 scaffold: it creates the schema and minimal views. More advanced
view compilation, question generation, and graph/fts layers can be added later.
"""

import argparse
import sqlite3
from pathlib import Path

from compile_views import compile_views


def _ensure_schema(cur: sqlite3.Cursor) -> None:
    cur.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS requirement (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          req_id TEXT UNIQUE,
          title TEXT,
          description TEXT,
          status TEXT DEFAULT 'PROPOSED',
          priority TEXT DEFAULT 'P2',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS acceptance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          requirement_id INTEGER,
          text TEXT,
          type TEXT DEFAULT 'CHECKLIST',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS decision (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope_type TEXT,
          scope_ref TEXT,
          question TEXT,
          choice TEXT,
          rationale TEXT,
          confidence REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS open_question (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope_type TEXT,
          scope_ref TEXT,
          question TEXT,
          severity TEXT DEFAULT 'medium',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_by_decision_id INTEGER
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS entity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT,
          name TEXT,
          payload_json TEXT
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS edge (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          src_entity_id INTEGER,
          rel TEXT,
          dst_entity_id INTEGER,
          evidence_ref TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize repo-scoped product storage")
    parser.add_argument("--title", required=True, help="Product name")
    parser.add_argument("--vision", default="", help="Optional product vision")
    args = parser.parse_args()

    skill_root = Path(__file__).resolve().parents[1]
    base_dir = skill_root / "product"
    views_dir = base_dir / "views"
    db_path = base_dir / "memory.sqlite"
    views_dir.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    _ensure_schema(cur)
    cur.execute("INSERT OR REPLACE INTO meta(key, value) VALUES('title', ?);", (args.title,))
    cur.execute("INSERT OR REPLACE INTO meta(key, value) VALUES('vision', ?);", (args.vision,))
    conn.commit()
    conn.close()

    compile_views(db_path=db_path, views_dir=views_dir)
    print("Initialized repo-scoped product storage at product/")


if __name__ == "__main__":
    main()
