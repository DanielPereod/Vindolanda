# Personal Life

A single-user personal task manager with a modular Go API, PostgreSQL persistence and a separate React frontend. This repository implements the 20-item MVP from the supplied Personal Life specification.

## Included

- Cookie login, persistent and revocable sessions, logout and password changes.
- Projects, nested projects, sections, archiving and favorites.
- Tasks and subtasks; edit, delete, complete, restore, duplicate, move and manually reorder.
- Four priorities, scheduled dates and times, global labels and Markdown descriptions.
- Inbox, Today with overdue tasks, Upcoming (7/14/30 days), completed tasks and global search.
- Responsive list interface, pointer/keyboard drag-and-drop, explicit move controls, Quick Add (`Q`) with Todoist-style syntax, search (`Ctrl/Cmd+K`) and modal dismissal (`Esc`).
- Account timezone, date/time format, appearance and default sort settings.

Recurrence, deadlines, duration, reminders, saved filter expressions and board/calendar views belong to subsequent phases. Training and other future domains are intentionally not implemented.

## Requirements

Go 1.26+, Node.js 22.12+ (or Node 24), npm and PostgreSQL 17. Docker Compose is provided for local PostgreSQL. The React dependencies are locked to versions compatible with dnd-kit, with strict TypeScript and library checks enabled.

## Local setup

The complete local stack can be built and started with Docker Compose. It includes PostgreSQL, the API, the migration job and the production frontend:

```bash
cp .env.example .env
docker compose up -d --build
```

