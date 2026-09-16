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

The existing API loads the document collection and resolves wiki links by title. It does not yet satisfy the target of 100,000 notes, stable link identity, typed properties or the complete plugin architecture. A frontend redesign alone must not be described as completing those requirements.
