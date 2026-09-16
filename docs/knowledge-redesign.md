# Knowledge workspace redesign

The existing Go, PostgreSQL and React application is the starting point. Preserve tasks and existing documents. PostgreSQL remains authoritative; Markdown is document content, not file storage.

## Delivery sequence

1. Replace block editing with a continuous Markdown document, reading mode, debounced serialized autosave, document tabs, a compact explorer and contextual navigation. Verify failed writes and edits made during writes.
2. Introduce transactional repositories, folders, soft deletion, normalized links with stable target IDs, incremental metadata and indexed server search. Migrate existing documents without dropping data.
3. Complete phase-one typed properties, tags, keyboard switcher, command registry and scalable paginated navigation.
4. Implement advanced workspace layouts, previews, graph, history, daily notes and templates.
5. Expand Bases, Canvas, safe formulas, attachments, import/export and permission-scoped plugins.

## Validation

Use failing regression tests before implementation. Run `make verify` and the isolated Notes Playwright suite. Database integration tests require a disposable database. Compare changed files with the pre-edit snapshot because Git metadata is unavailable in this environment.

## Current constraints

The editor is continuous with debounced autosave. Virtual folders support nesting, rename, movement and empty-folder deletion. Notes support folder assignment, trash, restoration and permanent deletion. A transaction removes Canvas references when deleting notes permanently. Active titles are unique; a restore that conflicts with an active title rolls back without replacing either note.

Wiki occurrences are now indexed in PostgreSQL with nullable target IDs. Existing bindings survive renames and subsequent edits of the source. Backlinks and outgoing links are queried from this index. Creating or restoring a matching note resolves pending references. Migration backfill processes 100 documents per transaction and resumes from metadata versions after interruption.

Global search uses a generated weighted tsvector and a partial GIN index over active notes. It supports words, phrases, OR and exclusions, returning at most 100 results. A fuzzy Quick Switcher and dynamic command registry provide Ctrl/Cmd+O, Ctrl/Cmd+P and Ctrl/Cmd+Shift+F entry points.

The explorer, Bases and Quick Switcher still load/use the active document collection. The application does not yet meet the 100,000-note target. Pagination, typed properties, normalized tags and aliases, the complete query language, Live Preview, heading/block navigation, transclusion and the permission-scoped plugin API remain pending. Indexed embed metadata does not yet render transclusions. Quick Switcher recency is session data; workspace persistence is still pending.

Canvas is now an immersive full-viewport workspace: cards are note references, canvas-only Markdown text or media embeds (image, video or YouTube). It supports wheel zoom, middle-button panning, fit/reset controls and a bottom creation toolbar. Image attachments can be pasted, dropped or uploaded and become media cards; connection drawing UI and card resizing/grouping remain pending.

Migrations 00004, 00006 and 00007 add the knowledge schema, full-text index and active-title uniqueness. Run the normal migration command before starting the updated API. This implementation does not apply migrations to the running application or deploy it.