Open [Personal Life locally](http://localhost:5173). To create the first account, run the one-time provisioning command with a password supplied only through the shell. The password must contain 12–72 bytes.

In Bash:

```bash
read -rsp 'Initial password (12–72 bytes): ' INITIAL_PASSWORD
echo
docker compose run --rm -e INITIAL_PASSWORD="$INITIAL_PASSWORD" api provision
unset INITIAL_PASSWORD
```

In Fish:

```fish
read --silent --prompt-str='Initial password (12–72 bytes): ' INITIAL_PASSWORD
docker compose run --rm -e INITIAL_PASSWORD="$INITIAL_PASSWORD" api provision
set --erase INITIAL_PASSWORD
```

For development with live Vite reload, stop the Compose API and web services before starting the manual processes. Keep PostgreSQL running so both approaches use the same persistent data.

```bash
docker compose stop api web
docker compose up -d --wait postgres
# Create .env from .env.example only if it does not already exist.
set -a
source .env
set +a
cd api && go mod download && cd ..
npm ci --prefix web
make migrate
read -rsp 'Initial password (12–72 bytes): ' INITIAL_PASSWORD
export INITIAL_PASSWORD
make provision
unset INITIAL_PASSWORD
```

Provisioning creates the only account. Running it again fails without replacing the existing account or password. There is no signup endpoint. The example database password is for loopback-only local development.

Start the API and web app in separate terminals, loading `.env` in the API terminal:

```bash
make dev-api
make dev-web
```

Open [Personal Life locally](http://localhost:5173). Use `localhost` consistently: the trusted browser origin defaults to `http://localhost:5173`. Vite proxies `/api` to the Go server at `127.0.0.1:8080`. `GET /health` checks database connectivity.

For HTTPS hosting later, set `APP_ORIGIN` to the exact public origin, retain the default `COOKIE_SECURE=true`, serve the frontend with SPA fallback and route `/api` to the API. No production deployment is included.

## Verification

```bash
make verify
```

This runs Go formatting checks, `go vet`, race-enabled Go tests, ESLint, frontend unit tests, strict TypeScript and the production frontend build. Integration tests are skipped unless `TEST_DATABASE_URL` is set.

Create a separate disposable database whose name ends in `_test`:

```bash
docker compose exec postgres createdb -U postgres personal_life_test
export TEST_DATABASE_URL='postgres://postgres:local-development-only@127.0.0.1:55432/personal_life_test?sslmode=disable'
make integration
```

The integration suite migrates that database and truncates only its test tables. Never point it at application data. It covers the full API workflow, cycles, subtree movement/deletion, transaction rollback, search, timezone-based views, manual ordering, history, CSRF rejection and session invalidation.

For browser tests, run a separate local API/frontend instance against a disposable database, provision `owner` with password `browser-test-password`, then:

```bash
cd web && npx playwright install chromium && cd ..
make e2e
```

Browser tests create uniquely named test data. They cover persisted daily workflow, organization and mobile navigation. They require the API origin and frontend URL to be `http://localhost:5173`.

## Layout

```text
api/cmd/api/             serve, migrate and provision commands
api/internal/auth/      account and session lifecycle
api/internal/settings/  preferences and timezone validation
api/internal/projects/  project hierarchy
api/internal/sections/  project sections
api/internal/labels/    global labels
api/internal/tasks/     tasks, views, ordering and completion history
api/internal/nutrition/ profile, food catalog, diary, recipes and meal plans
api/internal/core/      shared HTTP and transaction primitives
api/internal/server/    composition and integration tests
api/migrations/         embedded Goose migrations
web/src/                React UI and typed API contracts
web/e2e/                browser acceptance tests
docs/                   architecture, API and verification notes
```

Read [the implementation plan](docs/implementation-plan.md), [the API contract](docs/api.md) and [verification results](docs/verification.md).

Reference documentation: [Vite](https://vite.dev/guide/), [pgx](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool), [React Router](https://reactrouter.com/home) and [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview).

## Notes workspace

Use the application switcher in the top-right corner to move between Tasks and Notes.

- **Notes:** continuous Markdown editing, reading mode (`Ctrl/Cmd+E`), session tabs, a heading outline, word counts, named text properties, `[[Title]]` / `[[Title|Alias]]` links and incoming links. Click an unresolved wiki link to create its note.
- **Bases:** saved, filtered and sorted tables over note properties. Open a row to edit the underlying note.
- **Canvas:** add note cards, drag their headers (or use arrow keys), connect cards and remove cards/connections. Note and text cards edit Markdown in place with live preview, and note edits autosave to the referenced note. Positions and edges persist with the canvas.
- **Attachments:** paste an image from the clipboard (`Ctrl/Cmd+V`) or use the image button in a note to insert a Markdown embed. On a canvas, paste an image, drop a file or use **Media → Subir imagen** to create image cards. Images are stored by the API and served from the same origin. The **Adjuntos** page lists every stored image with its usage count, rename and a trash with restore, permanent delete and empty.
- **Task links:** select notes in the task editor. Notes display linked pending tasks and can open their task details.

Changes autosave after a 650 ms pause; **Guardar** also saves immediately or retries a failed write. Writes are serialized, and responses preserve edits made while saving. Failed saves retain the current draft; leaving through in-app links prompts before discarding unsaved edits. Tabs currently last for the mounted session. Wiki links bind to stable IDs and survive renames. Backlinks and outgoing links are read from the database index. Virtual folders support nested organization and note movement; the trash supports restore, permanent deletion and emptying with confirmation. A conflicting active title prevents restoration until that title is freed.

Use **Ctrl/Cmd+O** for the fuzzy note switcher, **Ctrl/Cmd+P** for commands and **Ctrl/Cmd+Shift+F** for indexed global search. Search supports words, quoted phrases, OR and exclusions and returns up to 100 matches. Properties remain text values. Normalized tags/aliases, typed formulas and large-collection pagination are still pending. Canvas navigation uses scrolling rather than zooming. See [the redesign plan](docs/knowledge-redesign.md) for the remaining work.

Migration `00002_notes.sql` creates the notes and task-note tables. Migrations `00004_knowledge_core.sql`, `00006_note_search.sql` and `00007_active_note_titles.sql` add folders, trash, indexed links and full-text search. Migration `00011_attachments.sql` adds stored image attachments. The migration command backfills existing wiki links in resumable batches. Apply migrations before running the updated API. Existing task and account records are preserved. No production rollout is performed by the implementation.

Run isolated browser checks without application credentials:

```bash
cd web
npx playwright test --config e2e/notes.config.ts
```

## Nutrition workspace

Use the application switcher to move between Tasks, Notes and Nutrition.

- **Perfil y objetivos:** weight, height, age, sex, activity and goal. Targets are derived with Mifflin-St Jeor or set manually; the browser mirrors the same formula for a live preview.
- **Diario:** a day per date with four meals, calories remaining, macro and fiber bars, water and a food picker. Entries freeze the nutrition at logging time, so later catalog edits do not rewrite history.
- **Alimentos:** a local catalog with brands, barcodes, a base portion, macros, a practical micronutrient set and favorites. Products can be searched and imported from Open Food Facts by name or barcode (ODbL).
- **Recetas:** ingredients from the catalog with macros computed automatically, per-serving values, Markdown steps, tags and **Cocinar** to add several servings to the diary.
- **Plan semanal:** a Monday-based week with meals per day, reusable templates, copy week, save week as template and **Pasar el día al diario** (idempotent per planned item).
- **Lista de la compra:** generated from the week plan or a recipe by summing ingredients, editable, with check-off and **Crear tarea con lo pendiente** through the tasks API.
- **Progreso:** body measurements per day (weight, body fat and circumference), a weight evolution sparkline and a deletable history.

Migrations `00009_nutrition.sql` through `00017_measurements.sql` add the profile, foods, diary, recipes, meal plans, shopping list and body measurements. See [the nutrition plan](docs/nutrition-plan.md).

Run the isolated nutrition browser checks without application credentials:

```bash
cd web
npx playwright test --config e2e/nutrition.config.ts
```
