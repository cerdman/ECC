# /spec specify

Create the feature specification from a natural-language description ($ARGUMENTS).

## Steps

1. **Scaffold**: run `node scripts/spec-kit/feature.js new "<short description>" --json`.
   It generates a `NNN-slug` directory under `specs/`, copies the spec template to
   `spec.md`, writes `.state.json` (with a feature `uid`), and prints
   `FEATURE_DIR`, `SPEC_FILE`, `FEATURE_ID`.
2. **Load context**: read `.specify/memory/constitution.md` if it exists.
3. **Write `spec.md`** from the template, focusing on WHAT/WHY (no tech stack):
   - User stories `US#` with priorities (P1, P2, ...) and `US#-AC#` acceptance scenarios.
   - Functional requirements `FR-###` (testable, unambiguous).
   - Success criteria `SC-###` (measurable, technology-agnostic).
   - Key entities, assumptions, out-of-scope.
   - Mark at most 3 critical unknowns with `[NEEDS CLARIFICATION: ...]`; make
     informed defaults for the rest and record them under Assumptions.
4. **Quality checklist**: create `specs/<id>/checklists/requirements.md` from the
   checklist template and validate the spec against it (max 3 iterations).
5. Report `FEATURE_DIR`, `SPEC_FILE`, checklist results, and whether `/spec clarify`
   is needed (open NEEDS CLARIFICATION markers) or you can proceed to `/spec design`.

## Done When

- [ ] `spec.md` written with FR-/SC-/US ids and the template structure preserved
- [ ] Quality checklist created and validated
- [ ] Next phase recommended (clarify vs design)
