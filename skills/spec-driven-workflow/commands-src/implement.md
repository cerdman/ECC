# /spec implement  — sliced execution under guards

Execute `tasks.md` in clean-session slices once the confirmation gate is approved.

## Preconditions

- `.state.json` has `gate.confirm = "approved"` and `active = true`. If not, STOP
  and run `/spec analyze` first. The spec workflow guard will deny edits otherwise.

## Steps

1. Read `tasks.md`. Pick the next slice: `node scripts/spec-kit/slice.js <FEATURE_DIR> --json`.
2. Optionally generate/refresh the multi-tool plan:
   `node scripts/spec-kit/exec-plan.js <FEATURE_DIR> --write`.
3. **Run the slice in a clean session/subagent** (one user story or one `[P]` group):
   - Delegate to `tdd-guide` / `tdd-workflow` (failing test first when TDD applies).
   - For independent `[P]` groups, fan out a worktree swarm via
     `scripts/orchestrate-worktrees.js` with `workers[].launcherCommand` ->
     `scripts/dispatch/codex.sh` (backend) or `scripts/dispatch/gemini.sh` (frontend).
     Claude integrates handoffs and is the sole filesystem writer in the parent checkout.
   - Use `continuous-agent-loop` (`sequential` or `rfc-dag`) with `loop-operator`
     for stall/retry supervision. Goal = approved `spec.md` + `tasks.md`.
4. GateGuard (fact-forcing) and the spec workflow guard enforce that edits map to
   the active task. Keep edits within the task's cited FR/DES scope.
5. **After the slice**:
   - Mark completed tasks `[x]` in `tasks.md`.
   - `node scripts/spec-kit/trace.js <FEATURE_DIR> --write`.
   - `node scripts/spec-kit/state-sync.js <FEATURE_DIR>` (also runs every ~15 min via schedule).
   - The **Stop hook** runs Gate 7 verify automatically; or run manually:
     `node scripts/spec-kit/verify-implementation.js --json`.
   - Run the slice's build/lint/tests; fix regressions before the next slice.
6. Repeat until all tasks are done, then hand off to `/spec` verify (Gate 6).

## Done When

- [ ] All in-scope tasks marked done in `tasks.md` and ecc2
- [ ] Build green; `trace.md` refreshed with test coverage
