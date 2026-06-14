<!--
  GENERATED FILE — regenerate with: node scripts/spec-kit/exec-plan.js specs/<NNN-slug> --write
  Describes the optimal multi-tool delivery of tasks.md. Claude is the orchestrator
  and the ONLY filesystem writer; external agents are read-only advisors/reviewers.
-->
# Agent Execution Plan: [FEATURE NAME]

**Feature**: `specs/[###-feature-name]/`  |  **Generated**: [TIMESTAMP]  |  **Tasks**: [N] ([N] parallelizable)

## Lanes

| Lane | Agent | Role | Writes files? |
|------|-------|------|---------------|
| Orchestrator | Claude (this session) | Integrate, refactor, apply all edits | YES (sole writer) |
| Backend prototype | Codex (`scripts/dispatch/codex.sh`) | Backend/logic unified-diff prototype | no |
| Frontend prototype | Gemini / antigravity-cli (`scripts/dispatch/gemini.sh`) | Frontend/UI unified-diff prototype | no |
| Review gate | Codex (`reviewer` role) | Mandatory audit gate before delivery | no |

## Execution Waves

<!-- Each wave is a set of [P] tasks that can run concurrently in worktrees. -->

### Wave 1 — Foundational (must complete first)
| Task | Lane | Worktree |
|------|------|----------|
| T004 | orchestrator | main |

### Wave 2 — User Story 1 (P1, MVP)
| Task | Lane | Worktree |
|------|------|----------|
| T012 | backend (Codex prototype -> Claude applies) | wt-us1 |
| T013 | backend | wt-us1 |

### Wave 3 — User Story 2 (P2) [parallel with later US]
| Task | Lane | Worktree |
|------|------|----------|
| T020 | frontend (Gemini prototype -> Claude applies) | wt-us2 |

## Review Gate

After each wave's edits are applied and self-verified, dispatch the diff to the
Codex `reviewer` role. Blocker findings must be resolved before the wave is
considered done. Record the Codex session id for resume.

## Swarm Wiring

Generate a worktree plan for parallel waves and launch with
`scripts/orchestrate-worktrees.js`; each worker's `launcherCommand` points at
`scripts/dispatch/codex.sh` (backend) or `scripts/dispatch/gemini.sh` (frontend).
Claude integrates the handoff files and applies edits in the parent checkout.

## Notes

- Code sovereignty: external models never write to disk; they return unified diffs.
- Backend decisions follow Codex; frontend/visual decisions follow Gemini.
- After every wave: `trace.js --write`, mark tasks done, `state-sync.js`.
