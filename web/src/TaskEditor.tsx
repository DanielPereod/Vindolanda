import { NavLink } from "react-router-dom";
import type { Note } from "./notes";
import { useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { api, errorMessage, useResource } from "./api";
import type {
  Completion,
  Label,
  Project,
  Section,
  Task,
  TaskInput,
} from "./types";
import { Modal } from "./Modal";
import { parseQuickAdd, quickAddTargets } from "./quickAdd";
import { QuickAddTitle } from "./QuickAddTitle";
import { formatDate } from "./dates";

export interface TaskDraft {
  task?: Task;
  projectId?: string | null;
  parent?: Task;
}
export function TaskEditor({
  draft,
  projects,
  sections,
  labels,
  timezone,
  onClose,
}: {
  draft: TaskDraft;
  projects: Project[];
  sections: Section[];
  labels: Label[];
  timezone: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const notes = useResource<Note[]>("/notes");
  const [formInput, setFormInput] = useState<TaskInput>(() =>
    draft.task
      ? {
          title: draft.task.title,
          description: draft.task.description,
          project_id: draft.task.project_id,
          section_id: draft.task.section_id,
          parent_task_id: draft.task.parent_task_id,
          priority: draft.task.priority,
          due_date: draft.task.due_date,
          due_time: draft.task.due_time?.slice(0, 5) ?? null,
          label_ids: draft.task.label_ids,
          note_ids: draft.task.note_ids ?? [],
        }
      : {
          title: "",
          description: "",
          project_id: draft.parent?.project_id ?? draft.projectId ?? null,
          section_id: draft.parent?.section_id ?? null,
          parent_task_id: draft.parent?.id ?? null,
          priority: 4,
          due_date: null,
          due_time: null,
          label_ids: [],
          note_ids: [],
        },
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [recognitionEnabled, setRecognitionEnabled] = useState(!draft.task);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [createdLabels, setCreatedLabels] = useState<Label[]>([]);
  const availableLabels = [
    ...labels,
    ...createdLabels.filter(
      (created) => !labels.some((label) => label.id === created.id),
    ),
  ];
  const result = recognitionEnabled
    ? parseQuickAdd(
        formInput.title,
        formInput,
        projects,
        sections,
        availableLabels,
        timezone,
        new Date(),
        ignored,
      )
    : { input: formInput, tokens: [], recognized: [], warning: null };
  const input = result.input;
  const candidates = useResource<Task[]>("/tasks");
  function setInput(update: (current: TaskInput) => TaskInput) {
    setFormInput(update(input));
    setRecognitionEnabled(false);
  }
  function field<Key extends keyof TaskInput>(key: Key, value: TaskInput[Key]) {
    setInput((current) => ({ ...current, [key]: value }));
  }
  async function createLabel(name: string): Promise<boolean> {
    setPending(true);
    setError("");
    try {
      const label = await api<Label>("/labels", "POST", { name });
      setCreatedLabels((current) => [...current, label]);
      void client.invalidateQueries({ queryKey: ["/labels"] });
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setPending(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!input.title.trim()) {
      setError(
        "Escribe un título para la tarea, además de las fechas o etiquetas.",
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      await api(
        draft.task ? `/tasks/${draft.task.id}` : "/tasks",
        draft.task ? "PATCH" : "POST",
        input,
      );
      await client.invalidateQueries();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={
        draft.task
          ? "Detalle de tarea"
          : draft.parent
            ? "Nueva subtarea"
            : "Añadir tarea"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          void save(event);
        }}
        className="editor"
      >
        <QuickAddTitle
          value={formInput.title}
          result={result}
          targets={quickAddTargets(
            projects,
            sections,
            availableLabels,
            input.project_id,
          )}
          onCreateLabel={createLabel}
          enabled={recognitionEnabled}
          onEnable={() => setRecognitionEnabled(true)}
          onIgnore={(text) => setIgnored((current) => [...current, text])}
          onChange={(title) => {
            setFormInput((current) => ({ ...current, title }));
            setRecognitionEnabled(true);
            setError("");
          }}
        />
        <div className="quick-summary" aria-label="Resumen de tarea">
          {!result.tokens.some((token) => token.kind === "project") && (
            <span>
              {projects.find((project) => project.id === input.project_id)
                ?.name ?? "Bandeja de entrada"}
            </span>
          )}
          {input.section_id &&
            !result.tokens.some(
              (token) => token.kind === "section" || token.kind === "project",
            ) && (
              <span>
                /{" "}
                {
                  sections.find((section) => section.id === input.section_id)
                    ?.name
                }
              </span>
            )}
          {!result.tokens.some((token) => token.kind === "date") && (
            <span>
              {input.due_date ? formatDate(input.due_date) : "Sin fecha"}
              {input.due_time ? ` · ${input.due_time}` : ""}
            </span>
          )}
          {input.priority !== 4 &&
            !result.tokens.some((token) => token.kind === "priority") && (
              <span>P{input.priority}</span>
            )}
          {availableLabels
            .filter(
              (label) =>
                input.label_ids.includes(label.id) &&
                !result.tokens.some(
                  (token) =>
                    token.kind === "label" &&
                    token.text.toLocaleLowerCase() ===
                      `@${label.name}`.toLocaleLowerCase(),
                ),
            )
            .map((label) => (
              <span key={label.id}>@{label.name}</span>
            ))}
        </div>
        <details
          className="task-more-options"
          open={draft.task ? true : undefined}
        >
          <summary>
            Más opciones · fecha, prioridad, descripción y etiquetas
          </summary>
          <div className="task-more-content">
            <label>
              Descripción
              <textarea
                rows={4}
                value={input.description}
                placeholder="Añade contexto, notas o una lista…"
                onChange={(event) => field("description", event.target.value)}
              />
            </label>
            <button
              className="text-button"
              type="button"
              onClick={() => setPreview(!preview)}
            >
              {preview ? "Ocultar vista previa" : "Ver Markdown"}
            </button>
            {preview && (
              <div className="markdown">
                <ReactMarkdown>{input.description}</ReactMarkdown>
              </div>
            )}
            <div className="form-grid">
              <label>
                Proyecto
                <select
                  aria-label="Proyecto"
                  value={input.project_id ?? ""}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      project_id: event.target.value || null,
                      section_id: null,
                      parent_task_id: null,
                    }))
                  }
                >
                  <option value="">Bandeja de entrada</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.archived ? " (archivado)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sección
                <select
                  aria-label="Sección"
                  value={input.section_id ?? ""}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      section_id: event.target.value || null,
                      parent_task_id: null,
                    }))
                  }
                >
                  <option value="">Sin sección</option>
                  {sections
                    .filter(
                      (section) => section.project_id === input.project_id,
                    )
                    .map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Prioridad
                <select
                  aria-label="Prioridad"
                  value={input.priority}
                  onChange={(event) =>
                    field("priority", Number(event.target.value))
                  }
                >
                  <option value="1">P1 · Máxima</option>
                  <option value="2">P2 · Alta</option>
                  <option value="3">P3 · Media</option>
                  <option value="4">P4 · Normal</option>
                </select>
              </label>
              <label>
                Tarea principal
                <select
                  value={input.parent_task_id ?? ""}
                  onChange={(event) =>
                    field("parent_task_id", event.target.value || null)
                  }
                >
                  <option value="">Ninguna</option>
                  {(candidates.data ?? [])
                    .filter(
                      (task) =>
                        task.id !== draft.task?.id &&
                        task.project_id === input.project_id &&
                        task.section_id === input.section_id,
                    )
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Fecha
                <input
                  type="date"
                  value={input.due_date ?? ""}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      due_date: event.target.value || null,
                      due_time: event.target.value ? current.due_time : null,
                    }))
                  }
                />
              </label>
              <label>
                Hora
                <input
                  type="time"
                  disabled={!input.due_date}
                  value={input.due_time ?? ""}
                  onChange={(event) =>
                    field("due_time", event.target.value || null)
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>Etiquetas</legend>
              {availableLabels.length === 0 && (
                <p className="muted">Crea etiquetas desde la barra lateral.</p>
              )}
              <div className="label-options">
                {availableLabels.map((label) => (
                  <label key={label.id}>
                    <input
                      type="checkbox"
                      checked={input.label_ids.includes(label.id)}
                      onChange={(event) =>
                        field(
                          "label_ids",
                          event.target.checked
                            ? [...input.label_ids, label.id]
                            : input.label_ids.filter((id) => id !== label.id),
                        )
                      }
                    />
                    <span className="accent-marker">@</span>
                    {label.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </details>
        <fieldset>
          <legend>Notas vinculadas</legend>
          {notes.isError && (
            <p role="alert">No se pudieron cargar las notas.</p>
          )}
          <div className="label-options">
            {(notes.data ?? []).map((note) => (
              <label key={note.id}>
                <input
                  type="checkbox"
                  checked={(input.note_ids ?? []).includes(note.id)}
                  onChange={(event) =>
                    field(
                      "note_ids",
                      event.target.checked
                        ? [...(input.note_ids ?? []), note.id]
                        : (input.note_ids ?? []).filter(
                            (identifier) => identifier !== note.id,
                          ),
                    )
                  }
                />
                {note.title}
                <NavLink to={`/notes/${note.id}`}>Abrir</NavLink>
              </label>
            ))}
          </div>
          {!notes.isPending && !notes.isError && !notes.data?.length && (
            <p className="muted">Crea tu primera nota desde la app Notas.</p>
          )}
        </fieldset>
        {draft.task && <History taskId={draft.task.id} />}
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
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function History({ taskId }: { taskId: string }) {
  const history = useResource<Completion[]>(`/tasks/${taskId}/history`);
  return (
    <details>
      <summary>Historial de completados ({history.data?.length ?? 0})</summary>
      {history.isError && <p role="alert">No se pudo cargar el historial.</p>}
      {history.data?.map((entry) => (
        <p className="muted" key={entry.id}>
          Completada · {new Date(entry.completed_at).toLocaleString("es-ES")}
        </p>
      ))}
    </details>
  );
}
