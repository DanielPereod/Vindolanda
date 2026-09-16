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

## Knowledge core continuation — 2026-09-16

- `make verify` with a disposable PostgreSQL 17 database: passed Go formatting, vet, race-enabled tests including real integration, ESLint, 35 frontend unit tests, strict TypeScript and the production build.
- `make integration`: passed against loopback port 55439, independently of the existing application database. Knowledge tests use a unique schema and remove that schema after each test.
- `npx playwright test --config e2e/notes.config.ts`: 8 passed. Covers folder assignment, restoration preserving identity, permanent-deletion confirmation, ID-bound rename navigation, keyboard commands, fuzzy switching, server-search requests, concurrent editing/autosave, Base/Canvas persistence, task links and mobile failed saves.
- Database regression tests cover folder cycles, invalid-reference rollback, unresolved-link resolution, safe renames, restore title conflicts, full-text indexing, exclusion of trash, permanent-deletion eligibility, Canvas-reference cleanup and resumable legacy-link indexing.
- Reviewed scoped source diffs against `/tmp/mytools-knowledge-before-60ZDyc`; preserved concurrent navigation, dropdown and board changes. Corrected a migration version collision by assigning note search version 00006. Inspected desktop and mobile screenshots.

Browser tests mock HTTP; the separate Go integration suite exercises real PostgreSQL transactions. The credentialed browser suite and 100,000-note load tests were not run. The build still warns that the main chunk exceeds 500 kB; the Notes workspace now loads as a separate chunk. No compiler or lint checks were disabled.

Migrations were tested only on the disposable database. The running application was not migrated, rebuilt or deployed. The temporary test container is removed after verification; its contents are disposable fixtures.

## Image attachments — 2026-09-16

- Specification and plan: `docs/tasks/attachments-notes-canvas.md` and `.plan.md`.
- Unit tests first: `imageType`/`safeFilename`/`attachmentURL`, `validMediaURL` attachment paths, and the browser helper `imageFiles`/`attachmentMarkdown`/`insertTextAtSelection`/`uploadAttachment` failed before implementation and passed after.
- `make verify`: Go formatting, vet, race-enabled tests, ESLint, 69 frontend unit tests, strict TypeScript and the production build passed.
- `make integration` with the disposable `personal_life_test` database: attachment upload/download, content sniffing, declared-type fallback, rejected text/empty/missing files, and the shared session and trusted-origin policy (401 without a cookie, 403 for an untrusted origin) passed. The `server` package integration test passed when run alone; an earlier parallel run collided on the shared `users_singleton_key` because another process used the same test database.
- `npx playwright test --config e2e/notes.config.ts`: 9 passed, 1 unrelated failure. The failing test is the concurrently added `canvas note cards always render the Markdown live view`; its colour-button click is intercepted because the in-progress `.canvas-node { overflow: hidden }` rule clips the floating toolbar. The attachment code does not touch that rule or the failing path.
- Attachments store bytes in PostgreSQL (`bytea`) and are served from `/api/v1/attachments/{id}/{id}.{ext}` with an allowlisted image content type, `nosniff`, an inline disposition and a private immutable cache header. No filesystem or new service is introduced, and attachments are not garbage-collected with their note or canvas.


## Nutrition module — 2026-09-16

- Plan: `docs/nutrition-plan.md`; contract: `docs/api.md` (Nutrition, Food catalog, Open Food Facts, Diary, Recipes, Weekly plan, Shopping list).
- TDD per slice: `service_test.go` (profile validation and Mifflin-St Jeor targets), `food_test.go`, `openfoodfacts_test.go` (`httptest`), `diary_test.go`, `recipe_test.go`, `plan_test.go`, `shopping_test.go` and `nutrition.test.ts` failed with undefined symbols before each implementation and passed after.
- `make verify`: Go formatting, `go vet`, race-enabled unit tests, ESLint, 70 frontend unit tests, strict TypeScript and the production build passed.
- `make integration` with the disposable `personal_life_test` database: profile round-trip and rollback, auto targets (2345 kcal), food CRUD/search/favorites, Open Food Facts lookup/search/import through an injected stub, diary snapshot scaling, recipe totals and `cook`, plan Monday normalization, copy, templates and idempotent `log`, shopping generation preserving manual lines, and negative cases (unknown ingredient food 422, deleting a food used by a recipe 422, Open Food Facts upstream failure).
- Review follow-up: plan items now drop their derived diary entries when edited, deleted or replaced by a week copy, so re-logging stays idempotent after moving an item; the Open Food Facts response body is bounded to 1 MiB.
- Second review pass: auto targets preserve the stored values while the identity data is incomplete instead of resetting them to zero; the recipe and weekly-plan food selectors search the catalog server-side rather than loading the first 200; the food/recipe scaling helpers were consolidated on one primitive; and plan assembly loads its recipes and foods in batched queries instead of one query per item.
- Open Food Facts is called only through an injected client in tests; the production client sends `OPENFOODFACTS_USER_AGENT`.
- `npx playwright test --config e2e/nutrition.config.ts`: 6 passed. Covers creating a catalog food, the live profile target preview and save, recipe creation with per-serving macros, passing a planned day to the diary, generating the shopping list plus creating a task, and logging a weight with the evolution chart. The suite runs an isolated Vite server on port 5176 and mocks every API response in memory, so it never touches account data.
- No credentialed browser acceptance suite was run for nutrition. The integration suite is the shared `TestMVP` and uses the common test database, so it must not run concurrently with another process using it.

The module is not deployed. Migrations were applied only to the disposable database when `make integration` ran. Body progress (weight and measurements) remains phase 2.

## Image attachment library — 2026-09-16

- Specification and plan: `docs/tasks/attachment-library.md` and `.plan.md`.
- `make verify`: Go formatting, vet, race-enabled tests, ESLint, 75 frontend unit tests, strict TypeScript and the production build passed.
- Integration lifecycle against the isolated test database: list, rename preserving the URL, rename rejection, trash hides the URL (404), trash listing, restore serves bytes again, rejecting restore of an active attachment, rejecting purge of an active attachment, permanent delete and empty trash.
- Real API check against the running database: applied `00016_attachments_trash.sql` (renamed from `00015` after a version collision with the concurrent `00015_shopping.sql`), restarted the API and verified upload, list, rename, trash, 404 while trashed, trash listing, restore, 200 after restore, permanent delete and empty trash end to end with the session cookie.
- The **Adjuntos** page uses `attachmentReferences` to count embeds and warn before trashing a used image; it is covered by unit tests and a manual check.

