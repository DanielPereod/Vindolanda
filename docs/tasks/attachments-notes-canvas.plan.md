# Plan: Image attachments for notes and canvas

Task specification: [attachments-notes-canvas.md](attachments-notes-canvas.md)

## Acceptance-to-evidence map

| Criterion | Evidence |
| --- | --- |
| AC1 upload | `attachments` integration test asserts 201 body and URL shape |
| AC2 download | Integration test GETs the URL and checks type/bytes; unit test for headers |
| AC3/AC4 note paste and picker | Vitest for `attachmentMarkdown`/`insertTextAtSelection`; manual browser check |
| AC5/AC6 canvas paste, picker, drop, render | Vitest for `imageFiles`; manual browser check |
| AC7 rejections | Unit tests for type/size guards; integration test for 401 and 422 |
| AC8/AC9 unchanged | Existing `notes` and `canvas` unit/integration suites stay green |

## Slices

1. **Backend module** (TDD)
   - `api/migrations/00011_attachments.sql`: `attachments` table.
   - `api/internal/attachments/{model,handler}.go`: multipart upload, byte
     download, type/size validation, filename sanitising.
   - `api/internal/attachments/attachments_test.go`: pure-function tests.
   - `api/internal/attachments/integration_test.go`: isolated schema, handler
     round trip, skip without `TEST_DATABASE_URL`.
   - Register in `api/internal/server/server.go`.
2. **Frontend helper** (TDD)
   - `web/src/attachments.ts`: `Attachment`, `uploadAttachment`, `imageFiles`,
     `attachmentMarkdown`, `insertTextAtSelection`, `MAX_ATTACHMENT_BYTES`.
   - `web/src/attachments.test.ts`.
3. **Note editor**
   - `web/src/MarkdownEditor.tsx`: `paste` DOM handler inserts returned snippet.
   - `web/src/NoteEditor.tsx`: paste handling, device picker, upload status.
   - `web/src/NotesApp.tsx`: pass the uploader to `NoteEditor`.
4. **Canvas**
   - `web/src/CanvasBoard.tsx`: paste listener, device picker in the media form,
     drag-and-drop overlay, media-card creation.
   - `web/src/NotesApp.tsx`: pass the uploader to `CanvasBoard`.
5. **Styles and docs**
   - `web/src/styles.css`: attachment button, status, drop overlay, markdown image.
   - `docs/api.md` and `README.md`: document the endpoints and workflow.

## Risks and invariants

- Do not trust the declared MIME type: sniff bytes and serve only allowlisted
  image types, so stored XSS through SVG/HTML is impossible.
- Keep `Content-Type: nosniff` and set `Content-Disposition: inline` plus a
  private cache header on downloads.
- Enforce the size limit before inserting and roll back nothing else.
- Do not change existing note/canvas validation or save contracts.
- Clipboard handling must ignore pastes without image files so normal text paste
  keeps working.
