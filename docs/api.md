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

- Project: `name`, `description`, `color` (six-digit hex), `icon`, `parent_project_id`, `favorite`, `archived`, `default_view` (`list`). Server fields: `id`, `position`, `created_at`, `updated_at`.
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

`GET /settings` returns preferences. `PUT /settings` accepts any subset of known preference fields, preserving the others: `timezone`, `language` (`es` in the MVP), `week_start` (0/1), `hour_format` (12/24 as strings), `date_format` (`DD/MM/YYYY`/`YYYY-MM-DD`), `theme` (`light`/`dark`/`system`), `accent_color` (one of the supported palette values), `default_sort`, `browser_notifications`.

The notification preference is reserved for the reminder phase; the MVP does not deliver notifications. Week-start is stored for the future calendar. Unknown JSON fields are rejected.

## Domain and transaction boundaries

Handlers decode input, services validate invariants and repositories execute parameterized SQL. Domain packages own their models. Shared `core` contains transport, JSON row decoding and transactional ordering primitives only. Structural writes acquire one PostgreSQL transaction advisory lock for this single-user application. Failed association writes roll back their entire operation. Training, habits and other future domains must own independent entities; a future agenda will aggregate their projections.

## Notes, bases and canvas

All endpoints require the existing session and trusted-origin mutation policy.

- `GET /api/v1/notes`: list documents with timestamps.
- `POST /api/v1/notes`: create a document (201).
- `PUT /api/v1/notes/{id}`: replace editable document fields (200, or 404).

Editable fields: `title` (unique after case folding and trimming), `kind` (`note`, `base`, `canvas`), `content` (Markdown), `properties` (string-to-string object), `nodes` (`{id,note_id,x,y}`), `edges` (`{from,to}`), `filter` and `sort` (`title`, `updated_at`, or empty). Canvas node references must point to existing notes. Node identifiers must be unique within a canvas; edges must connect distinct existing nodes. Coordinates are bounded to 0–10000 pixels; limits are 500 nodes, 1000 edges and 100 properties. Requests retain the shared 1 MiB limit.

Task create/update accepts optional `note_ids`. Responses return an array, including when empty. Omitted fields on PATCH preserve links. Explicit `[]` removes links. Invalid references roll back the entire task mutation; duplicate tasks retain note links. The foreign-key join table prevents orphaned task links.

This version uses explicit last-write-wins saves. Wikilinks and backlinks resolve from Markdown in the client; they are distinct from task associations. Bases reference the current notes collection rather than duplicating rows.
