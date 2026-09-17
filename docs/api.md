# HTTP API

Base path: `/api/v1`. All bodies and successful nonempty responses are JSON. Errors use `{ "error": "message" }`. Validation returns 422, malformed JSON 400, missing resources 404, state conflicts 409, missing/expired sessions 401 and an untrusted request origin 403.

All mutations, including login, require an `Origin` header exactly matching `APP_ORIGIN`. Browser requests use credentials. No registration endpoint exists. Cookies last 30 days, are HttpOnly and SameSite=Strict, and default to Secure. Local HTTP development must explicitly set `COOKIE_SECURE=false`.

## Authentication

| Method | Path | Input / result |
|---|---|---|
| POST | `/auth/login` | `{username,password}`; returns `{id,username}` and session cookie |
| POST | `/auth/logout` | Revokes current session; 204 |
| GET | `/auth/me` | Current `{id,username}` |
| PUT | `/auth/password` | `{current_password,new_password}`; revokes every session; 204 |
| DELETE | `/auth/sessions` | Revokes every session including the current one; 204 |

Passwords require 12–72 bytes and are hashed with bcrypt cost 12. Tokens contain 32 cryptographically random bytes; the database only stores SHA-256 hashes. Login allows ten attempts per minute per API process (one-account installation).

## Projects, sections and labels

Each collection supports `GET /collection`, `POST /collection`, `PATCH /collection/{id}` and `DELETE /collection/{id}`. Create returns 201, update 200 and delete 204. PATCH preserves omitted fields; null clears nullable references.

- Project: `name`, `description`, `color` (six-digit hex), `icon`, `parent_project_id`, `favorite`, `archived`, `default_view` (`list` | `board`). Server fields: `id`, `position`, `created_at`, `updated_at`.
- Section: `name`, `project_id`. Server fields: `id`, `position`, `created_at`, `updated_at`. A section cannot switch projects: move its tasks instead.
- Label: `name` (globally unique), `color`, `favorite`. Server fields: `id`, `created_at`.
- `PATCH /projects/{id}/reorder` and `PATCH /sections/{id}/reorder` accept `{before_id: string | null}`. A target must be a different sibling. Null appends.

Deleting a project moves its tasks to Inbox, clears their sections and detaches child projects. Deleting a section preserves its tasks without a section. Deleting a label removes only its task associations. Archiving preserves all data and excludes that project's tasks from Inbox/Today/Upcoming.

## Tasks

```json
{
  "title": "Prepare Monday training",
  "description": "Markdown notes",
  "project_id": null,
  "section_id": null,
  "parent_task_id": null,
  "priority": 4,
  "due_date": "2026-09-15",
  "due_time": "18:30",
  "label_ids": []
}
```

The response adds `id`, `position`, `status`, `created_at`, `updated_at` and `completed_at`. `due_time` may be returned as `HH:MM:SS`. Dates are local calendar dates; times are local clock times in the configured IANA timezone. A time requires a date. Instants are stored as TIMESTAMPTZ.

### Quick Add syntax

The task title is the Quick Add input. Recognition updates immediately while typing; Enter saves unless the suggestion menu is open. The title sent to the API excludes recognized metadata. There is no separate syntax-application step.

- Natural dates in Spanish or English using Chrono: `hoy`, `mañana`, `pasado mañana`, `lunes`, `en 3 días`, `in 2 weeks`, `12 de octubre`, `2026-10-12`, and numeric dates such as `15/09/2026`. Numeric dates use day/month order.
- Local times: `18:30`, `a las 18:30` or `at 18:30`.
- Projects and sections: `#Personal /Esta semana` or `#Personal/Esta semana`. Names may contain spaces. Archived projects are excluded from suggestions.
- Labels and priorities: `@compras` and `p1` through `p4`.

Use Arrow Up/Down and Enter/Tab to select suggestions. Escape dismisses suggestions before closing the dialog. An unknown `@label` offers an explicit creation action; the label is persisted immediately when selected, even if the task is later cancelled. Other unknown markers remain literal.

Click a recognized chip to keep that phrase as literal title text. Quoted date text and URLs remain literal. Expand **Más opciones** for manual fields; a manual change commits recognized fields and takes precedence. Existing titles are not reinterpreted merely by opening a task. Removing typed metadata before saving removes its effect. Time-only input uses the existing date or an inferred account-local date. Subtasks retain their parent unless the location changes.

