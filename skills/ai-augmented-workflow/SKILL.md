---
name: ai-augmented-workflow
description: Seven-step AI-augmented software engineering workflow — business requirements, system discovery, dual-audience PRD, technical plan plus design, implement, test, code review — with persistent multi-workflow state tracking, per-phase agent assignments, and a memory log that carries business context through every layer. Drives the /workflow command.
origin: ECC
---

# AI-Augmented Engineering Workflow

A feature pipeline that front-loads requirements clarification and planning
(where AI leverage is highest) and keeps implementation lean. Every phase
delegates to an existing ECC agent or command, and every phase writes its
business context into a per-workflow memory store so nothing is lost between
sessions, compactions, or agent handoffs.

Effort is deliberately weighted by impact, not by code volume:

| Stage | Time spent | Impact | Phases |
|-------|-----------|--------|--------|
| Requirements Clarification | 25% | highest | 1. requirements, 2. discovery |
| Planning | 35% | high | 3. prd, 4a. tech-plan, 4b. design |
| Implementation | 15% | lowest | 5. implement |
| Review | 25% | medium | 6. test, 7. review |

## When to Use

- Building a feature that involves stakeholders or non-technical readers and
  deserves a PRD, not just a task list.
- Work that spans multiple sessions or multiple agents and needs durable
  state tracking (`/workflow status` shows where every feature stands).
- Running several features in parallel — each gets its own workflow record
  under `.claude/workflows/<id>/`.
- Skip it for trivial or single-file changes; use the `orch-*` family or
  `/feature-dev` directly instead.

## How It Works

State lives in `.claude/workflows/<workflow-id>/` (project-local):

- `state.json` — phases, statuses, agent assignments, artifacts, timestamps.
- `memory.md` — append-only memory log; the business context layer.

Manage it with the CLI (`ECC_ROOT` resolves to the plugin root):

```bash
node "$ECC_ROOT/scripts/workflow.js" start "dark mode toggle" --description "..."
node "$ECC_ROOT/scripts/workflow.js" list
node "$ECC_ROOT/scripts/workflow.js" show <id>
node "$ECC_ROOT/scripts/workflow.js" advance <id> --artifact .claude/prds/dark-mode.prd.md --note "PRD approved"
node "$ECC_ROOT/scripts/workflow.js" set-phase <id> implement --agent tdd-guide --status active
node "$ECC_ROOT/scripts/workflow.js" memory <id> --phase requirements --note "Budget caps 3rd-party providers"
node "$ECC_ROOT/scripts/workflow.js" dispatch <id> --phase implement --harness codex --execute
node "$ECC_ROOT/scripts/workflow.js" ingest <id>
```

The `session:start:workflow-context` hook injects a bounded summary of active
workflows at session start, so a fresh session resumes with full pipeline
context automatically.

### The phases

Each phase delegates — it does not do the work inline.

1. **requirements — Define high-level business requirements** (stakeholders + engineer).
   Capture goals, constraints, and assumptions from the user/stakeholders.
   Working assumptions: nothing is impossible; third-party providers cost
   money. Record every decision with `workflow.js memory`. Re-sync this phase
   whenever new requirements emerge — it is never "closed".
2. **discovery — Understand how the current system works** (engineer).
   Delegate to `code-explorer` to trace execution paths, integration points,
   and conventions before proposing anything.
3. **prd — Create a plan (PRD)** (engineer). Delegate to `planner` (or
   `/plan-prd`) to produce `.claude/prds/<name>.prd.md`, digestible for both
   technical and non-technical readers. → **GATE: user approves the PRD
   before any technical planning or code.** The CLI enforces this: `advance`
   on a gate phase is denied until you pass
   `--approve --note "User approved: '<verbatim quote>'"`.
4. **tech-plan — Create technical implementation plan** (engineer). Delegate
   to `architect` / `code-architect`: architecture, edge cases, risks.
   Artifact: `.claude/plans/<name>.plan.md`. Intentional learning, mentorship,
   and judgement happen here — read the plan, don't rubber-stamp it.
5. **design — Wireframes / mockups / components** (design engineer,
   *optional*). Only when the feature has a UI surface; start with
   `--no-design` otherwise. Use the `frontend-design-direction` and
   `design-system` skills so output is on-brand and a joy to interact with.
   Taste is developed here.
6. **implement — Implement** (engineer). Delegate to `tdd-guide` (or the
   `tdd-workflow` skill). As the codebase grows, swap implement/test in favor
   of strict TDD: failing test first, then code. `/build-fix` on build breaks.
7. **test — Test changes** (engineer). `e2e-runner` / `/e2e` for end-to-end
   verification, `/verify` for the build-lint-test loop.
8. **review — Code review** (engineer). `code-reviewer` plus
   `security-reviewer` when a security trigger is touched. → **GATE: resolve
   CRITICAL/HIGH findings and confirm with the user before commit/merge.**
   Then the feature is finished.

