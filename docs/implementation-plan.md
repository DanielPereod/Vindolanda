# Personal Life MVP implementation plan

## Scope and acceptance

Deliver the 20 MVP capabilities in the supplied specification, together with account settings, session revocation, project hierarchy and archiving. The API and React client are separate applications connected over versioned HTTP/JSON. Do not implement training, recurrence, reminders, advanced filters, board or calendar views in this iteration.

## Decisions

- Go modular monolith, chi routing, pgx PostgreSQL repositories and Goose migrations. Keep SQL explicit and parameterized within each domain; generated queries can be introduced when contracts stabilize.
- React, strict TypeScript, Vite, TanStack Query, React Router and dnd-kit. No global UI state library until necessary.
- One provisioned account, no signup. Hashed passwords, opaque hashed session tokens, HttpOnly/SameSite cookies, configurable Secure flag, origin checks for mutations and login throttling.
- PostgreSQL constraints plus transactional domain validation enforce hierarchy and section consistency. Serialize structural mutations with a transaction advisory lock for this single-user application.
- Inbox means a null project. Moving a parent moves its subtree; completing a child never completes its parent. Deleting a task removes its subtree after explicit UI confirmation. Deleting a project preserves tasks in Inbox and detaches child projects. Removing a section preserves its tasks.
- Store date-only scheduling as DATE and local clock time as TIME. Store instants as TIMESTAMPTZ. Today and Upcoming use the account timezone, including midnight boundaries. A date-only task becomes overdue the following day.
- Use fractional, widely spaced numeric positions, with local sibling rebalance when precision is exhausted.

## Sequence and validation

1. Write failing API integration and browser acceptance tests.
2. Add migrations, bootstrap CLI, sessions and settings.
3. Implement project, section, label and task modules, search and computed views.
4. Implement responsive frontend and accessible task editing, hierarchy and drag-and-drop.
5. Run `make verify` (format, vet, race-enabled Go tests, TypeScript, ESLint, frontend build). Run `make integration` against an isolated PostgreSQL database and `make e2e` against the running stack.
6. Inspect all changes, document setup and contracts, and report actual verification outcomes.

## Plan validation

The scope covers every numbered MVP acceptance criterion. Later planning features remain outside the MVP. No production deployment or credentials are required. No existing source files or verification command were present at inspection. The workspace has an empty read-only `.git` directory rather than a valid Git checkout; final review must use file inspection unless repository metadata becomes available.
