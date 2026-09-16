import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { errorMessage, useResource } from "./api";
import {
  attachmentReferences,
  deleteAttachment,
  emptyAttachmentTrash,
  formatFileSize,
  renameAttachment,
  restoreAttachment,
  trashAttachment,
} from "./attachments";
import type { Attachment } from "./attachments";
import type { Note } from "./notes";
import { Modal } from "./Modal";

type LibraryTab = "active" | "trash";

interface Confirmation {
  kind: "trash" | "delete" | "empty";
  id?: string;
  filename?: string;
  uses?: number;
}

/** Lists stored images and manages their names and trash state. */
export function AttachmentLibrary({ notes }: { notes: Note[] }) {
  const [tab, setTab] = useState<LibraryTab>("active");
  const path = tab === "trash" ? "/attachments?deleted=true" : "/attachments";
  const query = useResource<Attachment[]>(path);
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  async function perform(action: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["/attachments"] });
      await client.invalidateQueries({
        queryKey: ["/attachments?deleted=true"],
      });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  function startRename(attachment: Attachment) {
    setEditing(attachment.id);
    setDraft(attachment.filename);
  }

  function commitRename(attachment: Attachment) {
    const filename = draft.trim();
    setEditing(null);
    if (!filename || filename === attachment.filename) return;
    void perform(() => renameAttachment(attachment.id, filename));
  }

  async function confirm() {
    const current = confirmation;
    setConfirmation(null);
    if (!current) return;
    if (current.kind === "empty") await perform(() => emptyAttachmentTrash());
    else if (current.kind === "trash" && current.id)
      await perform(() => trashAttachment(current.id as string));
    else if (current.kind === "delete" && current.id)
      await perform(() => deleteAttachment(current.id as string));
  }

  const attachments = query.data ?? [];
  return (
    <section className="attachment-library">
      <h1>Adjuntos</h1>
      <p>
        Todas las imágenes guardadas. Renómbralas o muévelas a la papelera sin
        romper los enlaces; las notas siguen apuntando a la misma imagen.
      </p>
      <div className="attachment-tabs" role="tablist" aria-label="Adjuntos">
        {(["active", "trash"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={tab === option}
            className={tab === option ? "is-active" : ""}
            onClick={() => setTab(option)}
          >
            {option === "active" ? "Adjuntos" : "Papelera"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {query.isPending && <p>Cargando…</p>}
      {query.isError && <p role="alert">No se pudieron cargar los adjuntos.</p>}
      {tab === "trash" && attachments.length > 0 && (
        <button
          type="button"
          disabled={pending}
          className="danger-button"
          onClick={() => setConfirmation({ kind: "empty" })}
        >
          Vaciar papelera
        </button>
      )}
      {!query.isPending && attachments.length === 0 && (
        <p className="muted">
          {tab === "active"
            ? "Todavía no hay adjuntos. Pega una imagen en una nota o en un lienzo."
            : "La papelera está vacía."}
        </p>
      )}
      <ul className="attachment-grid">
        {attachments.map((attachment) => {
          const uses = attachmentReferences(notes, attachment.url);
          return (
            <li key={attachment.id} className="attachment-card">
              {tab === "active" ? (
                <a
                  className="attachment-thumb"
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Abrir ${attachment.filename}`}
                >
                  <img
                    src={attachment.url}
                    alt={attachment.filename}
                    loading="lazy"
                  />
                </a>
              ) : (
                <span
                  className="attachment-thumb is-trashed"
                  aria-hidden="true"
                >
                  <ImageOff size={26} />
                </span>
              )}
              <div className="attachment-meta">
                {editing === attachment.id ? (
                  <input
                    autoFocus
                    aria-label={`Nuevo nombre para ${attachment.filename}`}
                    className="attachment-name-input"
                    value={draft}
                    maxLength={180}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => commitRename(attachment)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(attachment);
                      else if (event.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <span className="attachment-name" title={attachment.filename}>
                    {attachment.filename}
                  </span>
                )}
                <span className="attachment-facts">
                  {formatFileSize(attachment.size)} ·{" "}
                  {new Date(attachment.created_at).toLocaleDateString("es-ES")}
                  {uses > 0 ? ` · usada en ${uses}` : ""}
                </span>
              </div>
              <div className="attachment-actions">
                {tab === "active" ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startRename(attachment)}
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setConfirmation({
                          kind: "trash",
                          id: attachment.id,
                          filename: attachment.filename,
                          uses,
                        })
                      }
                    >
                      Mover a papelera
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void perform(() => restoreAttachment(attachment.id))
                      }
                    >
                      Restaurar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="danger-button"
                      onClick={() =>
                        setConfirmation({
                          kind: "delete",
                          id: attachment.id,
                          filename: attachment.filename,
                        })
                      }
                    >
                      Eliminar definitivamente
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {confirmation && (
        <Modal
          title={
            confirmation.kind === "empty"
              ? "Vaciar papelera"
              : confirmation.kind === "delete"
                ? "Eliminar definitivamente"
                : "Mover a la papelera"
          }
          onClose={() => setConfirmation(null)}
        >
          <div className="editor">
            <p>
              {confirmation.kind === "empty"
                ? "¿Vaciar la papelera de adjuntos? Se eliminarán definitivamente."
                : confirmation.kind === "delete"
                  ? `¿Eliminar «${confirmation.filename}» definitivamente? No podrás recuperarlo.`
                  : `¿Mover «${confirmation.filename}» a la papelera? Podrás restaurarlo después.`}
              {confirmation.kind === "trash" && (confirmation.uses ?? 0) > 0
                ? ` Se usa en ${confirmation.uses} ${
                    confirmation.uses === 1 ? "sitio" : "sitios"
                  } y dejará de mostrarse allí hasta que lo restaures.`
                : ""}
            </p>
            <footer className="form-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmation(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={pending}
                onClick={() => void confirm()}
              >
                {confirmation.kind === "empty"
                  ? "Vaciar papelera"
                  : confirmation.kind === "delete"
                    ? "Eliminar definitivamente"
                    : "Mover a papelera"}
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </section>
  );
}
