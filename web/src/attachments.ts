import { ApiError, api } from "./api";

/** Server-stored image metadata and the same-origin URL that serves it. */
export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
  created_at: string;
  deleted_at?: string | null;
}

/** Mirrors the API limit so invalid files fail before the request. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Image files found in a clipboard or data-transfer payload. */
export function imageFiles(
  files: FileList | File[] | null | undefined,
): File[] {
  if (!files) return [];
  return [...files].filter((file) => file.type.startsWith("image/"));
}

/** Markdown image embed shown for a stored attachment. */
export function attachmentMarkdown(
  attachment: Pick<Attachment, "filename" | "url">,
): string {
  const alt = attachment.filename
    .replace(/\.[^.]+$/u, "")
    .replace(/[[\]\r\n]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return `![${alt || "imagen"}](${attachment.url})`;
}

/** Inserts text at a caret and reports the resulting caret offset. */
export function insertTextAtSelection(
  value: string,
  start: number,
  end: number,
  insert: string,
): { value: string; cursor: number } {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  return {
    value: value.slice(0, from) + insert + value.slice(to),
    cursor: from + insert.length,
  };
}

/** Uploads one image with the session cookie and returns its metadata. */
export async function uploadAttachment(file: File): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file, file.name || "imagen.png");
  const response = await fetch("/api/v1/attachments", {
    method: "POST",
    credentials: "include",
    body,
  });
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    const message =
      typeof problem === "object" &&
      problem !== null &&
      "error" in problem &&
      typeof problem.error === "string"
        ? problem.error
        : "No se pudo subir la imagen";
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as Attachment;
}

/** Uploads several images, preserving order, and joins their Markdown embeds. */
export async function uploadAttachments(
  files: File[],
  upload: (file: File) => Promise<Attachment> = uploadAttachment,
): Promise<string> {
  const attachments = await Promise.all(files.map((file) => upload(file)));
  return attachments.map(attachmentMarkdown).join("\n");
}

/** Lists stored attachments, or the trash when deleted is true. */
export function listAttachments(deleted = false): Promise<Attachment[]> {
  return api<Attachment[]>(
    deleted ? "/attachments?deleted=true" : "/attachments",
  );
}

/** Renames the display name without changing the bytes or the URL. */
export function renameAttachment(
  identifier: string,
  filename: string,
): Promise<Attachment> {
  return api<Attachment>(`/attachments/${identifier}`, "PUT", { filename });
}

/** Moves an attachment to the trash. */
export function trashAttachment(identifier: string): Promise<void> {
  return api<undefined>(`/attachments/${identifier}`, "DELETE");
}

/** Restores a trashed attachment. */
export function restoreAttachment(identifier: string): Promise<void> {
  return api<undefined>(`/attachments/${identifier}/restore`, "POST", {});
}

/** Permanently deletes a trashed attachment. */
export function deleteAttachment(identifier: string): Promise<void> {
  return api<undefined>(`/attachments/${identifier}/permanent`, "DELETE");
}

/** Permanently deletes every trashed attachment. */
export function emptyAttachmentTrash(): Promise<void> {
  return api<undefined>("/attachments/trash", "DELETE");
}

/** Counts notes or canvas cards that embed the attachment URL. */
export function attachmentReferences(
  notes: { content: string; nodes: { url?: string }[] }[],
  url: string,
): number {
  return notes.filter(
    (note) =>
      note.content.includes(url) || note.nodes.some((node) => node.url === url),
  ).length;
}

/** Formats a byte count for the attachment list. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
