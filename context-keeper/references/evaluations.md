# Evaluations for context-keeper

Use these to validate real behavior and iterate on instructions.
Create at least three scenarios and test with all models you plan to use.

## Evaluation 1: New project initialization

**Scenario**: User asks to onboard a fresh repo and generate context docs.

**Query**
Initialize context documentation for `/path/to/project` and explain next steps.

**Expected behavior**
- Runs `scripts/scan_project.py` with the provided path (or explains the exact command)
- Generates `USERAGENTS.md` with project structure and coding conventions
- Updates `AGENTS.md/CLAUDE.md` with enforcement instructions
- **Does NOT** pre-generate TECH_INFO.md files for all directories
- Explains that TECH_INFO.md will be created on-demand when working in each directory
- Mentions optional hooks for automatic tracking and enforcement

## Evaluation 2: Modify code in a directory without TECH_INFO.md

**Scenario**: User wants to change a file under `src/utils/`, but TECH_INFO.md doesn't exist yet.

**Query**
Update `src/utils/http.ts` to add a retry mechanism.

**Expected behavior**
- Reads `USERAGENTS.md` to understand project conventions
- Notices that `src/utils/TECH_INFO.md` does not exist
- Creates `src/utils/TECH_INFO.md` on-demand using the template
- Analyzes the code files in `src/utils/` to fill in accurate descriptions
- Updates `src/utils/http.ts` with the retry mechanism
- Updates the file header (`@description`, `@lastModified`)
- Updates `src/utils/TECH_INFO.md` file inventory and change log

## Evaluation 3: Session end with pending documentation updates (Hook behavior)

**Scenario**: User has modified multiple files across different directories, then ends the session. Hooks are installed.

**Query**
[Session ends, Stop hook is triggered]

**Expected behavior**
- `stop.sh` hook reads `.context-keeper/pending.txt`
- Displays a clear, grouped list of modified files by directory
- Shows mandatory action items:
  - Create/update TECH_INFO.md for each affected directory
  - Update file headers for each modified file
  - Fill in descriptions based on actual code changes
- If `--strict` mode is enabled, blocks completion until docs are updated
- AI responds by updating all required documentation

## Evaluation 4: Adding a new feature with new directory

**Scenario**: User adds a new feature directory and files.

**Query**
Create a new `src/services/payment-gateway/` directory with a `PaymentProcessor.ts` file that processes Stripe payments.

**Expected behavior**
- Creates the new directory structure
- Creates `src/services/payment-gateway/TECH_INFO.md` on-demand
- Directory purpose is inferred as "Payment Gateway module" (from path semantics)
- Fills in file description for `PaymentProcessor.ts` based on the code
- Updates file header with accurate description
- If project structure changes significantly, updates `USERAGENTS.md`

## Evaluation 5: Working with multiple skills (distraction test)

**Scenario**: User uses multiple skills (e.g., context-keeper, auto-browser, database-migration) during a session.

**Query**
[Complex task involving multiple tools and skills]

**Expected behavior**
- PostToolUse hook tracks ALL file modifications regardless of which skill caused them
- When session ends, Stop hook displays the consolidated list of all modified files
- AI is forced to update documentation before completing, even though it was using multiple skills
- Context-keeper's requirements are NOT forgotten or overshadowed by other skills

## Scoring rubric

For each evaluation, score as **Pass** only if all expected behaviors are met.
If a step is skipped, mark **Fail** and adjust SKILL.md or hook scripts to make the rule more explicit.

### Key success criteria

1. **On-demand generation**: TECH_INFO.md should only be created when AI actually works in a directory
2. **AI-filled descriptions**: Descriptions should be accurate and based on code analysis, not "[待补充]" placeholders
3. **Hook reliability**: Stop hook should consistently catch all modifications and display clear, actionable tasks
4. **Multi-skill resilience**: Documentation requirements should not be forgotten when using other skills
5. **English content**: All generated documentation should be in English
6. **No depth limitation**: Should work with arbitrarily deep directory structures

### Test models recommended

- **Claude 3 Haiku**: For baseline compliance testing
- **Claude 3 Sonnet**: For realistic day-to-day usage
- **Claude 3 Opus**: For complex edge cases and detailed analysis

Run each evaluation scenario multiple times to ensure consistency.