This is not full Todoist feature parity. Recurrence, deadlines, durations, reminders and assignees are not implemented in this single-user data model. Recognized unsupported scheduling syntax displays a notice and stays literal instead of silently creating a one-off schedule. Date interpretation remains heuristic and is shown before submission.

Run the isolated browser suite with `npm run e2e:quick-add` from `web`. It starts a local frontend on port 5174 and mocks all API traffic, testing keyboard submission, manual overrides, label creation, error recovery and mobile layout without account credentials or a database.

| Method | Path | Behavior |
|---|---|---|
| GET / POST | `/tasks` | List / create |
| GET / PATCH / DELETE | `/tasks/{id}` | Read / edit / delete subtree |
| POST | `/tasks/{id}/complete` | Complete once and append history |
| POST | `/tasks/{id}/uncomplete` | Restore without deleting history |
| POST | `/tasks/{id}/duplicate` | Copy this task and labels as pending; does not copy descendants or history |
| PATCH | `/tasks/{id}/move` | Same editable input as PATCH; move descendants with their parent |
| PATCH | `/tasks/{id}/reorder` | `{before_id: string | null}`; position among pending/completed siblings |
| GET | `/tasks/{id}/history` | Completion entries, newest first |

Subtasks share the parent's project and section. The client clears the parent reference when changing location independently. Cycles are rejected. Completing a child never completes the parent; completing a parent does not complete its children.

Task list query parameters: `project_id`, `label` (ID), `status=pending|completed`, `date=today`, `q`, `sort=manual|date|priority|created|name`, `order=asc|desc`. Pending is the default. The MVP returns the full filtered collection for one user's workload; pagination is a future scaling step.

## Computed views and search

- `GET /views/inbox`: pending tasks with null project.
- `GET /views/today`: pending tasks scheduled today or earlier in the account timezone.
- `GET /views/upcoming?days=7|14|30`: inclusive account-local today through the selected range; no overdue tasks.
- `GET /views/completed`: completed tasks, newest first. Supports project and label parameters.
- `GET /search?q=...`: case-insensitive search over title, Markdown description, project name and label names. Shares the task list filters.

Today and Upcoming sort by date, time (untimed last), priority and manual position. They do not create special projects.

## Settings

`GET /settings` returns preferences. `PUT /settings` accepts any subset of known preference fields, preserving the others: `timezone`, `language` (`es` in the MVP), `week_start` (0/1), `hour_format` (12/24 as strings), `date_format` (`DD/MM/YYYY`/`YYYY-MM-DD`), `theme` (`light`/`dark`/`system`), `accent_color` (one of the supported palette values), `default_sort`, `browser_notifications`, `notes_confirm_discard`, `nutrition_base_unit` (`g`/`ml`/`unit`).

The notification preference is reserved for the reminder phase; the MVP does not deliver notifications. Week-start is stored for the future calendar. Unknown JSON fields are rejected.

## Domain and transaction boundaries

Handlers decode input, services validate invariants and repositories execute parameterized SQL. Domain packages own their models. Shared `core` contains transport, JSON row decoding and transactional ordering primitives only. Structural writes acquire one PostgreSQL transaction advisory lock for this single-user application. Failed association writes roll back their entire operation. Training, habits and other future domains must own independent entities; a future agenda will aggregate their projections.

## Notes, bases and canvas

All endpoints require the existing session and trusted-origin mutation policy.

- `GET /api/v1/notes`: list active documents with timestamps. `?deleted=true` lists trash.
- `GET /api/v1/notes/{id}`: fetch an active document by ID.
- `GET /api/v1/notes/search?q=...`: full-text search of active titles, content and property text, capped at 100 results. Supports words, quoted phrases, `OR` and `-exclusion`. Empty queries return recent documents; queries over 500 bytes are rejected.
- `POST /api/v1/notes`: create a document (201).
- `PUT /api/v1/notes/{id}`: replace editable document fields (200, or 404).
- `DELETE /api/v1/notes/{id}`: soft delete (204).
- `POST /api/v1/notes/{id}/restore`: restore the same identity (204).
- `DELETE /api/v1/notes/{id}/permanent`: permanently delete a trashed document, removing its Canvas references transactionally (204). Active documents are rejected.
- `DELETE /api/v1/notes/trash`: permanently empty trash (204).
- `GET /api/v1/notes/{id}/links` and `/backlinks`: indexed occurrences including stable target IDs, source/current titles, deleted-target state and context. Positions are UTF-8 byte offsets.
- `GET /api/v1/note-folders`: list virtual folders.
- `POST /api/v1/note-folders`, `PUT /api/v1/note-folders/{id}`: create/update `{name,parent_id}`; cycles and duplicate sibling names are rejected.
- `DELETE /api/v1/note-folders/{id}`: delete an empty folder. Child folders and notes, including trashed notes, prevent deletion.

