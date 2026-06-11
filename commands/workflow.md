---
description: Run the AI-augmented engineering workflow — requirements, discovery, PRD, tech plan, design, implement, test, review — with persistent multi-workflow state, per-phase memory, and dispatch to external harness workers.
argument-hint: "[start <name> [--no-design] | status [id] | advance [id] | memory <note> | dispatch [phase] | ingest | list]"
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

Gate phases (prd, review) are denied by the CLI until you supply
`--approve --note "User approved: '<verbatim quote>'"`. Get that approval
from the user first — quote their actual words; never fabricate or
paraphrase approval, and never advance a gate on your own judgement.

### `dispatch [phase] [--harness <h>]... [--execute]`

Fan the phase out to external harness workers (codex, cursor, gemini,
opencode, claude) in isolated git worktrees + tmux panes:

1. Dry-run first and show the user the plan:
   `node "$ECC_ROOT/scripts/workflow.js" dispatch <id> --phase <phase> --harness <h> --json`
2. Only launch with `--execute` after the user confirms — it creates
   worktrees, branches, and a tmux session on their machine.
3. The generated task.md already carries workflow memory and the GateGuard
   protocol; do not strip either.

### `ingest [--session <name>]`

`node "$ECC_ROOT/scripts/workflow.js" ingest <id>` after workers finish —
their handoff summaries land in workflow memory and phase artifacts. Read
the handoff files and report findings to the user; ingesting is not approval.

### `memory <note>`

Append a business-context note to the active workflow:
`node "$ECC_ROOT/scripts/workflow.js" memory <id> --phase <current> --note "<note>"`.

### `list`

`node "$ECC_ROOT/scripts/workflow.js" list --all` and present a compact table
of workflows, statuses, and current phases.

## Rules

- One workflow per feature; keep parallel features in separate workflows.
- Respect GateGuard: when the fact-forcing hook denies an Edit/Write or
  destructive Bash, present the facts it demands (importers, affected API,
  data schemas, verbatim instruction) and retry — never bypass it with
  `ECC_GATEGUARD=off` or `ECC_DISABLED_HOOKS`.
- When delegating a phase to a subagent, pass the workflow id, the phase, and
  the latest memory entries in the prompt, and record the assignment with
  `set-phase <id> <phase> --agent <agent-name>`.
- If `$ARGUMENTS` is empty, show `workflow.js list` output and ask what to do.
