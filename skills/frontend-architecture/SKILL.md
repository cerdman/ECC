---
name: frontend-architecture
description: Opinionated frontend architecture policy layer for React + Vite applications. Defines stack boundaries, validation-first edges, transform-once data flow, state ownership, accessibility, and links to specialized ECC frontend skills.
origin: ECC
version: 1.0.0
---

# Frontend Architecture

Top-level frontend policy layer for modern React applications.

Use this skill as the **canonical architectural contract** for frontend work, then link outward to specialized implementation skills for React internals, performance, accessibility, Vite, and design-system concerns.

## When to Activate

- Designing a new frontend or major frontend feature
- Establishing team-wide frontend conventions
- Reviewing PRs that span components, state, data flow, forms, or routing
- Refactoring inconsistent UI architecture into a coherent system
- Deciding where validation, transformation, persistence, and shared state should live
- Defining boundaries between routing, client state, server state, forms, styling, and visualization

## Canonical Stack Boundaries

Use one primary tool per concern. Do not blur responsibilities.

| Concern | Standard | Permitted Scope |
|---|---|---|
| Runtime / Build | React, Vite, TypeScript, ESM | UI composition, rendering, bundling, developer experience |
| Routing | React Router | Route definitions, route-level loading, navigation |
| Client State | Redux Toolkit | Cross-component workflows, session state, global client orchestration |
| Server State | RTK Query | API queries, mutations, cache invalidation, request lifecycle |
| Forms | React Hook Form | Form state, submit lifecycle, field registration |
| Validation | Zod | Runtime boundary validation, schema-derived types |
| Styling | Tailwind CSS | Layout and visuals only |
| Visualization | D3 / SVG | Complex scales, chart math, interaction primitives |
| Testing | Vitest, React Testing Library | Behavior, integration, and accessibility-oriented component tests |

## Core Architectural Invariants

### 1. Validate Early at Boundaries

Treat all external input as `unknown` until validated:

- API payloads
- form submissions
- localStorage / IndexedDB
- URL params and search params
- postMessage payloads
- third-party widget data

Validate immediately at the edge with Zod.
Derive TypeScript types from schemas with `z.infer<typeof Schema>` so runtime contracts and compile-time types cannot drift.

```ts
import { z } from 'zod'

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'member']),
})

export type User = z.infer<typeof UserSchema>

export function parseUser(input: unknown): User {
  return UserSchema.parse(input)
}
```

### 2. Transform Once

Backend transport details must not leak into components.

Normalize payload shape exactly once in an adapter/service layer:

- convert `snake_case` to frontend naming conventions
- flatten or reshape nested transport objects
- normalize nullish fields
- convert transport enums into explicit domain unions

Components should render domain-shaped data, not transport-shaped data.

```ts
const ApiUserSchema = z.object({
  user_id: z.string(),
  display_name: z.string().nullable(),
})

const UserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
})

type User = z.infer<typeof UserSchema>

export function adaptUser(input: unknown): User {
  const parsed = ApiUserSchema.parse(input)
  return UserSchema.parse({
    id: parsed.user_id,
    displayName: parsed.display_name ?? 'Unknown user',
  })
}
```

### 3. State Has a Single Owner

Use the smallest valid state scope.

- **Component state**: transient toggles, focus, open/closed UI, temporary input state
- **Redux Toolkit**: workflow orchestration, session state, global client-only coordination
- **RTK Query**: server-backed cached state and mutations
- **Persistence**: browser storage is untrusted input and must be validated on read

Do not manually duplicate RTK Query server state into Redux slices unless there is a deliberate derived-state reason.

### 4. Persistence is Untrusted and Bounded

All browser persistence must follow:

1. read
2. parse safely
3. validate
4. fallback on failure
5. cap size / count / TTL

Unbounded histories and caches are correctness and performance bugs.

```ts
const RecentItemSchema = z.object({ id: z.string(), viewedAt: z.number() })
const RecentItemsSchema = z.array(RecentItemSchema).max(50)

export function loadRecentItems(): z.infer<typeof RecentItemsSchema> {
  try {
    const raw = localStorage.getItem('recent-items')
    if (!raw) return []
    return RecentItemsSchema.parse(JSON.parse(raw))
  } catch {
    return []
  }
}
```

## Component and UI Design Rules

### Explicit Domain Modeling

Avoid:

- `any`
- loose `object`
- stringly typed status fields without unions
- generic dictionaries when a model exists
- boolean prop soup

Prefer discriminated unions and explicit variants.

```ts
type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }
```

```tsx
// Bad
<Button isPrimary isDanger />

// Good
<Button variant="danger" />
```

### Render Flow

Use early returns to simplify branches:

- loading
- error
- empty
- unauthorized
- missing prerequisites

