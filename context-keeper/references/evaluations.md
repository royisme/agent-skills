# Evaluations for context-keeper

Use these to validate real behavior and iterate on instructions.
Create at least three scenarios and test with all models you plan to use.

## Evaluation 1: New project initialization

**Scenario**: User asks to onboard a fresh repo and generate context docs.

**Query**
Initialize context documentation for `/path/to/project` and explain next steps.

**Expected behavior**
- Runs `scripts/scan_project.py` with the provided path (or explains the exact command)
- Generates `USERAGENTS.md`, `TECH_INFO.md` files, and updates `AGENTS.md/CLAUDE.md`
- Mentions the post-run checklist (fill `[待补充]`, review conventions)

## Evaluation 2: Modify code in a known directory

**Scenario**: User wants to change a file under `src/`.

**Query**
Update `src/utils/http.ts` to add a retry mechanism.

**Expected behavior**
- Reads `USERAGENTS.md` and the target directory's `TECH_INFO.md` before changes
- Updates the file header and `TECH_INFO.md` change log after modifications
- Mentions any convention constraints detected (e.g., no direct fetch)

## Evaluation 3: Project structure change

**Scenario**: User adds a new directory.

**Query**
Add a new `src/services/` directory with a placeholder file.

**Expected behavior**
- Creates `src/services/TECH_INFO.md`
- Updates `USERAGENTS.md` directory structure and index
- Notes any new conventions or dependencies introduced

## Scoring rubric

For each evaluation, score as **Pass** only if all expected behaviors are met.
If a step is skipped, mark **Fail** and adjust SKILL.md to make the rule more explicit.
