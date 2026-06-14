---
name: ai-augmented-workflow
description: Eight-phase AI-augmented software engineering workflow — business requirements, system discovery, dual-audience PRD, technical plan, optional design, implement, test, code review — with persistent multi-workflow state tracking, per-phase agent assignments, and a memory log that carries business context through every layer. Drives the /workflow command. Use for any feature that spans multiple sessions, involves stakeholders, or needs durable pipeline tracking.
origin: ECC
---

# AI-Augmented Engineering Workflow

A feature pipeline that front-loads requirements clarification and planning
(where AI leverage is highest) and keeps implementation lean. Every phase
delegates to an existing ECC agent or command and writes its business context
into a per-workflow memory store so nothing is lost between sessions or handoffs.

| Stage | Time spent | Impact | Phases |
|-------|-----------|--------|--------|
| Requirements Clarification | 25% | highest | 1. requirements, 2. discovery |
| Planning | 35% | high | 3. prd, 4. tech-plan, 5. design (optional) |
| Implementation | 15% | lowest | 6. implement |
| Review | 25% | medium | 7. test, 8. review |

## When to Use

- Feature involves stakeholders or non-technical readers and deserves a PRD, not just a task list
- Work spans multiple sessions or agents and needs durable state tracking
- Multiple features running in parallel — each gets its own workflow record
- Skip for trivial or single-file changes; use `orch-*` or `/feature-dev` instead

## Setup

```bash
ECC_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}"
if [ ! -f "$ECC_ROOT/scripts/workflow.js" ]; then
  echo "workflow.js not found — set CLAUDE_PLUGIN_ROOT or install ECC to ~/.claude" >&2
  exit 1
fi
```

If `workflow.js` is not found, track phase state manually in `.claude/workflows/<name>/state.md`.

## State and CLI

State lives in `.claude/workflows/<workflow-id>/` (project-local):
- `state.json` — phases, statuses, agent assignments, artifacts, timestamps
- `memory.md` — append-only memory log; the business context layer

```bash
node "$ECC_ROOT/scripts/workflow.js" start "dark mode toggle" --description "..."
node "$ECC_ROOT/scripts/workflow.js" list
node "$ECC_ROOT/scripts/workflow.js" show <id>
node "$ECC_ROOT/scripts/workflow.js" advance <id> --artifact .claude/prds/dark-mode.prd.md --note "PRD approved"
node "$ECC_ROOT/scripts/workflow.js" set-phase <id> implement --agent tdd-guide --status active
node "$ECC_ROOT/scripts/workflow.js" memory <id> --phase requirements --note "Budget caps 3rd-party providers"
```

The `session:start:workflow-context` hook injects a bounded summary of active workflows at session start.

## Phases

Each phase **delegates** — it does not do the work inline.
**→ For full phase instructions, gate language, and artifact specs, read `references/phases.md`.**

**Phase exit criteria:**

| Phase | Advance when... |
|-------|----------------|
| requirements | User confirms goals, constraints, non-goals, and acceptance criteria |
| discovery | Code-explorer has mapped the subsystem and documented integration points |
| prd | **GATE** — user explicitly approves the PRD in writing |
| tech-plan | Lead engineer reads and accepts the plan |
| design | User confirms design intent *(skip with `--no-design`)* |
| implement | Build is green, acceptance criteria from requirements are passing |
| test | E2E tests cover critical paths, all verification checks pass |
| review | **GATE** — user confirms CRITICAL/HIGH findings resolved |

## Agent Map

| Phase | Primary | Fallback |
|-------|---------|----------|
| requirements | user conversation + `planner` | `chief-of-staff` |
| discovery | `code-explorer` | `codebase-onboarding` skill |
| prd | `planner` / `/plan-prd` | `architect` |
| tech-plan | `architect`, `code-architect` | `planner` |
| design | `frontend-design-direction` + `design-system` skills | `ui-demo` skill |
| implement | `tdd-guide` / `tdd-workflow` skill | `/build-fix` |
| test | `e2e-runner` / `/e2e` | `verification-loop` skill |
| review | `code-reviewer` + `security-reviewer` | language reviewer |

## Memory Contract

**→ For write timing, per-phase minimums, and mid-phase resume, read `references/memory.md`.**

Quick reference — minimum note per phase:

| Phase | Record |
|-------|--------|
| requirements | Goals, non-goals, constraints, acceptance criteria, stakeholder names |
| discovery | Affected files/modules, integration points, surprising conventions |
| prd | PRD artifact link, approval quote from the user |
| tech-plan | Architecture decisions, rejected approaches with reasons |
| design | Design system choices, accessibility constraints |
| implement | Completed acceptance criteria, blockers hit |
| test | Test paths covered, anything skipped and why |
| review | Findings resolved, accepted risks |

## Examples

Start a UI feature:
```
/workflow start dark mode toggle
/workflow memory wf-20260611-dark-mode-toggle --phase requirements --note "Must respect OS preference; no new deps"
/workflow advance wf-20260611-dark-mode-toggle --note "Requirements agreed with stakeholder"
```

Two features in parallel:
```
/workflow start rate limiting --no-design
/workflow list
# wf-...-rate-limiting — active, current: requirements
# wf-...-dark-mode-toggle — active, current: implement
```

Resume after a break (SessionStart hook already injected the digest):
```
## Active ECC workflows
- dark mode toggle [wf-20260611-dark-mode-toggle] — 5/8 phases; current: implement (tdd-guide)
  last note: "Plan approved; ThemeProvider approach"
```