```tsx
if (isLoading) return <Spinner />
if (error) return <ErrorView message={error.message} />
if (!items.length) return <EmptyState />

return <ItemList items={items} />
```

### Hooks Must Be Intentional

Custom hooks should encapsulate a coherent behavior, not become junk drawers.

Good examples:

- debouncing
- focus restoration
- escape key handling
- media query / reduced motion
- persisted preference loading

### Memoization is Earned

Do not cargo-cult `useMemo` or `useCallback`.
Use them only for:

- expensive computation
- referential stability required by a child or dependency chain
- measured render hot paths

## Forms and Validation

### Form Rules

- Define explicit typed initial values
- Prefer React Hook Form for non-trivial forms
- Use Zod for schema validation
- Disable invalid submission states before submit when possible
- Convert raw validation failures into stable UI display models

```ts
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

type LoginValues = z.infer<typeof LoginSchema>

export const INITIAL_LOGIN_VALUES: LoginValues = {
  email: '',
  password: '',
}
```

Do not rely on post-submit exception catching as the primary validation strategy.

## Routing and Data Loading

React Router owns navigation and route boundaries.

Use route-level loading for route concerns, but keep business normalization and domain adaptation outside route components when the logic is reusable.

Route modules may fetch or coordinate, but UI components should still receive validated, normalized data.

## Styling and Visual Systems

Tailwind CSS owns layout and presentation.

Do not encode domain logic in class computation blobs.
Avoid style-driven branching that hides business rules inside presentation code.

For design consistency, align with the design-system skill rather than inventing one-off spacing, typography, or visual semantics per feature.

## Visualization Rules

D3 and SVG are for math, scales, and rendering primitives — not for hidden normalization.

Visualization pipelines must:

- handle partial data
- handle empty arrays
- handle skipped stages
- fail visibly but safely
- keep normalization out of render-time SVG expression soup

Heavy charts and visualization libraries should be lazy-loaded off the critical path.

## Accessibility Baseline

Accessibility is mandatory, not a finishing pass.

Require at minimum:

- full keyboard navigation
- escape-to-close for modals and overlays
- focus restoration
- semantic interactive elements
- `aria-live` for async updates
- reduced-motion respect where appropriate

Use the dedicated accessibility skill for implementation detail and checklist depth.

## Performance Baseline

Default performance rules:

- lazy-load heavy routes, admin panels, charts, and bulky third-party libraries
- avoid unnecessary client-side duplication of server state
- avoid barrel imports in performance-sensitive apps
- memoize only when justified
- keep initial route bundles small
- isolate expensive rendering from frequently changing parent state

Use the React performance skill for deeper rules on waterfalls, bundle size, hydration, and render cascades.

## Testing Expectations

Frontend testing should emphasize behavior over implementation detail.

Use:

- **Vitest** for fast unit and integration execution
- **React Testing Library** for user-facing behavior
- accessibility assertions where interaction is non-trivial

Test:

- happy path
- error states
- loading states
- empty states
- keyboard behavior
- focus behavior for dialogs and overlays
- schema and adapter edge cases

Do not overfit tests to implementation internals such as hook call counts or private component structure.

## Naming and File Conventions

- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Redux slices: `featureSlice.ts`
- Variables and functions: `camelCase`
- Types and components: `PascalCase`
- Constants: `UPPER_CASE`

## Failure Modes to Prevent

Watch for these recurrent frontend failures:

- silent error swallowing in data flows
- transport shapes leaking into components
- duplicated server state in client stores
- unbounded local persistence
- boolean prop soup
- D3 normalization hidden in render logic
- route bundles bloated by unnecessary eager imports
- accessibility added too late to shape the interaction model correctly

## How This Skill Relates to Other ECC Skills

This is the **policy layer**. Use it first, then apply specialized skills:

- **React patterns** for component composition, hooks discipline, Suspense, and state placement
- **React performance** for waterfalls, code splitting, render cascades, and hydration optimization
- **Frontend accessibility** for semantic HTML, keyboard support, ARIA patterns, and focus management
- **Vite patterns** for build/runtime tooling, env handling, plugin choices, and bundling constraints
- **Design system** for token consistency, visual audits, and shared UI language

## Related Skills

- `react-patterns`
- `react-performance`
- `frontend-a11y`
- `vite-patterns`
- `design-system`
- `frontend-patterns`
- `react-testing`
- `accessibility`

## See Also

- Skill: `skills/react-patterns/SKILL.md`
- Skill: `skills/react-performance/SKILL.md`
- Skill: `skills/frontend-a11y/SKILL.md`
- Skill: `skills/vite-patterns/SKILL.md`
- Skill: `skills/design-system/SKILL.md`
- Skill: `skills/frontend-patterns/SKILL.md`
