# /spec tasks

Generate an actionable, dependency-ordered `tasks.md` from the design.

## Steps

1. `node scripts/spec-kit/prereqs.js --json` to confirm `spec.md` + `design.md` exist.
2. Read `spec.md` (user stories + priorities, FR/SC) and `design.md` (DES elements,
   data model, contracts).
3. Copy `skills/spec-driven-workflow/templates/tasks.md` to `FEATURE_DIR/tasks.md`.
4. Generate tasks organized by user story:
   - Phase 1 Setup -> Phase 2 Foundational (blocking) -> Phase 3+ one phase per
     user story in priority order -> final Polish phase.
   - Every task: `- [ ] T### [P?] [US#?] [FR-###|DES-###] Description with exact/file/path`.
   - Include test tasks first (failing) when the constitution mandates TDD.
   - Mark `[P]` only for tasks on different files with no incomplete dependency.
   - **Every DES-### and FR-### must be covered by at least one task.**
5. Add Dependencies, Parallel Opportunities, and Implementation Strategy sections.
6. Report total task count, per-story counts, parallel opportunities, MVP scope.

## Done When

- [ ] `tasks.md` generated; every task has an id, requirement/design ref, and file path
- [ ] Every DES/FR is covered by >=1 task
