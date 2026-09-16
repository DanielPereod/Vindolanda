# Plan: Attachment library with trash

Task specification: [attachment-library.md](attachment-library.md)

## Acceptance-to-evidence map

| Criterion | Evidence |
| --- | --- |
| AC1 list / AC3 trash / AC5 purge | Integration lifecycle test asserts active, deleted and empty lists |
| AC2 rename | Integration test renames and re-reads the filename; unit tests for sanitiser |
| AC4 restore | Integration test restores and downloads the bytes again |
| AC6/AC7 UI and usage warning | Vitest for `attachmentReferences`; manual browser check |
| AC8 rename rejection | Unit test for sanitising plus integration 422 |
| AC9 policy | Integration 404s; the protected composition already covers 401/403 |

## Slices

1. **Migration** `00015_attachments_trash.sql`: add nullable `deleted_at` and a
   partial active index.
2. **Backend** `api/internal/attachments/handler.go`: `list`, `rename`, `trash`,
   `restore`, `permanent` and `emptyTrash`; exclude trashed rows from `download`.
   Extract `sanitizeName`/`truncateName`/`extensionFor` from `safeFilename`.
3. **Backend tests**: unit cases for the sanitiser and extension lookup; extend
   the integration test with the full trash lifecycle and rename rejection.
4. **Frontend helper** `web/src/attachments.ts`: list/rename/trash/restore/purge
   API calls, `deleted_at` on the model and `attachmentReferences`.
   Tests for the reference counter.
5. **Frontend UI** `web/src/AttachmentLibrary.tsx` plus a `/notes/attachments`
   route, sidebar link and styles. Reuse `Modal` for confirmations.
6. **Docs** `docs/api.md` and `docs/verification.md`; then run the full checks.

## Risks and invariants

- Do not rewrite stored URLs: rename and restore must be lossless for embeds.
- Only trashed attachments may be permanently deleted or restored.
- Trashed attachments must not be served, so deletion takes effect immediately.
- Keep the existing upload, download and note/canvas contracts unchanged.
