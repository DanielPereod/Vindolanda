# Verification record

Validated locally on 2026-09-15.

## Passing checks

- `make verify` with `TEST_DATABASE_URL` set: Go formatting, `go vet`, all Go tests with the race detector, ESLint, four frontend unit tests, strict TypeScript (including dependency declarations) and the Vite production build.
- `make integration`: actual PostgreSQL migrations and API behavior against an isolated database ending in `_test`.
- `make e2e`: four Chromium acceptance workflows:
  1. Login, project and section creation, task priority, persisted creation/editing, completion and restoration.
  2. Labels, dated/timed tasks, independent subtask completion, search, moving and deletion.
  3. Mobile sidebar navigation, modal sizing and Escape dismissal.
  4. Pointer drag-and-drop with persisted ordering after reload and movement into a section.
- `npm audit`: zero reported vulnerabilities after updating Vitest.
- Desktop visual inspection in the in-app browser, including dark-theme contrast and accessible form controls.
- Final source review against an empty baseline using `git diff --no-index`; no whitespace errors were reported. The provided `.git` directory is empty and read-only, so normal repository history/status is unavailable. No commit was created.

## Regression coverage

The API integration workflow checks missing authentication, rejected credentials, HttpOnly/SameSite cookies, cross-origin mutation rejection, no implicit parent completion, project/task cycle rejection, section-project consistency, invalid priorities/dates/times, atomic rollback of invalid label associations, subtree moves/deletion, title search, empty search results, timezone-specific Today/Upcoming queries, allowed upcoming ranges, manual ordering, completion history, settings validation, password-change invalidation, session revocation and logout.

Unit tests also cover spaced ordering, exhausted position intervals, password bounds, token generation, concurrent login throttling and date-only versus timed overdue behavior. Recurrence is outside the implemented MVP and is not claimed as tested.

## Local runtime

The final local application uses the Compose PostgreSQL service with the `mytools_postgres_data` volume, bound to loopback port 55432. API and frontend listen locally on ports 8080 and 5173. The account and application data found in the existing Compose installation were retained. The earlier temporary test container, `personal-life-mvp-db`, was stopped and retained with its test data.

## Boundaries

No production deployment was performed. SMTP/push notifications, recurrence, advanced filters, board/calendar interfaces and future personal-life domains are not implemented in this MVP. The interface is Spanish; project documentation is English. Large-dataset pagination and multi-instance login throttling are future scaling work.

## Resumed workspace verification

Later workspace changes added Docker images, a full Compose stack and a Quick Add parser. These changes were retained. The final resumed `make verify` passed Go formatting, vet and race-enabled unit tests, ESLint, all seven frontend unit tests and the strict TypeScript/Vite production build. PostgreSQL integration tests were skipped in that resumed run because no test database URL was supplied; their earlier successful results are recorded above. The existing Compose API returned a healthy response and the frontend returned HTTP 200 at `http://localhost:5173`.

The four Chromium workflow results above apply to the original MVP snapshot, before the later Quick Add changes. They were not rerun against the existing account or application data. Normal Git status remains unavailable because this workspace does not contain valid repository metadata.

## Notes application — 2026-09-16

- Followed the implementation plan in `docs/notes-plan.md`; initial note/helper tests failed before implementation. A later regression test exposed nonexistent canvas references and passed after transactional validation was added.
- `GOCACHE=/tmp/mytools-go-cache make verify`: Go formatting, vet, race-enabled tests, ESLint, 28 frontend tests, strict TypeScript and production build.
- `make integration` with an isolated `notes_test` PostgreSQL 17 database: passed. Added note/base/canvas persistence, duplicate-title rejection, authenticated access, invalid canvas-reference rejection, task-note persistence, association preservation across partial edits/duplication, rollback on invalid references and explicit unlinking.
- `npx playwright test --config e2e/notes.config.ts`: 3 passed. Covers app navigation, Markdown blocks/source, wiki aliases/backlinks, saved base filters, saved canvas connections/keyboard positioning, task links/deep links, mobile overflow and failed-save draft retention.
- `npx playwright test --config e2e/quick-add.config.ts`: all 6 existing isolated quick-add workflows passed.
- Inspected desktop canvas and mobile note screenshots. Reviewed changes against the pre-edit source snapshot with `git diff --no-index`; whitespace checks passed. Normal Git status is unavailable because this directory has no Git repository.

Browser checks use mocked HTTP responses; the separate integration suite uses actual PostgreSQL. Existing credentialed end-to-end workflows were not run against personal account data. The migration was applied only to the temporary test database. The main application services were not rebuilt or deployed.

The temporary `mytools-notes-test` container was stopped and automatically removed after integration verification. A final browser assertion checks the saved base title after page creation, covering the transition that previously permitted editing the outgoing document.
