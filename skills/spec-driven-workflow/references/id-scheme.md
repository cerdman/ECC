# Unique ID Scheme

Every traceable item across the spec chain carries a stable, unique ID. IDs are
the backbone of `trace.md` and the spec workflow guard. Never renumber an
existing ID once work has started — append new ones instead.

## ID Types

| Prefix | Lives in | Means | Example |
|--------|----------|-------|---------|
| `FR-###` | `spec.md` | Functional requirement | `FR-001` |
| `SC-###` | `spec.md` | Success criterion (measurable, tech-agnostic) | `SC-002` |
| `US#` | `spec.md` | User story / prioritized journey | `US1` (Priority P1) |
| `US#-AC#` | `spec.md` | Acceptance scenario inside a user story | `US1-AC2` |
| `DES-###` | `design.md` | Design element / decision / contract | `DES-004` |
| `T###` | `tasks.md` | Implementation task | `T012` |

## Numbering Rules

- Three-digit zero-padded sequence per type, scoped to the feature directory
  (`FR-001`, `FR-002`, ... restart per feature). Cross-feature uniqueness comes
  from the feature directory prefix (`specs/003-user-auth/`).
- User stories use a single digit and a priority: `### User Story 1 - Title (Priority: P1)` => `US1`.
- Acceptance scenarios are numbered within their story: the 2nd scenario of US1 is `US1-AC2`.
- Tasks are sequential in execution order across all phases (`T001`...`T0NN`).
- If a feature needs globally unique IDs (e.g. shared across repos), append a
  uuid suffix in the doc front matter `uid:` field; the numbered IDs remain the
  human-facing handle. `feature.js new` records a feature `uid` in `.state.json`.

## Cross-Reference Rules

- Each `DES-###` element **must cite** at least one `FR-###` (or `SC-###`) it satisfies, e.g. `DES-004 (FR-001, FR-003)`.
- Each `T###` task **must cite** its story and the requirement/design it implements: `- [ ] T012 [P] [US1] [FR-001,DES-004] Create User model in src/models/user.ts`.
- Tests reference the IDs they cover in the test name or a trailing comment, e.g. `test("FR-001 user can sign up", ...)` or `// covers: FR-001, T012`.

## How trace.js Reads Them

`scripts/spec-kit/trace.js` parses these patterns:

- Requirements: lines matching `\bFR-\d{3}\b`, `\bSC-\d{3}\b` in `spec.md`.
- Stories: headings matching `User Story (\d+)` -> `US<n>`.
- Design: `\bDES-\d{3}\b` in `design.md`, plus any `FR-###`/`SC-###` cited on the same line.
- Tasks: checklist lines in `tasks.md` -> `T###`, completion state from `[ ]`/`[x]`, plus cited `US#`, `FR-###`, `DES-###`.
- Tests: scans `tests/**`, `test/**`, `**/*.test.*`, `**/*_test.*`, `**/*.spec.*` for any `FR-###`/`SC-###`/`T###`/`DES-###` tokens.

A requirement with no design element, a design element with no task, or a task
with no requirement is an **orphan** and is reported as a coverage gap (non-zero
exit unless `--allow-gaps`).