Editable fields: `title` (unique after case folding and trimming), `kind` (`note`, `base`, `canvas`), `content` (Markdown), `properties` (string-to-string object), `nodes`, `edges` (`{from,to}`), `filter` and `sort` (`title`, `updated_at`, or empty). A canvas node is `{id,type,x,y,width?,height?,color?}` where `type` is `note` (uses `note_id` and must reference an active note), `text` (uses canvas-only `text`, up to 20 KB) or `media` (uses an http(s) `url` or a same-origin `/api/v1/attachments/…` path). Nodes without `type` are treated as `note` for backward compatibility. Node identifiers must be unique within a canvas; edges must connect distinct existing nodes. Coordinates are bounded to ±100000 pixels, card sizes to 40–5000 pixels when present, and colors to six-digit hex. Limits are 500 nodes, 1000 edges and 100 properties. Requests retain the shared 1 MiB limit; attachment uploads use their own multipart limit.

Task create/update accepts optional `note_ids`. Responses return an array, including when empty. Omitted fields on PATCH preserve links. Explicit `[]` removes links. Invalid references roll back the entire task mutation; duplicate tasks retain note links. The foreign-key join table prevents orphaned task links.

Notes accept an optional nullable `folder_id`. Titles are unique among active documents; restoring a conflicting title returns 409 and preserves the trash entry. Saves are debounced in the browser, serialized and last-write-wins across clients. The service atomically writes content and derived links; unchanged content is not reparsed. Wiki links bind by case-insensitive title on first resolution, then preserve their target ID on subsequent source edits and target renames. Alias labels are presentation only; a normalized note-alias registry is not yet available. Link indexes and task associations are separate. Bases reference the current notes collection rather than duplicating rows.

## Attachments

All endpoints require the existing session and trusted-origin mutation policy.

- `GET /api/v1/attachments`: list active attachments with metadata only, newest first. `?deleted=true` lists the trash.
- `POST /api/v1/attachments`: multipart form with a `file` field. Accepts one image up to 15 MiB whose bytes sniff as, or whose declared type matches, `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/bmp` or `image/avif`. Returns 201 with `{id,filename,content_type,size,url,created_at}` where `url` is `/api/v1/attachments/{id}/{id}.{ext}`.
- `PUT /api/v1/attachments/{id}`: rename an active attachment with `{filename}` (200). The URL and bytes are unchanged, so embeds keep working.
- `DELETE /api/v1/attachments/{id}`: move an active attachment to the trash (204).
- `POST /api/v1/attachments/{id}/restore`: restore a trashed attachment (204).
- `DELETE /api/v1/attachments/{id}/permanent`: delete a trashed attachment and its bytes (204). Active attachments are rejected.
- `DELETE /api/v1/attachments/trash`: empty the trash (204).
- `GET /api/v1/attachments/{id}/{name}`: return the stored bytes with the stored content type, an `inline` disposition and a private immutable cache header. Trashed attachments return 404.

Bytes are stored in PostgreSQL; no filesystem or external service is involved. Notes embed the URL as `![alt](url)` from a clipboard paste or the device picker. Canvases store it as a `media` node from a paste, a dropped file or **Media → Subir imagen**. The **Adjuntos** page lists every attachment with rename and a trash with restore and permanent deletion; it shows how many notes or cards embed each image. Empty files, non-image files and oversized files return 422 or 413. Attachments are not referenced by foreign keys, so permanently deleting one leaves broken embeds in notes that still point to it.

## Nutrition

All endpoints require the existing session and trusted-origin mutation policy. The module is a single-user domain registered under `/api/v1/nutrition`, alongside the existing task, project and notes modules.

- `GET /api/v1/nutrition/profile`: return the singleton nutrition profile.
- `PUT /api/v1/nutrition/profile`: overlay supplied fields on the profile, validate and upsert it (200).

