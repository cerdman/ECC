# Memory Contract — AI-Augmented Workflow

The memory log is the connective tissue across sessions. Without it a resumed session starts cold and repeats work.

## When to Write

| Trigger | Command |
|---------|---------|
| End of every phase | `workflow.js advance <id> --note "<one-line outcome>"` |
| Decision or constraint lands during a phase | `workflow.js memory <id> --phase <phase> --note "..."` |
| Subagent spawned for a phase | Record assignment: `workflow.js set-phase <id> <phase> --agent <name>` |
| Artifact produced (PRD, plan, mockup, PR) | Attach with `--artifact <path>` so the next session finds it |

Include the workflow's memory log in every subagent prompt — it is the context handoff.

## Minimum Note Content per Phase

| Phase | What to record |
|-------|----------------|
| requirements | Goals, non-goals, constraints, acceptance criteria, stakeholder names |
| discovery | Affected files/modules, integration points, surprising conventions |
| prd | Link to PRD artifact, approval quote from the user |
| tech-plan | Architecture decisions, rejected approaches with reasons |
| design | Design system choices, accessibility constraints |
| implement | Completed acceptance criteria, blockers hit |
| test | Test paths covered, anything skipped and why |
| review | Findings resolved, any accepted risks |

## Resuming Mid-Phase

If a session ends while a phase is in progress:

1. Run `workflow.js show <id>` — current phase, agent assignment, and last memory entries are shown.
2. The `session:start:workflow-context` hook has already injected a bounded summary into context.
3. Re-read the artifact for the current phase (PRD, plan, etc.) and continue from where it left off.
4. If the assigned agent is unknown, check `state.json` for the `agent` field on the current phase.

## Multi-Workflow Tracking

Run one workflow per feature. `workflow.js list` shows all active pipelines. Parallel agents working different features stay isolated because each workflow has its own state directory and memory log.

`workflow.js summary` emits a compact digest — this is what the SessionStart hook injects at the top of a new session.
