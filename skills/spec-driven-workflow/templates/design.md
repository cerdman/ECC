---
uid: "[FEATURE_UID]"
feature: "[###-feature-name]"
status: Draft
---

# Design: [FEATURE NAME]

**Feature**: `specs/[###-feature-name]/`  |  **Date**: [DATE]  |  **Spec**: [./spec.md](./spec.md)

> This document absorbs the spec-kit `plan.md` + `data-model.md` + `contracts/`
> into one Kiro-style design. Every functional requirement (`FR-###`) from
> `spec.md` MUST be covered by at least one design element (`DES-###`).

## Summary

[Primary requirement + chosen technical approach, in 2-4 sentences]

## Technical Context

**Language/Version**: [e.g., TypeScript 5.x / Python 3.11 or NEEDS CLARIFICATION]
**Primary Dependencies**: [frameworks/libraries or NEEDS CLARIFICATION]
**Storage**: [e.g., PostgreSQL, SQLite, files or N/A]
**Testing**: [e.g., vitest, pytest or NEEDS CLARIFICATION]
**Target Platform**: [e.g., Linux server, browser, iOS or NEEDS CLARIFICATION]
**Project Type**: [single / web / mobile / library / cli]
**Performance Goals**: [domain-specific or NEEDS CLARIFICATION]
**Constraints**: [e.g., <200ms p95, offline-capable or NEEDS CLARIFICATION]
**Scale/Scope**: [e.g., 10k users, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE 2: Must pass before tasks. Re-check after design changes.*

[Evaluate each constitution principle against this design. List PASS / violation.]

| Principle | Status | Notes |
|-----------|--------|-------|
| [Principle I] | PASS | |
| [Principle II] | VIOLATION | see Complexity Tracking |

## Architecture & Structure Decision

[Describe the chosen layout and the real directories it maps to. Remove option labels.]

```text
src/
├── models/
├── services/
└── ...
tests/
├── unit/
├── integration/
└── ...
```

## Design Elements

<!-- Each element cites the FR-/SC- it satisfies. trace.js reads "DES-### (FR-001, FR-003)". -->

- **DES-001** (FR-001): [Decision / component / approach]
- **DES-002** (FR-002): [Decision / component / approach]
- **DES-003** (FR-003, SC-001): [Decision / component / approach]

## Data Model

<!-- Entities from spec.md Key Entities, with fields, relationships, validation, state. -->

### [Entity 1]  <!-- DES-### -->

- Fields: [name: type, ...]
- Relationships: [...]
- Validation: [rules derived from requirements]
- State transitions: [if applicable]

## Interface Contracts

<!-- APIs / CLI schemas / endpoints / events the feature exposes. Skip if purely internal. -->

- **DES-### [Contract name]** (FR-###): [request/response or signature, error modes]

## Quickstart / Validation

[Runnable validation scenarios that prove the feature works end-to-end. Reference
contracts and data model rather than duplicating them. No full implementation code.]

## Complexity Tracking

> Fill ONLY if the Constitution Check has violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| [e.g., extra service] | [current need] | [why simpler approach insufficient] |
