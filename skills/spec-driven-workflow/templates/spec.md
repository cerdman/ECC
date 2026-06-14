---
uid: "[FEATURE_UID]"
feature: "[###-feature-name]"
status: Draft
---

# Feature Specification: [FEATURE NAME]

**Feature Directory**: `specs/[###-feature-name]/`

**Created**: [DATE]

**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  User stories are PRIORITIZED journeys ordered by importance. Each must be
  INDEPENDENTLY TESTABLE: implementing just one still yields a viable MVP slice.
  Assign priorities (P1, P2, P3...) where P1 is most critical.
  Story headings become IDs: "User Story 1" -> US1. Acceptance scenarios are US#-AC#.
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Value and why it ranks here]

**Independent Test**: [How this can be fully tested on its own]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]   <!-- US1-AC1 -->
2. **Given** [initial state], **When** [action], **Then** [expected outcome]   <!-- US1-AC2 -->

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Value and priority rationale]

**Independent Test**: [How this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]   <!-- US2-AC1 -->

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- What happens when [boundary condition]?
- How does the system handle [error scenario]?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST [specific capability]
- **FR-002**: System MUST [specific capability]
- **FR-003**: Users MUST be able to [key interaction]
- **FR-004**: System MUST [data requirement]
- **FR-005**: System MUST [behavior]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!-- Measurable, technology-agnostic outcomes. -->

- **SC-001**: [Measurable metric, e.g., "Users complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User-satisfaction metric]
- **SC-004**: [Business metric]

## Assumptions

- [Assumption about target users / scope boundaries / data / dependencies]

## Out of Scope

- [Explicitly excluded use cases for this feature]
