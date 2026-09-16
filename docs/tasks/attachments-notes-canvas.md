# Task: Image attachments for notes and canvas

## Context

- [Knowledge workspace redesign](../knowledge-redesign.md) lists attachments as pending work.
- [API contract](../api.md) documents notes, bases and canvas.
- [Notes plan](../notes-plan.md) and [implementation plan](../implementation-plan.md) describe the module layout.
- Markdown is document content, not file storage; PostgreSQL remains authoritative.

## Goal

The single account can add image attachments to notes and canvases by pasting from
the clipboard (`Ctrl/Cmd+V`) or selecting them from the device. Notes embed the
image as Markdown; canvas creates a media card. Attachments are stored by the API
and served from the same origin.

## In scope

- Authenticated upload endpoint and byte-serving endpoint for image attachments.
- Clipboard paste in the note source editor and live preview.
- Device file picker in the note editor.
- Clipboard paste, device file picker and drag-and-drop on the canvas.
- Inline Markdown rendering and canvas media rendering of uploaded images.

## Acceptance criteria

Positive:

1. `POST /api/v1/attachments` with a multipart `file` field returns `201` and an
   attachment with `id`, `filename`, `content_type`, `size`, `url` and
   `created_at`. `url` is same-origin `/api/v1/attachments/{id}/{id}.{ext}`.
2. `GET` of that `url` returns the stored bytes with the stored image content
   type, an inline disposition and a private cache header. It requires a session.
3. In note source mode, pasting an image file inserts `![alt](url)` at the
   caret. In live preview mode it inserts at the caret and renders inline.
4. The note editor exposes a device picker that uploads selected images and
   appends Markdown embeds to the document.
5. On a canvas, pasting an image creates a media card; the Media toolbar offers a
   device picker; dropping image files creates media cards at the drop point.
6. An uploaded image media card renders the image through `CanvasMedia`.

Negative:

7. Non-image files, empty files and files over the size limit are rejected with
   `4xx`; uploads without a session return `401`; untrusted origins return `403`.
8. Existing canvas media URL validation and note content limits are unchanged.
9. A note containing an attachment URL saves and reloads without loss.

## Constraints

- Single account; session and trusted-origin policy already apply.
- Bytes are stored in PostgreSQL (`bytea`); no filesystem or new service.
- Supported content types are images recognised by content sniffing or a
  matching declared type: `image/png`, `image/jpeg`, `image/gif`,
  `image/webp`, `image/bmp`, `image/avif`.
- Maximum attachment size is 15 MiB.
- No commit, push or deployment.

## Exclusions

- Attachment library/browser UI, rename, deletion and orphan garbage collection.
- PDF, audio and video uploads.
- Drag-and-drop uploads inside the note editor.
- Permission-scoped plugins and import/export.

## Verification

- `make verify` (Go format/vet/race tests, ESLint, Vitest, TypeScript build).
- `make integration` against an isolated `*_test` database for upload/download.
- Manual/browser check of paste and device upload in notes and canvas.
