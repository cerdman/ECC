---
uid: "[FEATURE_UID]"
feature: "[###-feature-name]"
status: Draft
---

# Tasks: [FEATURE NAME]

**Input**: `specs/[###-feature-name]/` (spec.md, design.md required)

**Format**: `- [ ] T### [P?] [US#?] [FR-###|DES-###] Description with exact/file/path`

- **[P]**: parallelizable (different files, no incomplete dependency)
- **[US#]**: which user story (Setup/Foundational/Polish phases omit it)
- **[FR-###|DES-###]**: requirement(s)/design element(s) this task implements (REQUIRED for traceability)
- Tests are OPTIONAL unless the constitution mandates TDD.

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create project structure per design.md
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting

---

## Phase 2: Foundational (Blocking Prerequisites)

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 [DES-001] Setup data store and migrations framework
- [ ] T005 [P] [DES-002] Implement auth/authorization framework
- [ ] T006 [P] Setup API routing and middleware

**Checkpoint**: Foundation ready.

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [What this story delivers]
**Independent Test**: [How to verify it on its own]

### Tests for User Story 1 (if TDD) ⚠️

> Write these tests FIRST and ensure they FAIL before implementation.

- [ ] T010 [P] [US1] [FR-001] Test for [scenario US1-AC1] in tests/...
- [ ] T011 [P] [US1] [FR-002] Integration test for [journey] in tests/...

### Implementation for User Story 1

- [ ] T012 [P] [US1] [FR-001,DES-001] Create [Entity1] model in src/models/[entity1]
- [ ] T013 [US1] [FR-002,DES-002] Implement [Service] in src/services/[service]
- [ ] T014 [US1] [FR-003,DES-003] Implement [endpoint/feature] in src/[location]

**Checkpoint**: User Story 1 fully functional and testable independently.

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [What this story delivers]
**Independent Test**: [How to verify it]

- [ ] T020 [P] [US2] [FR-004,DES-005] Create [Entity] model in src/models/[entity]
- [ ] T021 [US2] [FR-005,DES-006] Implement [Service] in src/services/[service]

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

[Add more user story phases as needed]

## Phase N: Polish & Cross-Cutting Concerns

- [ ] T0NN [P] Documentation updates in docs/
- [ ] T0NN Code cleanup and refactoring
- [ ] T0NN [P] Additional unit tests in tests/unit/
- [ ] T0NN Security hardening

---

## Dependencies & Execution Order

- **Setup (P1)** -> **Foundational (P2, blocks all stories)** -> **User Stories (P3+, parallel if staffed)** -> **Polish**.
- Within a story: tests (if TDD) -> models -> services -> endpoints -> integration.

## Parallel Opportunities

- `[P]` tasks in the same phase touch different files and can run in parallel.
- Once Foundational completes, independent user stories can run in parallel worktrees.

## Implementation Strategy

1. Setup + Foundational.
2. User Story 1 (MVP) -> validate independently -> demo.
3. Add stories incrementally in priority order; each adds value without breaking prior stories.