Profile fields: `weight_kg`, `height_cm`, `age`, `sex` (`male` | `female` | `other`), `activity_level` (`sedentary` | `light` | `moderate` | `active` | `very_active`), `goal` (`lose` | `maintain` | `gain`), `target_calories`, `target_protein_g`, `target_carbs_g`, `target_fat_g`, `target_fiber_g`, `target_water_ml` and `target_mode` (`auto` | `manual`). The response adds `updated_at`. Weight, height, age and targets are bounded; invalid enums, negative values or out-of-range numbers return 422. A single profile row is created by the migration, so the first `GET` already returns defaults.

When `target_mode` is `auto`, the service derives the targets with Mifflin-St Jeor, the activity factor and a goal adjustment (lose −15%, gain +10%), then distributes macros by goal and computes fiber (14 g per 1000 kcal) and water (35 ml per kg). While the identity data (weight, height, age) is incomplete the stored targets are preserved unchanged. In `manual` mode the supplied targets are stored as given. The browser mirrors the same formula for a live preview.

### Food catalog

- `GET /api/v1/nutrition/foods`: list local foods. Query: `q` (name, brand or barcode substring), `favorite=true`, `limit` (1–200, default 50) and `offset`.
- `POST /api/v1/nutrition/foods`: create a manual food (201).
- `GET /api/v1/nutrition/foods/{id}`: fetch one food.
- `PATCH /api/v1/nutrition/foods/{id}`: overlay supplied fields on a food (200).
- `DELETE /api/v1/nutrition/foods/{id}`: delete a food (204).

Food fields: `name` (1–200 bytes), `brand`, `barcode` (nullable, 4–32 digits), `base_quantity` (> 0) and `base_unit` (`g` | `ml` | `unit`), then `calories_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`, `saturated_fat_g`, `salt_g`, `sodium_mg` and a `micronutrients` object of non-negative numbers. Responses add `id`, `source` (`manual` | `openfoodfacts`), `created_at` and `updated_at`. Name, brand and unit are unique after case folding and trimming, and barcodes are unique when present; duplicates return 409. The list is ordered by favorites first, then name.

### Open Food Facts

The server proxies Open Food Facts so the browser does not call the upstream directly, and a descriptive `OPENFOODFACTS_USER_AGENT` identifies the installation. The test suite never calls the upstream; the client is injected.

- `GET /api/v1/nutrition/foods/lookup?barcode=...`: normalized product candidate, not saved. 404 when unknown, 502 when upstream fails.
- `GET /api/v1/nutrition/foods/openfoodfacts?q=...`: normalized search results (up to 20), dropping entries without a barcode or name.
- `POST /api/v1/nutrition/foods/import`: body `{barcode}` fetches and stores the product with `source=openfoodfacts` (201); a duplicate barcode returns 409.

Values are normalized to a 100 g/100 ml base, and sodium and mineral amounts reported by Open Food Facts in grams are converted to milligrams. Import returns 422 when the upstream data cannot satisfy catalog invariants. The imported data is available under the ODbL license.

### Diary

- `GET /api/v1/nutrition/diary?date=YYYY-MM-DD`: entries, day totals, the profile targets and stored water.
- `POST /api/v1/nutrition/diary`: log a food `{entry_date,meal,food_id,quantity,unit?}` (201). The response freezes the scaled nutrition so later catalog edits do not rewrite history.
- `PATCH /api/v1/nutrition/diary/{id}`: change `quantity`, `meal` and/or `entry_date` (200); the snapshot is rescaled proportionally.
- `DELETE /api/v1/nutrition/diary/{id}`: remove an entry (204).
- `PUT /api/v1/nutrition/diary/water`: body `{entry_date,water_ml}` upserts the day's water (200).

Meals are `breakfast`, `lunch`, `dinner` or `snack`. `quantity` must be positive and the optional `unit` must match the food's base unit, otherwise the request returns 422. Deleting a catalog food preserves its logged entries with a null `food_id`.

### Recipes

