import { useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "./api";
import type { Label, Project, Section } from "./types";
import { Modal } from "./Modal";
import { Dropdown } from "./Dropdown";
export type EntityDraft =
  | { kind: "projects"; value?: Project }
  | { kind: "sections"; value?: Section; projectId: string }
  | { kind: "labels"; value?: Label };
export function EntityEditor({
  draft,
  projects,
  onClose,
}: {
  draft: EntityDraft;
  projects: Project[];
  onClose: () => void;
}) {
  const value = draft.value;
  const project = draft.kind === "projects" ? draft.value : undefined;
  const [name, setName] = useState(value?.name ?? "");
  const color = value && "color" in value ? value.color : "#71717a";
  const [description, setDescription] = useState(project?.description ?? "");
  const [parent, setParent] = useState(project?.parent_project_id ?? "");
  const [favorite, setFavorite] = useState(
    value && "favorite" in value ? value.favorite : false,
  );
  const [archived, setArchived] = useState(project?.archived ?? false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const body =
      draft.kind === "sections"
        ? { name, project_id: draft.projectId }
        : {
            name,
            color,
            favorite,
            ...(draft.kind === "projects"
              ? { description, parent_project_id: parent || null, archived }
              : {}),
          };
    try {
      await api(
        `/${draft.kind}${value ? `/${value.id}` : ""}`,
        value ? "PATCH" : "POST",
        body,
      );
      await client.invalidateQueries();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  const title =
    draft.kind === "projects"
      ? "proyecto"
      : draft.kind === "sections"
        ? "sección"
        : "etiqueta";
  return (
    <Modal title={`${value ? "Editar" : "Crear"} ${title}`} onClose={onClose}>
      <form
        className="editor"
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label>
          Nombre
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {draft.kind !== "sections" && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(event) => setFavorite(event.target.checked)}
            />
            Favorito
          </label>
        )}
        {draft.kind === "projects" && (
          <>
            <label>
              Descripción
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label>
              Proyecto principal
              <Dropdown
                ariaLabel="Proyecto principal"
                value={parent}
                searchPlaceholder="Buscar proyecto…"
                onChange={setParent}
                options={[
                  { value: "", label: "Ninguno" },
                  ...projects
                    .filter((item) => item.id !== value?.id)
                    .map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                ]}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => setArchived(event.target.checked)}
              />
              Archivado
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer className="form-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={pending}>
            Guardar
          </button>
        </footer>
      </form>
    </Modal>
  );
}