### Agent map

| Phase | Primary | Fallback / escalation |
|-------|---------|----------------------|
| requirements | conversation with user + `planner` | `chief-of-staff` for multi-stakeholder scope |
| discovery | `code-explorer` | `codebase-onboarding` skill |
| prd | `planner` / `/plan-prd` | `architect` for system-shaped features |
| tech-plan | `architect`, `code-architect` | `planner` |
| design | `frontend-design-direction` + `design-system` skills | `ui-demo` skill |
| implement | `tdd-guide` / `tdd-workflow` skill | `build-error-resolver` / `/build-fix` |
| test | `e2e-runner` / `/e2e` | `verification-loop` skill |
| review | `code-reviewer` + `security-reviewer` | language reviewer (`python-reviewer`, ...) |

### Memory contract (context at every layer)

- End of **every** phase: `workflow.js advance <id> --note "<one-line outcome>"`
  (the transition itself is recorded to memory automatically).
- During a phase: record decisions, constraints, and stakeholder answers with
  `workflow.js memory <id> --phase <phase> --note "..."` the moment they land.
- When spawning a subagent for a phase: include the workflow's memory log and
  current phase in its prompt, and record the assignment with
  `set-phase <id> <phase> --agent <name>` so state shows who is doing what.
- Artifacts (PRD, plan, mockups, PR link) are attached with `--artifact` so
  the next phase — or the next session — can find them without searching.

### Multi-workflow tracking

Run one workflow per feature. `workflow.js list` shows all active pipelines,
`summary` emits the bounded digest the SessionStart hook injects. Parallel
agents working different features stay isolated because each workflow has its
own state directory and memory log.

### GateGuard (deny → present facts → retry)

The workflow honors GateGuard at two levels — never disable either
(`ECC_GATEGUARD=off` is for setup/repair sessions only, with user consent):

- **Tool level** — the `gateguard-fact-force` hook denies the first
  Edit/Write per file and destructive Bash. Respond by presenting the facts
  it demands (importers via Grep, affected public API, data schemas with
  redacted values, the user's instruction verbatim), then retry the action.
  Do not pre-answer the gate or self-evaluate around it.
- **Workflow level** — `advance` on a gate phase (prd, review) is denied
  until you present the same kind of evidence: the phase artifact recorded
  via `--artifact`, plus `--approve --note "User approved: '<verbatim
  quote>'"`. Approval without the quoted evidence is rejected.

### Dispatching external harness workers (swarm mode)

Any phase can be fanned out to external CLI agents running in isolated git
worktrees inside a tmux session, reusing ECC's tmux-worktree orchestrator:

```bash
# Dry-run first: shows worktrees, branches, and launcher commands
node "$ECC_ROOT/scripts/workflow.js" dispatch <id> --phase implement --harness codex
# Launch for real (requires tmux + the harness CLI on PATH)
node "$ECC_ROOT/scripts/workflow.js" dispatch <id> --phase implement --harness codex --harness gemini --execute
# Pull worker handoffs back into workflow memory + phase artifacts
node "$ECC_ROOT/scripts/workflow.js" ingest <id>
```

Built-in launchers: `claude`, `codex` (via `orchestrate-codex-worker.sh`),
`cursor` (`cursor-agent`), `gemini`, `opencode`. Other CLIs (e.g. Antigravity)
work via `--launcher "<template>"` with `{task_file_sh}` / `{handoff_file_sh}`
/ `{status_file_sh}` placeholders. Each worker's generated `task.md` carries
the phase objective, the workflow memory tail, the GateGuard protocol, and
the report-back command — so external workers inherit both the business
context and the fact-forcing discipline. After ingesting, review handoffs
yourself before advancing: dispatch parallelizes work, it does not bypass
gates.

## Examples

Start a UI feature and walk the full pipeline:

```
/workflow start dark mode toggle
# phase 1-2: clarify requirements with the user, send code-explorer through the theming code
/workflow memory wf-20260611-dark-mode-toggle --phase requirements --note "Must respect OS preference; no new deps"
/workflow advance wf-20260611-dark-mode-toggle --note "Requirements agreed with stakeholder"
# ... PRD via planner, gate with the user, advance with --artifact .claude/prds/dark-mode-toggle.prd.md
```

Backend-only change, two features in flight:

```
/workflow start rate limiting --no-design
/workflow list
wf-20260611-rate-limiting — rate limiting (active, current: requirements)
wf-20260611-dark-mode-toggle — dark mode toggle (active, current: implement)
```

Resume after a break — the SessionStart hook already injected:

```
## Active ECC workflows
- dark mode toggle [wf-20260611-dark-mode-toggle] — 5/8 phases done; current: implement (Implementation; agents: tdd-guide); last note: "Plan approved; ThemeProvider approach"
Run /workflow status for details, /workflow advance to move to the next phase.
```
