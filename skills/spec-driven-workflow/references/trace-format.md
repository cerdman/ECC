# Trace Matrix Format

`trace.md` is **generated** by `scripts/spec-kit/trace.js` — never hand-edit it.
It is the single source of truth for "is every requirement designed, tasked,
implemented, and tested?".

## Structure

```markdown
# Traceability: <Feature Name>

**Feature**: specs/<NNN-slug>/  |  **Generated**: <ISO timestamp>  |  **Source of truth**: spec.md, design.md, tasks.md

## Coverage Summary

| Metric | Count |
|--------|-------|
| Functional requirements (FR) | 7 |
| Design elements (DES) | 9 |
| Tasks (T) | 24 |
| Tasks done | 18 |
| Requirements with tests | 6 / 7 |
| Open coverage gaps | 1 |

## Requirement -> Design -> Tasks -> Tests

| Requirement | Stories | Design | Tasks | Tests | Status |
|-------------|---------|--------|-------|-------|--------|
| FR-001 | US1 | DES-001, DES-004 | T010, T012 | tests/auth/signup.test.ts | done |
| FR-002 | US1 | DES-002 | T013 | tests/auth/validate.test.ts | in-progress |
| FR-003 | US2 | DES-005 | T020 | — | gap: no test |

## Success Criteria

| Criterion | Verified by | Status |
|-----------|-------------|--------|
| SC-001 | tests/perf/load.test.ts | covered |
| SC-002 | — | gap: unverified |

## Coverage Gaps

- FR-003 has tasks but no referencing test (T020).
- DES-007 has no implementing task (orphan design element).
```

## Status Values

- `done` — all referencing tasks checked `[x]` and at least one test references the requirement.
- `in-progress` — some referencing tasks done, or tasks done but no test yet.
- `planned` — design + tasks exist, no task done.
- `gap: <reason>` — a structural hole (orphan requirement/design/task, or missing test).

## Exit Codes (audit gate)

- `0` — no orphan requirements/design/tasks (gaps in tests alone are warnings unless `--strict`).
- `1` — structural orphans exist (requirement without design, design without task, task without requirement) and `--allow-gaps` was not passed.

`trace.js` writes `trace.md` only with `--write`; otherwise it prints the report
to stdout (useful for the analyze/audit phase and CI).
