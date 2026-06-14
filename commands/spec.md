---
description: Kiro-style spec-driven workflow — constitution, spec, design, tasks, trace, audit, and gated sliced implementation with ecc2-backed state.
argument-hint: "[constitution|constitution-assistant|specify|clarify|design|tasks|trace|analyze|checklist|implement|exec-plan] [args]"
---

# Spec Command

Drive a feature through the `spec-driven-workflow` skill's artifact chain:
`constitution` -> `spec.md` -> `design.md` -> `tasks.md` -> `trace.md`, with
cross-document IDs (FR-/SC-/US/DES-/T###), audit/confirm gates, GateGuard +
spec workflow guard during implementation, and ecc2-backed state sync.

Read `skills/spec-driven-workflow/SKILL.md` and the matching file under
`skills/spec-driven-workflow/commands-src/` before acting.

## Setup

```bash
ECC_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}"
# Scripts also resolve from the git repo root when run in-project:
node scripts/spec-kit/prereqs.js --json
```

## Subcommands

Parse `$ARGUMENTS` into one of:

### `constitution [principles...]`

Follow `commands-src/constitution.md`. Write or update `.specify/memory/constitution.md`.

### `constitution-assistant`

Follow `commands-src/constitution-assistant.md`. Discover/scaffold/ratify repo,
technical, and path-scoped constitutions:
`node scripts/spec-kit/constitution.js list|resolve|scaffold ...`

### `specify <short description>`

Follow `commands-src/specify.md`. Run:
`node scripts/spec-kit/feature.js new "<description>" --json` then fill `spec.md`.

### `clarify`

Follow `commands-src/clarify.md`. Resolve `[NEEDS CLARIFICATION]` markers in `spec.md`.

### `design`

Follow `commands-src/design.md`. Write `design.md` with DES-### elements citing FR-.

### `tasks`

Follow `commands-src/tasks.md`. Write `tasks.md` with T### refs to FR/DES and file paths.

### `trace`

Follow `commands-src/trace.md`. Run:
`node scripts/spec-kit/trace.js <FEATURE_DIR> --write`

### `analyze`

Follow `commands-src/analyze.md`. Cross-artifact audit + Codex review gate + user confirmation.

### `checklist`

Follow `commands-src/checklist.md`. Generate requirements checklist under `checklists/`.

### `exec-plan`

Generate multi-tool delivery plan:
`node scripts/spec-kit/exec-plan.js <FEATURE_DIR> --write`

### `implement`

Follow `commands-src/implement.md`. Sliced execution under guards; next slice:
`node scripts/spec-kit/slice.js <FEATURE_DIR> --json`

## State & Schedule

- Sync state: `node scripts/spec-kit/state-sync.js [feature-dir]`
- Register ~15m async sync: `node scripts/spec-kit/register-schedule.js`
- Mark tasks done: update `tasks.md` checkboxes and `.state.json` `completedTasks`, then `state-sync.js`

## Guards

Implementation edits to files cited in `tasks.md` are denied until
`gate.confirm = "approved"` and `active = true` in the feature `.state.json`.
Disable with `ECC_SPEC_GUARD=off` if needed.

After each implementation turn, `stop:spec-implementation-verify` runs independent
constitution + test + Codex checks (Gate 7). Disable with `ECC_SPEC_VERIFY=off`.
