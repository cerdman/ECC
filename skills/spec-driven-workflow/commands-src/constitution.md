# /spec constitution

Create or update the repo-global governing principles at `.specify/memory/constitution.md`.

## Steps

1. If `.specify/memory/constitution.md` does not exist, copy the template from
   `skills/spec-driven-workflow/templates/constitution.md`.
2. Derive 3-7 concrete principles from the user's input ($ARGUMENTS) and the
   existing ECC rules (`AGENTS.md`, `rules/`). Favor testability, security,
   immutability, and simplicity. Replace every `[PLACEHOLDER]`.
3. Fill the Development Workflow section to reflect the spec-driven gates.
4. Set Version (semver), Ratified, and Last Amended dates.
5. Present the principles to the user and ask them to ratify. Record ratification
   in `specs`-level state only after explicit approval (this is the constitution gate).

## Done When

- [ ] `.specify/memory/constitution.md` written with no remaining placeholders
- [ ] User has ratified the principles
