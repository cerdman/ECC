# Gates

The spec-driven workflow has hard gates. A gate must pass (and, where noted, the
user must explicitly approve) before the next phase begins. Gate state is stored
in `specs/<id>/.state.json` under `gate` and mirrored to `ecc2.db`.

## Gate 1 — Clarify (phase 3)

All `[NEEDS CLARIFICATION]` markers in `spec.md` are resolved. Ask at most 3
questions, prioritized scope > security/privacy > UX > technical. Do not proceed
to design with open critical markers.

State: `gate.clarify = "resolved"`.

## Gate 2 — Constitution Check (phase 4, inside design)

`design.md` includes a Constitution Check section evaluated against
`.specify/memory/constitution.md`. Any violation must be justified in the
Complexity Tracking table or the design must change. ERROR on unjustified
violations.

State: `gate.constitution = "pass"`.

## Gate 3 — Trace / Coverage (phase 6)

`trace.js` exits 0: no orphan requirements (FR without DES), no orphan design
(DES without T), no orphan tasks (T without FR/DES). Test gaps are warnings here.

State: `gate.trace = "pass"` (with recorded gap list if any).

## Gate 4 — Audit (phase 7)

Two-part:
1. `code-reviewer` cross-artifact consistency pass (no contradictions between
   spec, design, tasks).
2. **Codex review gate** — dispatch the artifacts to Codex via
   `scripts/dispatch/codex.sh` with the `reviewer` role. Codex must return no
   blocker-severity findings. This is a mandatory gate, not advisory.

State: `gate.audit = "pass"` with the Codex session id recorded.

## Gate 5 — User Confirmation (phase 8) — REQUIRED

Surface the full artifact set and ask explicitly:

> "The spec set is ready at `specs/<id>/`: spec.md, design.md, tasks.md, trace.md
> (coverage: N/N requirements designed, M tasks, K with tests). The audit found
> [summary]. Reply 'approved' to begin implementation under the workflow guard."

Do not set `active = true` or begin implementation until the user replies with
explicit approval. Record the approval quote.

State: `gate.confirm = "approved"`, `active = true`. **This is what arms the spec
workflow guard** — until it is set, the guard stays inert and never blocks edits.

## Gate 6 — Verify (phase 10)

Build green, tests pass, `trace.md` refreshed showing test coverage for the
implemented requirements. Outstanding test gaps must be either closed or
explicitly accepted by the user.

State: `gate.verify = "pass"`.

## Disabling

The workflow guard honors `ECC_SPEC_GUARD=off` and
`ECC_DISABLED_HOOKS=pre:edit-write:spec-workflow-guard,pre:bash:spec-workflow-guard`.
GateGuard is independent and unaffected.
