---
description: Guided ECC engineering workflow with two tracks — prd (requirements, discovery, PRD, tech plan, design, implement, test, review) and spec (Kiro/spec-kit: constitution, spec, design, tasks, trace, analyze, confirm, implement, verify) — with persistent multi-workflow state and per-phase memory.
argument-hint: "[start <name> [--track prd|spec] [--no-design] | status [id] | advance [id] | memory <note> | list]"
---

# Workflow Command

`/ecc:workflow` (alias `/workflow`) is the single guided entry for ECC
feature work. It drives a feature through one of two **tracks**, with state
and memory persisted under `.claude/workflows/` so multiple features and
multiple agents can be tracked across sessions:

- **`prd`** (default) — the `ai-augmented-workflow` skill's eight-phase
  pipeline (requirements, discovery, PRD, tech plan, design, implement, test,
  review). Read `skills/ai-augmented-workflow/SKILL.md`.
- **`spec`** — the `spec-driven-workflow` skill's Kiro/spec-kit pipeline
  (research, constitution, specify, clarify, design, tasks, trace, analyze,
  confirm, implement, verify) with cross-document IDs and gated implementation.
  Read `skills/spec-driven-workflow/SKILL.md`. `/spec` is an alias into this track.

Read the relevant skill for phase definitions, agent map, gates, and memory
contract before acting.

## Setup

Resolve the ECC root once, then use the workflow CLI:

```bash
ECC_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}"
node "$ECC_ROOT/scripts/workflow.js" help
```

## Subcommands

Parse `$ARGUMENTS` into one of:

### `start <name> [--track prd|spec] [--no-design] [--description <text>]`

Default track is `prd`. Choose the track from the user's intent: durable
specs with requirement traceability and gated implementation -> `spec`;
PRD-oriented feature with stakeholder docs -> `prd`.

**PRD track (`--track prd`, default):**

1. Create the workflow record:
   `node "$ECC_ROOT/scripts/workflow.js" start "<name>" [--no-design] --json`
2. Begin phase 1 (requirements): ask the user for goals, constraints,
   non-goals, and acceptance criteria. Record each answer with
   `workflow.js memory <id> --phase requirements --note "..."`.
3. Follow the skill's pipeline from there, advancing phases with
   `workflow.js advance <id> --note "<outcome>" [--artifact <path>]` and
   honoring both gates (PRD approval; pre-commit review confirmation).

**Spec track (`--track spec`):**

1. Create the workflow record and scaffold the spec feature in one step:
   `node "$ECC_ROOT/scripts/workflow.js" start "<name>" --track spec --description "<feature description>" --json`
   This creates `specs/<NNN-name>/` (spec.md + .state.json) and links it on
   the workflow record.
2. Read `skills/spec-driven-workflow/SKILL.md` and the matching file under
   `skills/spec-driven-workflow/commands-src/` (constitution, specify, clarify,
   design, tasks, trace, analyze, implement) for each phase's instructions.
3. Drive the artifact chain with `scripts/spec-kit/*` and record each phase
   transition with `workflow.js advance <id>` (this mirrors the current phase
   into the feature's `specs/<id>/.state.json`).
4. The `confirm` gate is the explicit user approval. Implementation edits to
   files governed by `tasks.md` stay blocked by the spec workflow guard until
   the user approves (setting `gate.confirm = "approved"` and `active = true`
   in the feature `.state.json`). Never advance past `confirm` without it.

### `status [id]`

- With an id: `node "$ECC_ROOT/scripts/workflow.js" show <id>` and summarize
  current phase, assigned agents, artifacts, and the next action.
- Without: `node "$ECC_ROOT/scripts/workflow.js" summary --all` and report.

### `advance [id] [note]`

Confirm the current phase's exit criteria are met (per the skill), then
`node "$ECC_ROOT/scripts/workflow.js" advance <id> --note "<outcome>"`.
If only one workflow is active, infer the id from `workflow.js list --json`.
Never advance past a gate phase (prd, review) without explicit user approval.

### `memory <note>`

Append a business-context note to the active workflow:
`node "$ECC_ROOT/scripts/workflow.js" memory <id> --phase <current> --note "<note>"`.

### `list`

`node "$ECC_ROOT/scripts/workflow.js" list --all` and present a compact table
of workflows, statuses, and current phases.

## Rules

- One workflow per feature; keep parallel features in separate workflows.
- When delegating a phase to a subagent, pass the workflow id, the phase, and
  the latest memory entries in the prompt, and record the assignment with
  `set-phase <id> <phase> --agent <agent-name>`.
- If `$ARGUMENTS` is empty, show `workflow.js list` output and ask what to do.
