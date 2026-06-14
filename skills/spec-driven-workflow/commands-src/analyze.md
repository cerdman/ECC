# /spec analyze  — GATE 4 (Audit) + GATE 5 (Confirm)

Cross-artifact consistency audit, Codex review gate, then user confirmation.

## Steps

1. Run `node scripts/spec-kit/trace.js <FEATURE_DIR>` (read-only) to confirm coverage.
2. **Consistency pass** (`code-reviewer`): check spec/design/tasks for
   contradictions, duplicate IDs, ambiguous or untestable requirements, and tasks
   that reference non-existent FR/DES ids. Report findings by severity.
3. **Codex review gate (mandatory)**: write the artifact set into a task file and
   dispatch:
   ```bash
   bash scripts/dispatch/codex.sh <task-file> <handoff-file> <status-file> reviewer
   ```
   (On Windows / cross-platform: `node scripts/dispatch/run.js codex <task-file> <handoff-file> <status-file> reviewer`.)
   Read the handoff. Blocker-severity findings MUST be resolved before proceeding.
   Record the Codex `SESSION_ID` in `.state.json` (`gate.audit`).
4. Set `gate.audit = "pass"`.
5. **Confirmation GATE 5**: surface the artifact set + coverage summary + audit
   result and ask the user explicitly:
   > "The spec set is ready at `specs/<id>/`. Coverage: N/N requirements designed,
   > M tasks (K with tests). Audit: [summary]. Reply 'approved' to begin
   > implementation under the workflow guard."
6. On explicit approval: set `gate.confirm = "approved"` and `active = true` in
   `.state.json`, run `state-sync.js`. This arms the spec workflow guard.

## Done When

- [ ] Consistency pass clean; Codex audit returns no blockers
- [ ] User has explicitly approved; `gate.confirm = approved`, `active = true`
