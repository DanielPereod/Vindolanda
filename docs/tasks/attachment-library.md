# Task: Attachment library with trash

Follow-up to [attachments-notes-canvas.md](attachments-notes-canvas.md).

## Goal

The single account can review every stored image attachment, rename it, move it to a
trash, restore it or delete it permanently, and empty the trash.

## Acceptance criteria

Positive:

1. `GET /api/v1/attachments` lists active attachments (metadata only, no bytes),
   newest first. `?deleted=true` lists the trash.
2. `PUT /api/v1/attachments/{id}` renames the stored display name and returns the
   updated attachment. The URL and bytes are unchanged, so embeds keep working.
3. `DELETE /api/v1/attachments/{id}` moves the attachment to the trash. Its URL
   returns `404` while trashed.
4. `POST /api/v1/attachments/{id}/restore` restores it and the URL serves bytes
   again.
5. `DELETE /api/v1/attachments/{id}/permanent` deletes a trashed attachment;
   `DELETE /api/v1/attachments/trash` empties the trash.
6. The notes workspace has an **Adjuntos** page that shows a grid of images with
   filename, size and date, an inline rename, a trash action, and a tab to the
   trash with restore, permanent delete and empty-trash.
7. The manager shows how many notes or canvas cards reference each attachment and
   warns before trashing a used attachment.

Negative:

8. Renaming to an empty name, to a path or with only invalid characters is
   rejected with `422`.
9. Trashing, restoring, renaming or purging an unknown or wrongly-trashed
   attachment returns `404`; requests without a session return `401` and
   untrusted origins return `403`.

## Constraints

- Soft delete keeps the existing bytes; permanent delete removes the row.
- Embed URLs are never rewritten, so rename and restore do not require note edits.
- No commit, push or deployment.

## Exclusions

- Editing image content, tags, folders or search for attachments.
- Per-note attachment ownership or reference columns.

## Verification

- `make verify` and the attachment integration lifecycle against an isolated
  `*_test` database.
- Manual check of the Adjuntos page, inline rename and trash flow.
