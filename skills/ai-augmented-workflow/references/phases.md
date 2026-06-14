# Phase Details — AI-Augmented Workflow

Read this file when executing a specific phase. Each entry gives the delegate agent, artifact, gate language, and minimum memory note.

---

## 1. requirements

**Who:** conversation with user + `planner` (escalate to `chief-of-staff` for multi-stakeholder scope)

Capture goals, constraints, non-goals, and acceptance criteria. Record every decision with `workflow.js memory` the moment it lands. This phase is never "closed" — re-sync it whenever new requirements emerge mid-pipeline.

*Minimum memory note:* goals, constraints, non-goals, acceptance criteria, stakeholder names.

---

## 2. discovery

**Who:** `code-explorer` (fallback: `codebase-onboarding` skill)

Trace execution paths, integration points, and conventions before proposing anything. Do not design until discovery is complete.

*Artifact:* `.claude/workflows/<id>/discovery.md` (or inline memory if small).

---

## 3. prd — GATE

**Who:** `planner` / `/plan-prd` (escalate to `architect` for system-shaped features)

Produce `.claude/prds/<name>.prd.md` digestible for both technical and non-technical readers.

**Gate — show the user the path and ask explicitly:**
> "I've written the PRD at `.claude/prds/<name>.prd.md`. Does this capture what you need? Reply 'approved' to proceed to technical planning."

Do not run `workflow.js advance` until the user approves. Record the approval quote in memory.

---

## 4. tech-plan

**Who:** `architect`, `code-architect` (fallback: `planner`)

Document architecture, edge cases, and risks. Artifact: `.claude/plans/<name>.plan.md`.

Read the plan critically — rejected approaches and the reasons they were rejected are as valuable as the chosen path. Rubber-stamping is not acceptance.

*Minimum memory note:* architecture decisions, rejected approaches with reasons.

---

## 5. design *(optional — skip with `--no-design`)*

**Who:** `frontend-design-direction` + `design-system` skills (fallback: `ui-demo` skill)

Only when the feature has a UI surface. Use skills so output is on-brand and consistent with the design system. Confirm design intent with the user before advancing.

*Minimum memory note:* design system choices, accessibility constraints.

---

## 6. implement

**Who:** `tdd-guide` / `tdd-workflow` skill (fallback: `build-error-resolver` / `/build-fix`)

Failing test first, then code. Run `/build-fix` on build breaks. Advance only when build is green and acceptance criteria from requirements are passing.

*Minimum memory note:* completed acceptance criteria, any blockers hit.

---

## 7. test

**Who:** `e2e-runner` / `/e2e` (fallback: `verification-loop` skill)

E2E tests for critical paths. `/verify` for the build-lint-test loop. Advance when all verification checks pass.

*Minimum memory note:* test paths covered, anything skipped and why.

---

## 8. review — GATE

**Who:** `code-reviewer` + `security-reviewer` (fallback: language reviewer — `python-reviewer`, `typescript-reviewer`, etc.)

Trigger `security-reviewer` any time a security-adjacent file is touched.

**Gate — surface findings and ask explicitly:**
> "The review found [N] CRITICAL/HIGH findings: [list]. Are you satisfied these are resolved before we commit?"

Do not advance until the user confirms. Record resolved findings in memory.
