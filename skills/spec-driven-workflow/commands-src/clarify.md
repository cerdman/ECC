# /spec clarify  — GATE 1

Resolve underspecified areas in `spec.md` before designing.

## Steps

1. Locate the active feature via `node scripts/spec-kit/prereqs.js --json` (or the
   user-provided feature dir). Read `spec.md`.
2. Extract all `[NEEDS CLARIFICATION: ...]` markers. If more than 3 exist, keep the
   3 highest-impact (scope > security/privacy > UX > technical) and resolve the rest
   with documented assumptions.
3. For each remaining question, present an option table:

   ```markdown
   ## Question N: [Topic]
   **Context**: [quote the relevant spec section]
   **What we need to know**: [the specific question]

   | Option | Answer | Implications |
   |--------|--------|--------------|
   | A | ... | ... |
   | B | ... | ... |
   | Custom | Provide your own | ... |
   ```

4. Present all questions together; wait for the user's choices.
5. Update `spec.md` in place, replacing each marker with the chosen answer; record
   the resolution in a Clarifications subsection.
6. Set `gate.clarify = "resolved"` in `.state.json` and run `state-sync.js`.

## Done When

- [ ] No `[NEEDS CLARIFICATION]` markers remain
- [ ] `gate.clarify` recorded as resolved
