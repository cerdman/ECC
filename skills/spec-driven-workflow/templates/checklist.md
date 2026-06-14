# Specification Quality Checklist: [FEATURE NAME]

**Purpose**: Validate specification completeness and quality before planning.
**Created**: [DATE]  |  **Feature**: [./../spec.md](../spec.md)

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] Written for non-technical stakeholders
- [ ] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous
- [ ] Each FR has a unique FR-### id
- [ ] Success criteria are measurable and technology-agnostic (SC-###)
- [ ] All acceptance scenarios are defined (US#-AC#)
- [ ] Edge cases are identified
- [ ] Scope is clearly bounded (Out of Scope section)
- [ ] Dependencies and assumptions identified

## Feature Readiness

- [ ] All functional requirements have clear acceptance criteria
- [ ] User scenarios cover primary flows
- [ ] Feature meets measurable outcomes in Success Criteria
- [ ] No implementation details leak into the specification

## Notes

- Items left unchecked require spec updates before `/spec clarify` or `/spec design`.
