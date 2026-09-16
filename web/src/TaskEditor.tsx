import { NavLink, useNavigate } from "react-router-dom";
import type { Note } from "./notes";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import {
  ArrowUpRight,
  ExternalLink,
  FileText,
  Network,
  Search,
  Table2,
  X,
} from "lucide-react";
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
  const navigate = useNavigate();
  const notes = useResource<Note[]>("/notes");
  const [labelFilter, setLabelFilter] = useState("");
  const [noteFilter, setNoteFilter] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
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
  const availableLabels = useMemo(
    () => [
      ...labels,
      ...createdLabels.filter(
        (created) => !labels.some((label) => label.id === created.id),
      ),
    ],
    [labels, createdLabels],
  );
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
  const labelQuery = labelFilter.trim().toLocaleLowerCase();
  const filteredLabels = useMemo(
    () =>
      availableLabels
        .filter((label) =>
          label.name.toLocaleLowerCase().includes(labelQuery),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [availableLabels, labelQuery],
  );
  const selectedLabels = useMemo(
    () =>
      availableLabels
        .filter((label) => input.label_ids.includes(label.id))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [availableLabels, input.label_ids],
  );
  const noteQuery = noteFilter.trim().toLocaleLowerCase();
  const filteredNotes = useMemo(() => {
    const all = notes.data ?? [];
    const matching = all.filter((note) =>
      `${note.title} ${note.content} ${note.kind}`
        .toLocaleLowerCase()
        .includes(noteQuery),
    );
    return [...matching].sort((left, right) =>
      left.title.localeCompare(right.title),
    );
  }, [notes.data, noteQuery]);
  const selectedNotes = useMemo(() => {
    const all = notes.data ?? [];
    return (input.note_ids ?? [])
      .map((identifier) => all.find((note) => note.id === identifier))
      .filter((note): note is Note => Boolean(note))
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [notes.data, input.note_ids]);
  const previewNote =
    (notes.data ?? []).find((note) => note.id === previewId) ?? null;
  function toggleLabel(identifier: string, checked: boolean) {
    field(
      "label_ids",
      checked
        ? [...input.label_ids, identifier]
        : input.label_ids.filter((id) => id !== identifier),
    );
  }
  function toggleNote(identifier: string, checked: boolean) {
    const current = input.note_ids ?? [];
    field(
      "note_ids",
      checked
        ? [...current, identifier]
        : current.filter((id) => id !== identifier),
    );
  }
  function goToNote(identifier: string) {
    setPreviewId(null);
    onClose();
    navigate(`/notes/${identifier}`);
  }
  function goToTask(task: Task) {
    setPreviewId(null);
    onClose();
    navigate(`/inbox?task=${task.id}`);
  }
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
            <fieldset className="relation-field">
              <legend>
                Etiquetas · {selectedLabels.length}/{availableLabels.length}
              </legend>
              {availableLabels.length === 0 && (
                <p className="muted">Crea etiquetas desde la barra lateral.</p>
              )}
              {selectedLabels.length > 0 && (
                <div
                  className="relation-chips"
                  aria-label="Etiquetas seleccionadas"
                >
                  {selectedLabels.map((label) => (
                    <span key={label.id} className="relation-chip">
                      <NavLink
                        to={`/label/${label.id}`}
                        onClick={onClose}
                        title={`Ir a la etiqueta ${label.name}`}
                      >
                        <span className="accent-marker">@</span>
                        {label.name}
                      </NavLink>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Quitar etiqueta ${label.name}`}
                        onClick={() => toggleLabel(label.id, false)}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {availableLabels.length > 0 && (
                <>
                  <div className="relation-search">
                    <Search size={14} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Buscar etiquetas"
                      placeholder="Buscar etiquetas…"
                      value={labelFilter}
                      onChange={(event) =>
                        setLabelFilter(event.target.value)
                      }
                    />
                    {labelFilter && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Limpiar búsqueda de etiquetas"
                        onClick={() => setLabelFilter("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div
                    className="relation-list"
                    role="group"
                    aria-label="Etiquetas disponibles"
                  >
                    {filteredLabels.map((label) => (
                      <label key={label.id} className="relation-row">
                        <input
                          type="checkbox"
                          checked={input.label_ids.includes(label.id)}
                          onChange={(event) =>
                            toggleLabel(label.id, event.target.checked)
                          }
                        />
                        <span className="accent-marker">@</span>
                        <span className="relation-title">{label.name}</span>
                        <NavLink
                          to={`/label/${label.id}`}
                          onClick={onClose}
                          className="relation-goto"
                          title={`Ir a ${label.name}`}
                          aria-label={`Ir a la etiqueta ${label.name}`}
                        >
                          <ExternalLink size={13} />
                        </NavLink>
                      </label>
                    ))}
                    {filteredLabels.length === 0 && (
                      <p className="muted">
                        Sin coincidencias para «{labelFilter}».
                      </p>
                    )}
                  </div>
                </>
              )}
            </fieldset>
          </div>
        </details>
        <fieldset className="relation-field">
          <legend>
            Notas vinculadas · {selectedNotes.length}/
            {(notes.data ?? []).length}
          </legend>
          {notes.isError && (
            <p role="alert">No se pudieron cargar las notas.</p>
          )}
          {selectedNotes.length > 0 && (
            <div
              className="relation-chips relation-chips--notes"
              aria-label="Notas seleccionadas"
            >
              {selectedNotes.map((note) => (
                <span key={note.id} className="relation-chip relation-chip--note">
                  <NoteKindIcon kind={note.kind} />
                  <button
                    type="button"
                    className="relation-chip-button"
                    onClick={() => setPreviewId(note.id)}
                    title="Ver vista previa"
                  >
                    {note.title}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Quitar nota ${note.title}`}
                    onClick={() => toggleNote(note.id, false)}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {!notes.isPending && !notes.isError && (
            <>
              <div className="relation-search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Buscar notas para vincular"
                  placeholder="Buscar por título, contenido o tipo…"
                  value={noteFilter}
                  onChange={(event) => setNoteFilter(event.target.value)}
                />
                {noteFilter && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Limpiar búsqueda de notas"
                    onClick={() => setNoteFilter("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div
                className="relation-list"
                role="group"
                aria-label="Notas disponibles"
              >
                {filteredNotes.map((note) => {
                  const checked = (input.note_ids ?? []).includes(note.id);
                  return (
                    <div key={note.id} className="relation-row">
                      <input
                        type="checkbox"
                        aria-label={`Vincular ${note.title}`}
                        checked={checked}
                        onChange={(event) =>
                          toggleNote(note.id, event.target.checked)
                        }
                      />
                      <NoteKindIcon kind={note.kind} />
                      <button
                        type="button"
                        className="relation-title relation-title--button"
                        onClick={() => setPreviewId(note.id)}
                        title="Ver vista previa"
                      >
                        {note.title}
                      </button>
                      <span className="kind-badge">{noteKindLabel(note.kind)}</span>
                    </div>
                  );
                })}
                {filteredNotes.length === 0 && (
                  <p className="muted">
                    {(notes.data ?? []).length === 0
                      ? "Crea tu primera nota desde la app Notas."
                      : `Sin coincidencias para «${noteFilter}».`}
                  </p>
                )}
              </div>
            </>
          )}
          {notes.isPending && <p className="muted">Cargando notas…</p>}
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
      {previewNote && (
        <NotePreview
          note={previewNote}
          tasks={candidates.data ?? []}
          linked={(input.note_ids ?? []).includes(previewNote.id)}
          onToggle={(checked) => toggleNote(previewNote.id, checked)}
          onClose={() => setPreviewId(null)}
          onOpenFull={() => goToNote(previewNote.id)}
          onOpenTask={goToTask}
        />
      )}
    </Modal>
  );
}
function noteKindLabel(kind: Note["kind"]): string {
  return kind === "base" ? "Base" : kind === "canvas" ? "Canvas" : "Nota";
}
function NoteKindIcon({ kind }: { kind: Note["kind"] }) {
  const Icon = kind === "base" ? Table2 : kind === "canvas" ? Network : FileText;
  return (
    <span className="kind-icon" aria-hidden="true" title={noteKindLabel(kind)}>
      <Icon size={14} />
    </span>
  );
}
function NotePreview({
  note,
  tasks,
  linked,
  onToggle,
  onClose,
  onOpenFull,
  onOpenTask,
}: {
  note: Note;
  tasks: Task[];
  linked: boolean;
  onToggle: (checked: boolean) => void;
  onClose: () => void;
  onOpenFull: () => void;
  onOpenTask: (task: Task) => void;
}) {
  const excerpt = note.content.trim().slice(0, 1200);
  const linkedTasks = tasks.filter((task) =>
    task.note_ids?.includes(note.id),
  );
  return (
    <Modal title={note.title} onClose={onClose}>
      <div className="editor note-preview">
        <p className="muted note-preview-meta">
          <NoteKindIcon kind={note.kind} />
          {noteKindLabel(note.kind)} · Actualizada{" "}
          {new Date(note.updated_at).toLocaleString("es-ES")}
        </p>
        {excerpt ? (
          <div className="markdown note-preview-body">
            <ReactMarkdown>{excerpt}</ReactMarkdown>
          </div>
        ) : (
          <p className="muted">Esta nota aún no tiene contenido.</p>
        )}
        {linkedTasks.length > 0 && (
          <div className="note-preview-tasks">
            <h3>Tareas vinculadas ({linkedTasks.length})</h3>
            <div className="linked-task-list">
              {linkedTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="linked-task"
                  onClick={() => onOpenTask(task)}
                  title={`Abrir ${task.title}`}
                >
                  <span className="linked-task-dot" aria-hidden="true" />
                  <span className="linked-task-title">{task.title}</span>
                  <span className="linked-task-hint">
                    {task.status === "completed" ? "Completada" : "Abrir"}
                    <ArrowUpRight size={13} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <footer className="form-footer note-preview-footer">
          <label className="preview-toggle">
            <input
              type="checkbox"
              checked={linked}
              onChange={(event) => onToggle(event.target.checked)}
            />
            Vinculada a esta tarea
          </label>
          <span className="preview-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cerrar
            </button>
            <button
              type="button"
              className="primary"
              onClick={onOpenFull}
            >
              Ir a la nota completa
              <ArrowUpRight size={14} />
            </button>
          </span>
        </footer>
      </div>
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
