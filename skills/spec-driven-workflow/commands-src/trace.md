# /spec trace  — GATE 3 (Coverage)

Generate `trace.md` and enforce coverage.

## Steps

1. Run `node scripts/spec-kit/trace.js <FEATURE_DIR> --write`.
2. Review the report:
   - Structural orphans (FR without DES, DES without T, T without FR/DES) -> exit 1.
   - Test gaps -> warnings (becomes a gate failure with `--strict`).
3. Resolve orphans by updating `spec.md` / `design.md` / `tasks.md`, then re-run.
   If a gap is intentionally accepted, document it and re-run with `--allow-gaps`.
4. Set `gate.trace = "pass"` (record any accepted gaps) in `.state.json`; `state-sync.js`.

## Done When

- [ ] `trace.md` generated and committed to the feature dir
- [ ] No structural orphans (or accepted + documented)
