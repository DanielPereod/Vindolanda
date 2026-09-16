import { useEffect, useMemo, useState } from "react";
import { createSaveQueue } from "./autosave";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  Network,
  Plus,
  Table2,
} from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import { filterNotes } from "./notes";
import type { Note, NoteInput, CanvasNode, NoteFolder, NoteLink } from "./notes";
import { NoteExplorer, NoteTrash } from "./NoteExplorer";
import { SidebarHeader, SidebarToggle } from "./SidebarToggle";
import { useSidebarState } from "./useSidebarState";
import { useAppearance } from "./useAppearance";
import type { Settings, Task } from "./types";
import { NoteEditor } from "./NoteEditor";

const icons = { note: FileText, base: Table2, canvas: Network };
const labels = { note: "Nota", base: "Base", canvas: "Canvas" };

/** Notes workspace uses server persistence and a URL for each document. */
export function NotesApp() {
  const settings = useResource<Settings>("/settings");
  useAppearance(settings.data);
  const query = useResource<Note[]>("/notes");
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useSidebarState();
  const [search, setSearch] = useState("");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  useEffect(() => setPending(false), [location.pathname]);
  const notes = query.data ?? [];
  const selected = notes.find(
    (note) => note.id === location.pathname.split("/")[2],
  );
  useEffect(() => {
    if (selected)
      setOpenTabs((tabs) =>
        tabs.includes(selected.id) ? tabs : [...tabs, selected.id],
      );
  }, [selected]);
  async function create(kind: NoteInput["kind"], title?: string) {
    if (
      document.querySelector("[data-unsaved=true]") &&
      !window.confirm("Hay cambios sin guardar. ¿Crear otra página?")
    )
      return;
    let ordinal = 1;
    while (
      notes.some(
        (note) =>
          note.title.toLocaleLowerCase() ===
          `${labels[kind]} ${ordinal}`.toLocaleLowerCase(),
      )
    )
      ordinal++;
    setPending(true);
    setError("");
    try {
      const created = await api<Note>("/notes", "POST", {
        title: title || `${labels[kind]} ${ordinal}`,
        kind,
        content: "",
        properties: {},
        nodes: [],
        edges: [],
        filter: "",
        sort: "title",
      });
      await client.invalidateQueries({ queryKey: ["/notes"] });
      navigate(`/notes/${created.id}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setPending(false);
    }
  }
  function wiki(title: string) {
    const target = notes.find(
      (note) => note.id === title || note.title.toLocaleLowerCase() === title.toLocaleLowerCase(),
    );
    if (target) {
      navigate(`/notes/${target.id}`);
      return;
    }
    if (window.confirm(`Crear la nota «${title}»?`)) void create("note", title);
  }
  return (
    <div className="notes-shell">
      <div className={`notes-layout ${navOpen ? "" : "nav-collapsed"}`}>
        <aside className="notes-sidebar">
          <SidebarHeader
            open={navOpen}
            onToggle={() => setNavOpen(!navOpen)}
          />
          <div className="eyebrow">MI CONOCIMIENTO</div>
          <h2>Explorador</h2>
          <input
            aria-label="Buscar notas"
            placeholder="Buscar en tu espacio…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="notes-create">
            {(["note", "base", "canvas"] as const).map((kind) => (
              <button
                disabled={pending}
                key={kind}
                onClick={() => void create(kind)}
              >
                <Plus size={14} />
                {labels[kind]}
              </button>
            ))}
          </div>
          <NoteExplorer notes={notes} search={search}/>
          <NavLink to="/notes/trash">Papelera</NavLink>
          {query.isPending && <p>Cargando notas…</p>}
          {query.isError && (
            <p role="alert">
              No se pudieron cargar las notas.{" "}
              <button onClick={() => void query.refetch()}>Reintentar</button>
            </p>
          )}
        </aside>
        <main className="notes-main">
          {!navOpen && (
            <div className="topbar">
              <SidebarToggle
                open={navOpen}
                floating
                onToggle={() => setNavOpen(true)}
              />
            </div>
          )}
          <nav className="document-tabs" aria-label="Pestañas abiertas">
            {openTabs.map((identifier) => {
              const tab = notes.find(
                (candidate) => candidate.id === identifier,
              );
              return tab ? (
                <NavLink key={identifier} to={`/notes/${identifier}`}>
                  <FileText size={14} />
                  {tab.title}
                </NavLink>
              ) : null;
            })}
          </nav>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {location.pathname === "/notes/trash" ? <NoteTrash onRestore={(identifier) => navigate(`/notes/${identifier}`)}/> : selected ? (
            <fieldset
              className="document-fields"
              disabled={pending}
              aria-busy={pending}
            >
              <Document
                key={selected.id}
                note={selected}
                notes={notes}
                onWiki={wiki}
              />
            </fieldset>
          ) : (
            <div className="notes-welcome">
              <BookOpen size={48} />
              <div className="eyebrow">CONECTA LO QUE PIENSAS</div>
              <h1>Una idea lleva a otra.</h1>
              <p>
                Escribe, conecta tus notas con [[wikilinks]] y encuentra nuevas
                perspectivas.
              </p>
              <div className="notes-starters">
                {(["note", "base", "canvas"] as const).map((kind) => {
                  const Icon = icons[kind];
                  return (
                    <button
                      key={kind}
                      disabled={pending}
                      onClick={() => void create(kind)}
                    >
                      <Icon />
                      <strong>{labels[kind]}</strong>
                      <span>
                        {kind === "note"
                          ? "Da forma a una idea"
                          : kind === "base"
                            ? "Organiza tus propiedades"
                            : "Conecta ideas en un lienzo"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
function Document({
  note,
  notes,
  onWiki,
}: {
  note: Note;
  notes: Note[];
  onWiki: (title: string) => void;
}) {
  const [input, setInput] = useState<NoteInput>(note);
  const [saved, setSaved] = useState(JSON.stringify(note));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [propertyName, setPropertyName] = useState("");
  const client = useQueryClient();
  const navigate = useNavigate();
  const folders = useResource<NoteFolder[]>("/note-folders");
  const outgoing = useResource<NoteLink[]>(`/notes/${note.id}/links`);
  const incoming = useResource<NoteLink[]>(`/notes/${note.id}/backlinks`);
  const tasks = useResource<Task[]>("/tasks");
  const dirty = JSON.stringify(input) !== saved;
  const persist = useMemo(
    () =>
      createSaveQueue(async (draft: NoteInput) => {
        setPending(true);
        setError("");
        const { title, kind, content, properties, nodes, edges, filter, sort, folder_id } =
          draft;
        try {
          const result = await api<Note>(`/notes/${note.id}`, "PUT", {
            title,
            kind,
            content,
            properties,
            nodes,
            edges,
            filter,
            sort,
            folder_id: folder_id ?? null,
          });
          setSaved(JSON.stringify(draft));
          client.setQueryData<Note[]>(["/notes"], (previous) =>
            previous?.map((candidate) =>
              candidate.id === result.id ? result : candidate,
            ),
          );
          await client.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && /^\/notes\/.+\/(links|backlinks)$/.test(query.queryKey[0]) });
        } catch (failure) {
          setError(errorMessage(failure));
          throw failure;
        } finally {
          setPending(false);
        }
      }),
    [client, note.id],
  );
  useEffect(() => {
    if (!dirty || pending || error) return;
    const timeout = window.setTimeout(() => {
      void persist(input).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [dirty, pending, error, input, persist]);
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function click(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a");
      if (
        link &&
        link.pathname !== window.location.pathname &&
        !window.confirm("Hay cambios sin guardar. ¿Salir de la nota?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  function wiki(title: string) {
    const reference = outgoing.data?.find((link) => link.target_title.toLocaleLowerCase() === (title.split("#")[0] ?? title).toLocaleLowerCase());
    if (reference?.target_deleted) { setError("La nota enlazada está en la papelera. Restáurala para abrirla."); return; }
    if (!dirty || window.confirm("Hay cambios sin guardar. ¿Continuar?")) onWiki(reference?.target_note_id ?? title.split("#")[0] ?? title);
  }
  async function save() {
    await persist(input).catch(() => undefined);
  }
  const backlinks = incoming.data ?? [];
  async function trash() {
    if (!window.confirm("¿Mover esta nota a la papelera? Podrás restaurarla después.")) return;
    setPending(true);
    try {
      if (dirty) await persist(input);
      await api(`/notes/${note.id}`, "DELETE");
      await client.invalidateQueries({ queryKey: ["/notes"] });
      await client.invalidateQueries({ queryKey: ["/notes?deleted=true"] });
      navigate("/notes/trash");
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return (
    <article className="note-document" data-unsaved={dirty}>
      <div className="notes-toolbar">
        <span className="eyebrow">{labels[input.kind].toUpperCase()}</span>
        <select aria-label="Carpeta de la nota" disabled={pending} value={input.folder_id ?? ""} onChange={(event) => setInput({ ...input, folder_id: event.target.value || null })}>
          <option value="">Sin carpeta</option>
          {folders.data?.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
        <span role="status">
          {pending
            ? "Guardando…"
            : error
              ? "Error al guardar"
              : dirty
                ? "Cambios sin guardar"
                : "Guardado"}
        </span>
        <button
          className="primary"
          disabled={pending || !dirty}
          onClick={() => void save()}
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button disabled={pending} onClick={() => void trash()}>Papelera</button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <fieldset className="document-fields">
        <input
          className="note-title"
          aria-label="Título de nota"
          value={input.title}
          onChange={(event) =>
            setInput({ ...input, title: event.target.value })
          }
        />
        {input.kind === "note" && (
          <>
            <div className="note-properties">
              {Object.entries(input.properties).map(([name, value]) => (
                <label key={name}>
                  {name}
                  <input
                    value={value}
                    onChange={(event) =>
                      setInput({
                        ...input,
                        properties: {
                          ...input.properties,
                          [name]: event.target.value,
                        },
                      })
                    }
                  />
                  <button
                    aria-label={`Quitar propiedad ${name}`}
                    onClick={() =>
                      setInput({
                        ...input,
                        properties: Object.fromEntries(
                          Object.entries(input.properties).filter(
                            ([key]) => key !== name,
                          ),
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </label>
              ))}
              <div className="property-add">
                <input
                  aria-label="Nueva propiedad"
                  placeholder="Propiedad, p. ej. Estado"
                  value={propertyName}
                  onChange={(event) => setPropertyName(event.target.value)}
                />
                <button
                  disabled={
                    !propertyName.trim() ||
                    Object.hasOwn(input.properties, propertyName.trim())
                  }
                  onClick={() => {
                    setInput({
                      ...input,
                      properties: {
                        ...input.properties,
                        [propertyName.trim()]: "",
                      },
                    });
                    setPropertyName("");
                  }}
                >
                  + Propiedad
                </button>
              </div>
            </div>
            <NoteEditor
              content={input.content}
              links={outgoing.data}
              onChange={(content) => setInput({ ...input, content })}
              onWiki={wiki}
            />
          </>
        )}
        {input.kind === "base" && (
          <BaseView
            input={input}
            notes={notes}
            onChange={setInput}
            onWiki={wiki}
          />
        )}
        {input.kind === "canvas" && (
          <CanvasView
            input={input}
            notes={notes}
            onChange={setInput}
            onWiki={wiki}
          />
        )}
      </fieldset>
      <section className="note-connections">
        <h3>
          Enlaces entrantes <span>{backlinks.length}</span>
        </h3>
        {backlinks.map((backlink) => (
          <div key={backlink.id}><button onClick={() => wiki(backlink.source_note_id)}>{backlink.source_title}</button><p className="muted">{backlink.context}</p></div>
        ))}
        {!backlinks.length && (
          <p className="muted">
            Enlaza esta página desde otra nota con [[{input.title}]].
          </p>
        )}
        {(incoming.isError || outgoing.isError) && <p role="alert">No se pudieron cargar los enlaces.</p>}
        <h3>Enlaces salientes</h3>
        {outgoing.data?.map((link) => <button key={link.id} onClick={() => wiki(link.target_title)}>{link.current_title}{link.target_note_id ? link.target_deleted ? " · Papelera" : "" : " · Sin resolver"}</button>)}
        <h3>Tareas vinculadas</h3>
        {tasks.isError && (
          <p role="alert">No se pudieron cargar las tareas vinculadas.</p>
        )}
        <div className="linked-task-list">
          {tasks.data
            ?.filter((task) => task.note_ids?.includes(note.id))
            .map((task) => (
              <NavLink
                key={task.id}
                to={`/inbox?task=${task.id}`}
                className="linked-task"
                title={`Abrir ${task.title}`}
              >
                <span className="linked-task-dot" aria-hidden="true" />
                <span className="linked-task-title">{task.title}</span>
                <span className="linked-task-hint">
                  {task.status === "completed" ? "Completada" : "Abrir"}
                  <ArrowUpRight size={13} />
                </span>
              </NavLink>
            ))}
        </div>
        {!tasks.isPending &&
          !tasks.isError &&
          !tasks.data?.some((task) => task.note_ids?.includes(note.id)) && (
            <p className="muted">
              Vincula esta nota desde el detalle de una tarea para verla aquí.
            </p>
          )}
      </section>
    </article>
  );
}
function BaseView({
  input,
  notes,
  onChange,
  onWiki,
}: {
  input: NoteInput;
  notes: Note[];
  onChange: (input: NoteInput) => void;
  onWiki: (title: string) => void;
}) {
  const filtered = filterNotes(notes, input.filter, input.sort);
  const columns = [
    ...new Set(filtered.flatMap((note) => Object.keys(note.properties))),
  ];
  return (
    <section>
      <p className="muted">
        Una vista de tus notas y sus propiedades. El filtro y el orden se
        guardan con esta base.
      </p>
      <div className="notes-toolbar">
        <input
          aria-label="Filtrar base"
          placeholder="Filtrar por contenido o propiedad…"
          value={input.filter}
          onChange={(event) =>
            onChange({ ...input, filter: event.target.value })
          }
        />
        <select
          aria-label="Ordenar base"
          value={input.sort}
          onChange={(event) =>
            onChange({
              ...input,
              sort:
                event.target.value === "updated_at" ? "updated_at" : "title",
            })
          }
        >
          <option value="title">Título A–Z</option>
          <option value="updated_at">Última modificación</option>
        </select>
      </div>
      <div className="base-scroll">
        <table className="notes-table">
          <thead>
            <tr>
              <th>Nota</th>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              <th>Actualizada</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((note) => (
              <tr key={note.id}>
                <td>
                  <button
                    className="wiki-link"
                    onClick={() => onWiki(note.title)}
                  >
                    {note.title}
                  </button>
                </td>
                {columns.map((column) => (
                  <td key={column}>{note.properties[column] || "—"}</td>
                ))}
                <td>{new Date(note.updated_at).toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{filtered.length} notas</p>
    </section>
  );
}
function CanvasView({
  input,
  notes,
  onChange,
  onWiki,
}: {
  input: NoteInput;
  notes: Note[];
  onChange: (input: NoteInput) => void;
  onWiki: (title: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [drag, setDrag] = useState<{
    id: string;
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
  } | null>(null);
  function move(node: CanvasNode, x: number, y: number) {
    onChange({
      ...input,
      nodes: input.nodes.map((candidate) =>
        candidate.id === node.id
          ? {
              ...candidate,
              x: Math.max(0, Math.min(9700, x)),
              y: Math.max(0, Math.min(9800, y)),
            }
          : candidate,
      ),
    });
  }
  return (
    <section>
      <div className="notes-toolbar">
        <select
          aria-label="Nota para canvas"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Selecciona una nota</option>
          {notes
            .filter((note) => note.kind === "note")
            .map((note) => (
              <option key={note.id} value={note.id}>
                {note.title}
              </option>
            ))}
        </select>
        <button
          disabled={!selected}
          onClick={() =>
            onChange({
              ...input,
              nodes: [
                ...input.nodes,
                {
                  id: crypto.randomUUID(),
                  note_id: selected,
                  x: 40 + (input.nodes.length % 3) * 300,
                  y: 40 + Math.floor(input.nodes.length / 3) * 220,
                },
              ],
            })
          }
        >
          + Tarjeta
        </button>
      </div>
      <div className="notes-toolbar">
        {[
          { label: "Origen", value: from, set: setFrom },
          { label: "Destino", value: to, set: setTo },
        ].map((control) => (
          <select
            key={control.label}
            aria-label={control.label}
            value={control.value}
            onChange={(event) => control.set(event.target.value)}
          >
            <option value="">{control.label}</option>
            {input.nodes.map((node, index) => (
              <option key={node.id} value={node.id}>
                {index + 1}.{" "}
                {notes.find((note) => note.id === node.note_id)?.title ??
                  "Nota no disponible"}
              </option>
            ))}
          </select>
        ))}
        <button
          disabled={
            !from ||
            !to ||
            from === to ||
            input.edges.some((edge) => edge.from === from && edge.to === to)
          }
          onClick={() =>
            onChange({ ...input, edges: [...input.edges, { from, to }] })
          }
        >
          Conectar
        </button>
      </div>
      <p className="muted">
        Arrastra las tarjetas por su cabecera o usa las flechas del teclado.
      </p>
      <div className="canvas-scroll">
        <div
          className="note-canvas"
          style={{
            width: Math.max(1100, ...input.nodes.map((node) => node.x + 300)),
            height: Math.max(650, ...input.nodes.map((node) => node.y + 220)),
          }}
        >
          <svg className="canvas-edges" width="100%" height="100%">
            {input.edges.map((edge, index) => {
              const start = input.nodes.find((node) => node.id === edge.from);
              const end = input.nodes.find((node) => node.id === edge.to);
              return start && end ? (
                <line
                  key={index}
                  x1={start.x + 120}
                  y1={start.y + 60}
                  x2={end.x + 120}
                  y2={end.y + 60}
                />
              ) : null;
            })}
          </svg>
          {input.nodes.map((node, index) => {
            const note = notes.find((note) => note.id === node.note_id);
            return (
              <div
                className="canvas-card"
                key={node.id}
                style={{ left: node.x, top: node.y }}
              >
                <button
                  className="canvas-handle"
                  aria-label={`Mover tarjeta ${index + 1}`}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDrag({
                      id: node.id,
                      pointerX: event.clientX,
                      pointerY: event.clientY,
                      x: node.x,
                      y: node.y,
                    });
                  }}
                  onPointerMove={(event) => {
                    if (drag?.id === node.id)
                      move(
                        node,
                        drag.x + event.clientX - drag.pointerX,
                        drag.y + event.clientY - drag.pointerY,
                      );
                  }}
                  onPointerUp={() => setDrag(null)}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(event) => {
                    const directions: Record<string, [number, number]> = {
                      ArrowLeft: [-20, 0],
                      ArrowRight: [20, 0],
                      ArrowUp: [0, -20],
                      ArrowDown: [0, 20],
                    };
                    const direction = directions[event.key];
                    if (direction) {
                      event.preventDefault();
                      move(node, node.x + direction[0], node.y + direction[1]);
                    }
                  }}
                >
                  ⠿ {index + 1}. {note?.title ?? "Nota no disponible"}
                </button>
                <p>
                  {note?.content.slice(0, 140) || "Una idea por desarrollar"}
                </p>
                <div>
                  <button
                    disabled={!note}
                    onClick={() => note && onWiki(note.title)}
                  >
                    Abrir nota
                  </button>
                  <button
                    aria-label={`Quitar tarjeta ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...input,
                        nodes: input.nodes.filter(
                          (candidate) => candidate.id !== node.id,
                        ),
                        edges: input.edges.filter(
                          (edge) =>
                            edge.from !== node.id && edge.to !== node.id,
                        ),
                      })
                    }
                  >
                    Quitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {input.edges.map((edge, index) => (
        <div className="canvas-connection" key={index}>
          <span>
            {
              notes.find(
                (note) =>
                  note.id ===
                  input.nodes.find((node) => node.id === edge.from)?.note_id,
              )?.title
            }{" "}
            →{" "}
            {
              notes.find(
                (note) =>
                  note.id ===
                  input.nodes.find((node) => node.id === edge.to)?.note_id,
              )?.title
            }
          </span>
          <button
            onClick={() =>
              onChange({
                ...input,
                edges: input.edges.filter((_, position) => position !== index),
              })
            }
          >
            Quitar conexión
          </button>
        </div>
      ))}
    </section>
  );
}