- `GET /api/v1/nutrition/recipes?q=...`: list recipes ordered favorites first, then name. Each recipe includes its ingredients, whole-recipe `totals` and `per_serving` nutrition computed from the catalog foods.
- `POST /api/v1/nutrition/recipes`: create with `{name,description,prep_minutes,servings,tags,favorite,ingredients:[{food_id,quantity,unit?,note?}]}` (201).
- `GET /api/v1/nutrition/recipes/{id}` and `PATCH /api/v1/nutrition/recipes/{id}`: fetch or update a recipe; ingredients are replaced as a whole.
- `DELETE /api/v1/nutrition/recipes/{id}`: delete the recipe and its ingredients (204).
- `POST /api/v1/nutrition/recipes/{id}/cook`: body `{entry_date,meal,servings}` logs the scaled nutrition to the diary (201) under the recipe name; servings default to one.
- `POST /api/v1/nutrition/recipes/import`: body `{url}`. Fetches the page server-side, reads its JSON-LD `schema.org/Recipe` (including `@graph` lists), and returns a reviewable draft (200) with name, description, preparation time, servings, tags, ingredient lines and the catalog food matched to each one. It never writes: the browser opens the prefilled form so the user confirms ingredients. A page without recipe data returns 422 and an unreachable page 502.

The importer only accepts `http`/`https` URLs, bounds the response to 1 MiB with a 10 s timeout, and refuses to dial loopback, private, link-local or multicast addresses so a pasted URL cannot probe the host network. Ingredient lines keep their raw text and the parser understands decimals, fractions, unicode fractions (`½`) and common Spanish/English unit words; matched foods only reuse the parsed quantity when its unit agrees with the food base unit.

Ingredient quantities are scaled by the food base portion and an optional unit must match the food base unit; an unknown food or an out-of-range quantity returns 422. A food used by a recipe cannot be deleted. Deleting a recipe never touches the diary.

### Weekly plan

- `GET /api/v1/nutrition/plans?week=YYYY-MM-DD`: the plan for that ISO week (normalized to its Monday), or `null` when none exists. `?template=true` lists reusable templates instead.
- `POST /api/v1/nutrition/plans`: create `{name,week_start,is_template}` (201). A concrete plan requires a week and a template must not have one; a second plan for the same week returns 409.
- `GET|PATCH|DELETE /api/v1/nutrition/plans/{id}`: fetch, rename or delete a plan.
- `POST /api/v1/nutrition/plans/{id}/items`: add `{day_index,meal,recipe_id|food_id,quantity}` (201). `day_index` is 0–6 (Monday based) and exactly one source is required.
- `PATCH|DELETE /api/v1/nutrition/plans/{id}/items/{itemID}`: change the day, meal or quantity, or remove the item.
- `POST /api/v1/nutrition/plans/{id}/copy`: `{week_start}` copies the items into that week, creating it when needed; `{is_template:true,name}` saves the items as a reusable template.
- `POST /api/v1/nutrition/plans/{id}/log`: `{day_index,date,meal}` passes the planned meals to the diary (200, `{logged,entry_date}`). A template needs an explicit date and a concrete week derives it from `week_start`. Logging replaces the diary entries previously created from those plan items, so repeating it is idempotent.

Item nutrition is computed from the referenced recipe per-serving values or the food base portion. Editing, deleting or replacing a planned item drops the diary entries previously derived from it, so re-logging a day never leaves stale totals. Editing a plan does not otherwise change already-logged diary entries until the day is logged again.

### Shopping list

- `GET /api/v1/nutrition/shopping`: pending lines first, then checked, ordered by label.
- `POST /api/v1/nutrition/shopping/items`: add a manual line `{label,quantity,unit,checked}` (201).
- `PATCH|DELETE /api/v1/nutrition/shopping/{id}`: update or remove a line.
- `DELETE /api/v1/nutrition/shopping/checked`: clear every checked line (204).
- `POST /api/v1/nutrition/shopping/generate`: body `{plan_id}` or `{recipe_ids}` aggregates the ingredients of the planned or chosen recipes, summing lines that share a food and unit. It replaces the previously generated lines and keeps manual ones; returns the resulting list (200).

The list is a derived convenience, not a source of truth. "Create a task with the pending items" is done by the client through the existing tasks API, keeping the nutrition domain free of task dependencies.

### Body progress

- `GET /api/v1/nutrition/measurements`: list body measurements newest first.
- `POST /api/v1/nutrition/measurements`: create `{measured_on,weight_kg,body_fat_pct,waist_cm,hip_cm,chest_cm,neck_cm,arm_cm,thigh_cm,notes}` (201). The date is unique, so a duplicate returns 409, and at least one metric is required (422 otherwise).
- `PATCH /api/v1/nutrition/measurements/{id}`: replace the editable fields (200).
- `DELETE /api/v1/nutrition/measurements/{id}`: remove a measurement (204).

Metric values are bounded to 0–1000 (body fat to 100) and notes to 500 bytes. The browser draws a weight sparkline from the entries that include a weight.
