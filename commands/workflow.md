---
description: Run the AI-augmented engineering workflow — requirements, discovery, PRD, tech plan, design, implement, test, review — with persistent multi-workflow state and per-phase memory.
argument-hint: "[start <name> [--no-design] | status [id] | advance [id] | memory <note> | list]"
---

# Workflow Command

Drive a feature through the `ai-augmented-workflow` skill's seven-step
pipeline, with state and memory persisted under `.claude/workflows/` so
multiple features and multiple agents can be tracked across sessions.

Read `skills/ai-augmented-workflow/SKILL.md` for the phase definitions, agent
map, gates, and memory contract before acting.

## Setup

Resolve the ECC root once, then use the workflow CLI:

```bash
ECC_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}"
node "$ECC_ROOT/scripts/workflow.js" help
```

## Subcommands

Parse `$ARGUMENTS` into one of:

### `start <name> [--no-design] [--description <text>]`

1. Create the workflow record:
   `node "$ECC_ROOT/scripts/workflow.js" start "<name>" [--no-design] --json`
2. Begin phase 1 (requirements): ask the user for goals, constraints,
   non-goals, and acceptance criteria. Record each answer with
   `workflow.js memory <id> --phase requirements --note "..."`.
3. Follow the skill's pipeline from there, advancing phases with
   `workflow.js advance <id> --note "<outcome>" [--artifact <path>]` and
   honoring both gates (PRD approval; pre-commit review confirmation).

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
