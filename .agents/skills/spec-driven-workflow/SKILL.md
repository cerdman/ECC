---
name: spec-driven-workflow
description: Kiro-style spec-driven development lane ported from erd-spec-kit. Drives constitution -> spec.md -> design.md -> tasks.md -> trace.md with cross-document unique IDs (FR-, SC-, US, DES-, T###), a research/audit/confirm gate sequence, GateGuard + workflow-guard enforcement during implementation, ecc2 SQLite-backed project state refreshed asynchronously, clean-session slice execution via subagents/swarms, and a generated agent_execution_plan.md for multi-tool delivery (Claude + Codex review gate + Gemini/antigravity). Use for any feature that deserves durable specs, requirement traceability, and gated implementation. Drives the /spec command.
---

# Spec-Driven Workflow (Kiro-style)

A spec-first pipeline. You research, then write a constitution and a chain of
linked documents — `spec.md` -> `design.md` -> `tasks.md` -> `trace.md` — where
**every requirement, design element, and task carries a unique, cross-referenced
ID**. Documents are reviewed and audited, the user confirms, and only then does
implementation begin. During implementation the gatekeeper guard (GateGuard) and
the spec workflow guard keep edits inside the approved plan, project state is
continuously synced to the `ecc2` state store, and tasks are marked done in both
the docs and the database.

| Stage | Phases | AI leverage |
|-------|--------|-------------|
| Research & govern | 0. research, 1. constitution | highest |
| Specify | 2. specify, 3. clarify | highest |
| Design & break down | 4. design, 5. tasks, 6. trace | high |
| Audit & confirm | 7. analyze/audit, 8. confirm **GATE** | high |
| Implement | 9. implement (sliced) | lowest |
| Verify | 10. verify + trace refresh | medium |

## When to Use

- A feature deserves durable, reviewable specs and requirement traceability.
- Work spans multiple sessions/agents and needs gated, state-tracked execution.
- You want a constitution to govern decisions across the whole feature.
- Skip for trivial single-file changes; use `/feature-dev` or `orch-*` instead.
- For lightweight PRD-only pipelines without ID traceability, use `ai-augmented-workflow` (`/workflow`).

## Artifact Layout

Constitution is repo-global; everything else is per-feature under `specs/`:

```text
.specify/memory/constitution.md          # governing principles (repo-global)
specs/<NNN-feature-slug>/
├── spec.md                 # requirements: FR-###, SC-###, US#, US#-AC#
├── design.md               # DES-### elements citing FR-### + data model + contracts
├── tasks.md                # T### [P] [US#] [FR-###|DES-###] + file paths
├── trace.md                # generated matrix: FR <-> DES <-> T <-> tests <-> status
├── agent_execution_plan.md # optimal multi-tool delivery (Claude/Codex/Gemini)
├── checklists/requirements.md
└── .state.json             # phase + gate state mirror (also stored in ecc2.db)
```

**→ Unique ID rules: read `references/id-scheme.md`. Trace matrix format: read `references/trace-format.md`.**

## CLI

All phases are driven by `/spec` (skill is canonical; command is a thin shim) backed by Node scripts under `scripts/spec-kit/`:

```bash
node scripts/spec-kit/feature.js new "user auth" --json     # scaffold specs/<NNN-user-auth>/
node scripts/spec-kit/prereqs.js --json                     # check constitution/spec/design/tasks presence
node scripts/spec-kit/trace.js <feature-dir> --write        # (re)generate trace.md; non-zero exit on orphans
node scripts/spec-kit/exec-plan.js <feature-dir> --write    # generate agent_execution_plan.md
node scripts/spec-kit/slice.js <feature-dir> --json         # next clean-session slice
node scripts/spec-kit/state-sync.js [feature-dir]           # sync docs <-> .state.json <-> ecc2.db
node scripts/spec-kit/register-schedule.js                    # register ~15m ecc schedule job
```

The `session:start:workflow-context` hook surfaces active workflows; `state-sync.js` keeps the ecc2 store current (register the ~15-minute job with `register-schedule.js`, or run it via `ecc schedule` when the daemon is active).

## Phases

Each phase **delegates** to an existing ECC agent/skill — it does not do the work inline.
**→ For full phase instructions, gate language, delegate map, and artifact specs, read `references/phases.md`.**
**→ For the exact gates and their pass conditions, read `references/gates.md`.**

| Phase | Delegate | Advance when... |
|-------|----------|-----------------|
| 0 research | `deep-research` / `code-explorer` | Unknowns resolved; findings captured in `.state.json` research notes |
| 1 constitution | user + `architect` | Principles ratified by the user |
| 2 specify | `planner` | `spec.md` written with FR-/SC-/US IDs; quality checklist passes |
| 3 clarify | conversation | All `[NEEDS CLARIFICATION]` markers resolved (max 3 asked) |
| 4 design | `architect` / `code-architect` | `design.md` covers every FR with DES-### elements |
| 5 tasks | `planner` / `/plan` shape | `tasks.md` covers every DES/FR; each task has IDs + file path |
| 6 trace | `trace.js` | `trace.md` generated; no orphan reqs/tasks (or gaps documented) |
| 7 analyze/audit | `code-reviewer` + **Codex review gate** | Cross-artifact consistency confirmed; Codex audit returns no blockers |
| 8 confirm | **GATE** — user | User explicitly approves the full spec set in writing |
| 9 implement | `tdd-guide` + subagents/swarm | Slice build green; tasks marked done in docs + ecc2 |
| 10 verify | `e2e-runner` / `verification-loop` | Tests pass; `trace.md` refreshed showing test coverage |

## Delegate Map

| Phase | Primary | Fallback |
|-------|---------|----------|
| research | `deep-research` skill / `code-explorer` | `codebase-onboarding` skill |
| constitution | user conversation + `architect` | `product-capability` skill |
| specify | `planner` | `product-capability` / `intent-driven-development` |
| design | `architect`, `code-architect` | `planner` |
| tasks | `planner` / `/plan` | `plan-orchestrate` skill |
| analyze/audit | `code-reviewer` + Codex via `scripts/dispatch/codex.sh` | `security-reviewer` |
| implement | `tdd-guide` / `tdd-workflow` | `/build-fix`, worktree swarm |
| verify | `e2e-runner` / `/e2e` | `verification-loop` skill |

## Guards During Implementation

- **GateGuard** (gatekeeper) — the existing `pre:edit-write:gateguard-fact-force` fact-forcing gate is unchanged and still fires.
- **Spec workflow guard** — `pre:edit-write:spec-workflow-guard` denies implementation edits inside a `specs/`-tracked feature unless: constitution + spec + design + tasks all exist, the phase-8 confirmation gate is approved, and the edit maps to an active (not-yet-done) `T###`. Disable via `ECC_DISABLED_HOOKS=pre:edit-write:spec-workflow-guard` (and the bash variant) or `ECC_SPEC_GUARD=off`.

The guard reads `specs/<id>/.state.json`; it stays inert until you set `gate.confirm = "approved"` (phase 8) and `active = true`, so it never blocks normal repo work outside an approved spec feature.

## Sliced Implementation

Implementation runs in **clean-session slices** (one user story or one `[P]` group per slice) so context stays focused:

1. Pick the next slice: `node scripts/spec-kit/slice.js <feature-dir> --json` (foundational first, then per user story / `[P]` group).
2. Run it in a fresh session/subagent; fan out independent `[P]` groups via the worktree swarm ([scripts/orchestrate-worktrees.js](../../scripts/orchestrate-worktrees.js)) using `launcherCommand` -> `scripts/dispatch/codex.sh`/`gemini.sh`.
3. After the slice: refresh trace (`trace.js`), mark tasks done, run `state-sync.js`.
4. Use `continuous-agent-loop` (pattern `sequential` or `rfc-dag`) with `loop-operator` for stall/retry supervision. The "goal" is the approved `spec.md` + `tasks.md`.

**→ For the loop/goal contract and swarm wiring, read `references/phases.md` (phase 9).**

## Multi-Tool Execution Plan

Phase 6.5 (optional, after tasks) generates `agent_execution_plan.md` via `exec-plan.js`: it maps `[P]` parallel groups to lanes — **Claude** as orchestrator and sole filesystem writer, **Codex** as the mandatory review/audit gate, **Gemini / antigravity-cli** as the frontend/secondary lane — and assigns worktrees. Dispatch uses the ECC-native wrappers in `scripts/dispatch/` (no `ccg-workflow` dependency).

## Examples

Greenfield feature, full chain:
```
/spec constitution Establish principles for code quality, testing, and security
/spec specify Build a photo album organizer with drag-and-drop reordering
/spec clarify
/spec design Use a local SQLite store; vanilla TS frontend
/spec tasks
/spec trace
/spec analyze        # cross-artifact audit + Codex review gate
# user replies "approved"
/spec exec-plan      # optional multi-tool plan
/spec implement      # sliced execution under the guards
```

Resume after a break (state restored from ecc2 + `.state.json`):
```
node scripts/spec-kit/prereqs.js --json
node scripts/spec-kit/trace.js specs/003-photo-album --write
```
