# /spec constitution-assistant

Interactive assistant to discover, scaffold, and ratify project constitutions.

## When to Use

- Greenfield repo with no `.specify/memory/constitution.md`
- Adding a technical constitution or path-scoped rules for a subsystem
- Before `/spec design` — ensure Constitution Check has real principles to cite

## Steps

1. **Discover** what exists:
   ```bash
   node scripts/spec-kit/constitution.js list --json
   ```
2. **Interview** the user (3–5 questions): quality bar, testing, security, dependency policy,
   subsystem-specific constraints for the area they are about to change.
3. **Scaffold** missing layers:
   ```bash
   node scripts/spec-kit/constitution.js scaffold repo
   node scripts/spec-kit/constitution.js scaffold technical
   node scripts/spec-kit/constitution.js scaffold path --dir src/<subsystem>
   ```
4. **Fill templates** — replace every `[PLACEHOLDER]`; merge with `AGENTS.md` and `rules/`.
5. **Resolve** for the target path and show the stack:
   ```bash
   node scripts/spec-kit/constitution.js resolve <file-or-dir> --json
   ```
6. **Ratify** — present the stack to the user; record approval in feature `.state.json`
   (`gate.constitution = "pass"`) when working inside an active spec feature.

## Done When

- [ ] Repo constitution exists with no placeholders
- [ ] Technical constitution exists (or user explicitly waived with recorded reason)
- [ ] Path constitutions exist for subsystems that need local rules
- [ ] User has ratified the governing stack
