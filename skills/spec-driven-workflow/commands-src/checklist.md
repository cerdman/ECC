# /spec checklist

Generate a custom quality checklist ("unit tests for English") for the spec set.

## Steps

1. Locate the feature dir (`prereqs.js --json`).
2. Copy `skills/spec-driven-workflow/templates/checklist.md` to a new file under
   `specs/<id>/checklists/<domain>.md` (e.g. `requirements.md`, `security.md`,
   `ux.md`) based on $ARGUMENTS (the domain to validate).
3. Tailor checklist items to the requested domain — each item must be a binary,
   verifiable assertion about the spec/design (clarity, completeness, consistency),
   not about implementation.
4. Run the checklist against the artifacts; mark pass/fail with quoted evidence.
5. Report failing items and the spec updates needed.

## Done When

- [ ] Domain checklist created under `specs/<id>/checklists/`
- [ ] Checklist evaluated with evidence; failures listed
