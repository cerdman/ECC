# /spec design  — GATE 2 (Constitution Check)

Produce `design.md` (technical design + data model + contracts in one Kiro doc).

## Steps

1. `node scripts/spec-kit/prereqs.js --json` to confirm `spec.md` exists and locate `FEATURE_DIR`.
2. Read `spec.md` and `.specify/memory/constitution.md`. Copy
   `skills/spec-driven-workflow/templates/design.md` to `FEATURE_DIR/design.md` if absent.
3. Delegate the technical design to `architect` / `code-architect`. Resolve any
   remaining NEEDS CLARIFICATION via targeted research (`deep-research`).
4. Fill `design.md`:
   - Technical Context, Architecture & Structure Decision.
   - **Design Elements**: `DES-###` each citing the `FR-###`/`SC-###` it satisfies.
     Every functional requirement MUST be covered by >=1 design element.
   - Data Model (entities, fields, relationships, validation, state).
   - Interface Contracts (APIs/CLI/events the feature exposes; skip if internal).
   - Quickstart / validation scenarios.
5. **Constitution Check (GATE 2)**: evaluate each principle. Justify any violation
   in Complexity Tracking or change the design. ERROR on unjustified violations.
6. Set `gate.constitution = "pass"` in `.state.json`; run `state-sync.js`.

## Done When

- [ ] `design.md` covers every FR with a DES element citing it
- [ ] Constitution Check passes (violations justified)
