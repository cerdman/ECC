# Phase Details — Spec-Driven Workflow

Read this file when executing a specific phase. Each entry gives the delegate,
artifact, gate language, and state update. State lives in `specs/<id>/.state.json`
and is mirrored to `ecc2.db` via `scripts/spec-kit/state-sync.js`.

---

## 0. research

**Who:** `deep-research` skill (external/library questions) + `code-explorer` (existing code).

Resolve unknowns before specifying. Spawn parallel, *targeted* research tasks —
one question per task, never "research X in general". Capture decisions
(decision / rationale / alternatives) in `.state.json.research[]`.

*Advance when:* the open questions that would change scope are answered.

---

## 1. constitution

**Who:** user conversation + `architect`.

Create or update `.specify/memory/constitution.md` from the template. Principles
govern every later phase (design runs a Constitution Check against this file).

*Gate:* user ratifies the principles. Record `gate.constitution_ratified` + version.

---

## 2. specify

**Who:** `planner` (fallback: `product-capability` / `intent-driven-development`).

Run `node scripts/spec-kit/feature.js new "<short desc>" --json` to scaffold
`specs/<NNN-slug>/` and copy the spec template. Write `spec.md`: user stories
(`US#` + priorities), functional requirements (`FR-###`), success criteria
(`SC-###`), acceptance scenarios (`US#-AC#`). Focus on WHAT/WHY, not HOW.

Then build the quality checklist at `specs/<id>/checklists/requirements.md` and
validate (max 3 `[NEEDS CLARIFICATION]` markers).

*Advance when:* `spec.md` written, IDs assigned, checklist passes.

---

## 3. clarify — GATE 1

**Who:** conversation with user.

Resolve every `[NEEDS CLARIFICATION]` marker. Ask at most 3 questions
(scope > security > UX > technical) using the option-table format. Update
`spec.md` in place. See `gates.md` Gate 1.

---

## 4. design — GATE 2 (Constitution Check)

**Who:** `architect` / `code-architect` (fallback: `planner`).

Write `design.md` from the template. This single doc absorbs spec-kit's
`plan.md` + `data-model.md` + `contracts/`: technical context, the Constitution
Check, architecture/structure decision, the data model, interface contracts, and
**`DES-###` design elements** each citing the `FR-###`/`SC-###` they satisfy.
Every functional requirement must be covered by at least one design element.

*Advance when:* every FR maps to >=1 DES; Constitution Check passes (Gate 2).

---

## 5. tasks

**Who:** `planner` (reuse the `/plan` task-shape) (fallback: `plan-orchestrate`).

Run `node scripts/spec-kit/prereqs.js --json` to confirm prerequisites, then
write `tasks.md` from the template: Setup -> Foundational -> one phase per user
story (priority order) -> Polish. Each task: `- [ ] T### [P?] [US#] [FR-###|DES-###] Description with exact/file/path`.
Tests are optional unless the constitution mandates TDD (it usually does in ECC).

*Advance when:* every DES/FR is covered by >=1 task; all tasks have IDs + paths.

---

## 6. trace — GATE 3

**Who:** `scripts/spec-kit/trace.js`.

Run `node scripts/spec-kit/trace.js specs/<id> --write`. It generates `trace.md`
and exits non-zero on structural orphans. Resolve orphans (or document accepted
gaps with `--allow-gaps`). See `trace-format.md` + `gates.md` Gate 3.

---

## 6.5 exec-plan *(optional)*

**Who:** `scripts/spec-kit/exec-plan.js`.

Run `node scripts/spec-kit/exec-plan.js specs/<id> --write` to produce
`agent_execution_plan.md`: maps `[P]` groups to lanes (Claude orchestrator/sole
writer, Codex review gate, Gemini/antigravity secondary) and worktrees.

---

## 7. analyze / audit — GATE 4

**Who:** `code-reviewer` + **Codex review gate**.

1. Cross-artifact consistency: `code-reviewer` checks spec/design/tasks for
   contradictions, duplicate IDs, ambiguous requirements.
2. Codex audit: dispatch the artifact set to Codex with the `reviewer` role:
   ```bash
   bash scripts/dispatch/codex.sh <task-file> <handoff-file> <status-file> reviewer
   ```
   Codex must return no blocker findings. Record the session id in `.state.json`.

*Advance when:* both passes are clean. See `gates.md` Gate 4.

---

## 8. confirm — GATE 5 (REQUIRED)

**Who:** the user.

Surface the artifact set and coverage summary; ask for explicit approval (see
`gates.md` Gate 5). On approval set `gate.confirm = "approved"` and `active = true`
in `.state.json`, then `state-sync.js`. **This arms the spec workflow guard.**

---

## 9. implement (sliced)

**Who:** `tdd-guide` / `tdd-workflow` + subagents/swarm (fallback: `/build-fix`).

Run in clean-session slices. The **goal** = approved `spec.md` + `tasks.md`; the
**loop** = `continuous-agent-loop` (`sequential` for ordered stories, `rfc-dag`
for a decomposed DAG) supervised by the `loop-operator` agent (stall/retry,
cost drift, escalation).

Per slice (one user story or one `[P]` group):
1. Pick the next not-done `T###` respecting phase + dependency order.
2. Implement in a fresh session/subagent. For independent `[P]` groups, fan out
   with [scripts/orchestrate-worktrees.js](../../../scripts/orchestrate-worktrees.js) —
   plan JSON `workers[].launcherCommand` -> `scripts/dispatch/codex.sh` (backend)
   or `scripts/dispatch/gemini.sh` (frontend). Claude integrates the handoffs and
   remains the sole filesystem writer in the parent checkout.
3. GateGuard + spec workflow guard enforce that edits map to the active task.
4. After the slice: `trace.js --write`, mark tasks `[x]` in `tasks.md`, run
   `state-sync.js` (also runs automatically every ~15 min via `ecc schedule`).

*Advance when:* slice build is green and its tasks are done in docs + ecc2.

---

## 10. verify — GATE 6

**Who:** `e2e-runner` / `/e2e` (fallback: `verification-loop`).

Run the verification loop and E2E for critical paths. Re-run `trace.js --write`
so `trace.md` reflects test coverage. Close or explicitly accept remaining test
gaps. See `gates.md` Gate 6.
