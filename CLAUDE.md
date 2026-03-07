# CLAUDE.md

## Repository Context
- This repository contains multiple Claude Code plugins under `plugins/`.
- Each plugin has its own manifest at `plugins/<plugin-name>/.claude-plugin/plugin.json`.

## Push Guardrail
- Before every `git push`, check whether any modified plugin requires a version bump.
- If a change affects a plugin’s shipped behavior, commands, hooks, agents, skills, manifest, or user-visible functionality, update that plugin’s `version` field before pushing.
- Do not push plugin changes without checking the corresponding version first.

## Version Locations
- `selfwork` → `plugins/selfwork/.claude-plugin/plugin.json`

## Workflow
- When changes touch files under `plugins/<plugin-name>/`, inspect `plugins/<plugin-name>/.claude-plugin/plugin.json` before push.
- If uncertain whether a change warrants a version bump, stop and ask before pushing.
