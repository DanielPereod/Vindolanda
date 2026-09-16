import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSaveQueue } from "./autosave";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Calendar,
  Copy,
  Download,
  FileText,
  FolderInput,
  Image as ImageIcon,
  Link2,
  List,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  Table2,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import { filterNotes } from "./notes";
import type { Note, NoteInput, NoteFolder, NoteLink } from "./notes";
import { NoteExplorer, NoteTrash } from "./NoteExplorer";
import { SidebarFooter, SidebarToggle } from "./SidebarToggle";
import { useSidebarState } from "./useSidebarState";
import { useAppearance } from "./useAppearance";
import type { Label, Project, Section, Task, Settings } from "./types";
import { NoteEditor } from "./NoteEditor";
import { AttachmentLibrary } from "./AttachmentLibrary";
import { Dropdown } from "./Dropdown";
import { WorkspaceTools } from "./WorkspaceTools";
import { CanvasBoard } from "./CanvasBoard";
import { TaskEditor } from "./TaskEditor";
import { loadNotesPreferences } from "./preferences";

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
  const [searchSignal, setSearchSignal] = useState(0);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [preferences] = useState(() => loadNotesPreferences());
  const client = useQueryClient();
  useEffect(() => setPending(false), [location.pathname]);
  function shouldConfirm(message: string) {
    return !preferences.confirmDiscard || window.confirm(message);
  }
  const notes = query.data ?? [];
  const selected = notes.find(
    (note) => note.id === location.pathname.split("/")[2],
  );
  const noteEdits = useRef(new Map<string, number>());
  const noteWrites = useMemo(
    () =>
      createSaveQueue(async (identifier: string) => {
        const current = client
          .getQueryData<Note[]>(["/notes"])
          ?.find((note) => note.id === identifier);
        if (!current) return;
        try {
          const saved = await api<Note>(`/notes/${identifier}`, "PUT", {
            title: current.title,
            kind: current.kind,
            content: current.content,
            properties: current.properties,
            nodes: current.nodes,
            edges: current.edges,
            filter: current.filter,
            sort: current.sort,
            folder_id: current.folder_id ?? null,
          });
          client.setQueryData<Note[]>(["/notes"], (previous) =>
            previous?.map((note) => (note.id === saved.id ? saved : note)),
          );
          await client.invalidateQueries({
            predicate: (pending) =>
              typeof pending.queryKey[0] === "string" &&
              /^\/notes\/.+\/(links|backlinks)$/.test(pending.queryKey[0]),
          });
        } catch (failure) {
          setError(errorMessage(failure));
          throw failure;
        }
      }),
    [client],
  );
  useEffect(() => {
    const timers = noteEdits.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);
  const canvasActive = selected?.kind === "canvas";
  useEffect(() => {
    if (selected)
      setOpenTabs((tabs) =>
        tabs.includes(selected.id) ? tabs : [...tabs, selected.id],
      );
    // Limpia pestañas de notas que ya no existen (papelera / eliminado).
    if (query.data)
      setOpenTabs((tabs) =>
        tabs.filter((identifier) =>
          query.data.some((note) => note.id === identifier),
        ),
      );
  }, [selected, query.data]);

  function closeTab(identifier: string) {
    setOpenTabs((tabs) => {
      const next = tabs.filter((tab) => tab !== identifier);
      if (location.pathname === `/notes/${identifier}`) {
        if (next.length > 0) {
          const closedIndex = tabs.indexOf(identifier);
          const fallback =
            next[Math.min(closedIndex, next.length - 1)] ?? next[0];
          navigate(fallback ? `/notes/${fallback}` : "/notes");
        } else {
          navigate("/notes");
        }
      }
      return next;
    });
  }
  async function create(
    kind: NoteInput["kind"],
    title?: string,
    folderId: string | null = null,
  ) {
    if (
      document.querySelector("[data-unsaved=true]") &&
      !shouldConfirm("Hay cambios sin guardar. ¿Crear otra página?")
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
        folder_id: folderId,
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
      (note) =>
        note.id === title ||
        note.title.toLocaleLowerCase() === title.toLocaleLowerCase(),
    );
    if (target) {
      navigate(`/notes/${target.id}`);
      return;
    }
    if (window.confirm(`Crear la nota «${title}»?`)) void create("note", title);
  }
  /** Creates a note from inside a canvas without leaving the canvas. */
  async function createNoteForCanvas(title?: string): Promise<Note | null> {
    const desired = title?.trim();
    let ordinal = 1;
    while (
      notes.some(
        (note) =>
          note.title.toLocaleLowerCase() ===
          `Nota ${ordinal}`.toLocaleLowerCase(),
      )
    )
      ordinal++;
    try {
      const created = await api<Note>("/notes", "POST", {
        title: desired || `Nota ${ordinal}`,
        kind: "note",
        content: "",
        properties: {},
        nodes: [],
        edges: [],
        filter: "",
        sort: "title",
      });
      await client.invalidateQueries({ queryKey: ["/notes"] });
      return created;
    } catch (failure) {
      setError(errorMessage(failure));
      return null;
    }
  }
  /** Optimistically edits a canvas note card and autosaves it after a pause. */
  function updateNoteContent(identifier: string, content: string) {
    client.setQueryData<Note[]>(["/notes"], (previous) =>
      previous?.map((note) =>
        note.id === identifier ? { ...note, content } : note,
      ),
    );
    const existing = noteEdits.current.get(identifier);
    if (existing) window.clearTimeout(existing);
    noteEdits.current.set(
      identifier,
      window.setTimeout(() => {
        noteEdits.current.delete(identifier);
        void noteWrites(identifier).catch(() => undefined);
      }, 650),
    );
  }
  function openTool(path: string) {
    if (
      document.querySelector("[data-unsaved=true]") &&
      !shouldConfirm("Hay cambios sin guardar. ¿Continuar?")
    )
      return;
    navigate(path);
  }
  return (
    <div className="notes-shell">
      <div className={`notes-layout ${navOpen ? "" : "nav-collapsed"}`}>
        <aside className="notes-sidebar">
          <WorkspaceTools
            compact
            notes={notes}
            searchSignal={searchSignal}
            onOpen={(identifier) => openTool(`/notes/${identifier}`)}
            onCreate={(title) => create("note", title)}
            onTrash={() => openTool("/notes/trash")}
          />
          <NoteExplorer
            notes={notes}
            onSearch={() => setSearchSignal((value) => value + 1)}
            onCreateDocument={(kind, folderId) =>
              void create(kind, undefined, folderId)
            }
          />
          <NavLink className="notes-trash-link" to="/notes/attachments">
            <ImageIcon size={15} />
            Adjuntos
          </NavLink>
          <NavLink className="notes-trash-link" to="/notes/trash">
            <Trash2 size={15} />
            Papelera
          </NavLink>
          <NavLink className="notes-trash-link" to="/configuration">
            <SettingsIcon size={15} />
            Configuración
          </NavLink>
          {query.isPending && <p>Cargando notas…</p>}
          {query.isError && (
            <p role="alert">
              No se pudieron cargar las notas.{" "}
              <button onClick={() => void query.refetch()}>Reintentar</button>
            </p>
          )}
          <div className="sidebar-bottom">
            <SidebarFooter
              open={navOpen}
              onToggle={() => setNavOpen(!navOpen)}
            />
          </div>
        </aside>
        <main
          className={`notes-main${canvasActive ? " notes-main--canvas" : ""}`}
        >
          {!navOpen && (
            <div className="topbar">
              <SidebarToggle
                open={navOpen}
                floating
                onToggle={() => setNavOpen(true)}
              />
            </div>
          )}
          <div className="notes-sticky-bar">
            <nav className="document-tabs" aria-label="Pestañas abiertas">
              {openTabs.map((identifier) => {
                const tab = notes.find(
                  (candidate) => candidate.id === identifier,
                );
                if (!tab) return null;
                const TabIcon = icons[tab.kind] ?? FileText;
                const isActive = location.pathname === `/notes/${identifier}`;
                return (
                  <div
                    key={identifier}
                    className={`doc-tab${isActive ? " active" : ""}`}
                  >
                    <NavLink
                      to={`/notes/${identifier}`}
                      tabIndex={-1}
                      title={tab.title}
                      onAuxClick={(event) => {
                        if (event.button === 1) {
                          event.preventDefault();
                          closeTab(identifier);
                        }
                      }}
                    >
                      <TabIcon size={14} aria-hidden="true" />
                      <span className="doc-tab-title">{tab.title}</span>
                    </NavLink>
                    <button
                      type="button"
                      className="doc-tab-close"
                      aria-label={`Cerrar ${tab.title}`}
                      title={`Cerrar ${tab.title}`}
                      onClick={() => closeTab(identifier)}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </nav>
            <div className="notes-sticky-actions" id="notes-sticky-actions" />
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {location.pathname === "/notes/trash" ? (
            <NoteTrash
              onRestore={(identifier) => navigate(`/notes/${identifier}`)}
            />
          ) : location.pathname === "/notes/attachments" ? (
            <AttachmentLibrary notes={notes} />
          ) : selected ? (
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
                onCreateNote={createNoteForCanvas}
                onUpdateNote={updateNoteContent}
                timezone={settings.data?.timezone ?? "Europe/Madrid"}
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
/** Cabecera compartida por notas, bases y canvas: estado y acciones. */
function DocumentToolbar({
  stickyEl,
  status,
  menuOpen,
  menuButtonRef,
  onOpenMenu,
  onCloseMenu,
}: {
  stickyEl: HTMLElement | null;
  status: string;
  menuOpen: boolean;
  menuButtonRef: React.RefObject<HTMLButtonElement>;
  onOpenMenu: (x: number, y: number) => void;
  onCloseMenu: () => void;
}) {
  const toolbar = (
    <div className={`notes-toolbar${stickyEl ? " notes-toolbar--sticky" : ""}`}>
      <span role="status">{status}</span>
      <button
        ref={menuButtonRef}
        type="button"
        className="icon-button"
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(event) => {
          const rectangle = event.currentTarget.getBoundingClientRect();
          if (menuOpen) onCloseMenu();
          else onOpenMenu(rectangle.left - 230, rectangle.bottom + 8);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
  return stickyEl ? createPortal(toolbar, stickyEl) : toolbar;
}
function Document({
  note,
  notes,
  onWiki,
  onCreateNote,
  onUpdateNote,
  timezone,
}: {
  note: Note;
  notes: Note[];
  onWiki: (title: string) => void;
  onCreateNote: (title?: string) => Promise<Note | null>;
  onUpdateNote: (identifier: string, content: string) => void;
  timezone: string;
}) {
  const [input, setInput] = useState<NoteInput>(note);
  const [saved, setSaved] = useState(JSON.stringify(note));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkedTask, setLinkedTask] = useState<Task | null>(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  const folders = useResource<NoteFolder[]>("/note-folders");
  const outgoing = useResource<NoteLink[]>(`/notes/${note.id}/links`);
  const tasks = useResource<Task[]>("/tasks");
  const projects = useResource<Project[]>("/projects");
  const sections = useResource<Section[]>("/sections");
  const labels = useResource<Label[]>("/labels");
  const dirty = JSON.stringify(input) !== saved;
  const titleRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [stickyEl, setStickyEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setStickyEl(document.getElementById("notes-sticky-actions"));
    return () => setStickyEl(null);
  }, []);
  // Sincroniza movimientos externos (arrastrar en el explorador) sin marcar dirty.
  useEffect(() => {
    const external = note.folder_id ?? null;
    setInput((previous) =>
      (previous.folder_id ?? null) === external
        ? previous
        : { ...previous, folder_id: external },
    );
    setSaved((previous) => {
      try {
        const parsed = JSON.parse(previous) as NoteInput;
        if ((parsed.folder_id ?? null) === external) return previous;
        return JSON.stringify({ ...parsed, folder_id: external });
      } catch {
        return previous;
      }
    });
  }, [note.folder_id]);
  const persist = useMemo(
    () =>
      createSaveQueue(async (draft: NoteInput) => {
        setPending(true);
        setError("");
        const {
          title,
          kind,
          content,
          properties,
          nodes,
          edges,
          filter,
          sort,
          folder_id,
        } = draft;
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
          await client.invalidateQueries({
            predicate: (query) =>
              typeof query.queryKey[0] === "string" &&
              /^\/notes\/.+\/(links|backlinks)$/.test(query.queryKey[0]),
          });
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
    if (!dirty || pending || error || deleting) return;
    const timeout = window.setTimeout(() => {
      void persist(input).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [dirty, pending, error, deleting, input, persist]);
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
    if (
      !notes.some((candidate) => candidate.id === title) &&
      (outgoing.isPending || outgoing.isError)
    ) {
      setError(
        "Espera a que se carguen los enlaces antes de abrir una referencia.",
      );
      return;
    }
    const reference = outgoing.data?.find(
      (link) =>
        link.target_title.toLocaleLowerCase() ===
        (title.split("#")[0] ?? title).toLocaleLowerCase(),
    );
    if (reference?.target_deleted) {
      setError(
        "La nota enlazada está en la papelera. Restáurala para abrirla.",
      );
      return;
    }
    if (!dirty || window.confirm("Hay cambios sin guardar. ¿Continuar?"))
      onWiki(reference?.target_note_id ?? title.split("#")[0] ?? title);
  }
  function closeMenu() {
    setMenuPos(null);
    setMoveOpen(false);
  }
  useEffect(() => {
    if (!menuPos) return;
    function onPointerDown(event: PointerEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)
      )
        closeMenu();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuPos]);
  function openMenuAt(x: number, y: number) {
    setMoveOpen(false);
    setMenuPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }
  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    closeMenu();
  }
  async function duplicate() {
    closeMenu();
    if (dirty) await persist(input).catch(() => undefined);
    setPending(true);
    try {
      const created = await api<Note>("/notes", "POST", {
        title: `${input.title} copia`,
        kind: input.kind,
        content: input.content,
        properties: input.properties,
        nodes: input.nodes,
        edges: input.edges,
        filter: input.filter,
        sort: input.sort,
        folder_id: input.folder_id ?? null,
      });
      await client.invalidateQueries({ queryKey: ["/notes"] });
      navigate(`/notes/${created.id}`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  async function moveTo(folderId: string | null) {
    closeMenu();
    const next = { ...input, folder_id: folderId };
    setInput(next);
    await persist(next).catch(() => undefined);
  }
  function exportMarkdown() {
    closeMenu();
    const frontmatter = Object.entries(input.properties)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    const body = [
      `# ${input.title}`,
      frontmatter ? `---\n${frontmatter}\n---` : "",
      input.content,
    ]
      .filter(Boolean)
      .join("\n\n");
    const blob = new Blob([body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${input.title || "nota"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function rename() {
    closeMenu();
    titleRef.current?.focus();
    titleRef.current?.select();
  }
  async function trash() {
    if (
      !window.confirm(
        "¿Mover esta nota a la papelera? Podrás restaurarla después.",
      )
    )
      return;
    setDeleting(true);
    setPending(true);
    try {
      if (dirty) await persist(input);
      await api(`/notes/${note.id}`, "DELETE");
      await client.invalidateQueries({ queryKey: ["/notes"] });
      await client.invalidateQueries({ queryKey: ["/notes?deleted=true"] });
      navigate("/notes/trash");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
      setDeleting(false);
    }
  }
  const statusText = pending
    ? "Guardando…"
    : error
      ? "Error al guardar"
      : dirty
        ? "Cambios sin guardar"
        : "Guardado";
  const folderLabel = (() => {
    if (!input.folder_id) return "";
    const chain: string[] = [];
    const guard = new Set<string>();
    let current: string | null = input.folder_id;
    while (current && !guard.has(current)) {
      guard.add(current);
      const folder = (folders.data ?? []).find(
        (candidate) => candidate.id === current,
      );
      if (!folder) break;
      chain.unshift(folder.name);
      current = folder.parent_id;
    }
    return chain.join("/");
  })();
  const linkedTasks = (tasks.data ?? []).filter((task) =>
    (task.note_ids ?? []).includes(note.id),
  );
  function handleContextMenu(event: React.MouseEvent<HTMLElement>) {
    // Menú contextual propio estilo Obsidian con clic derecho.
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("input, textarea, [contenteditable=true]")
    )
      return;
    event.preventDefault();
    openMenuAt(event.clientX - 230, event.clientY);
  }
  const contextMenu = menuPos ? (
    <div
      ref={menuRef}
      className="explorer-context-menu"
      role="menu"
      aria-label={`Opciones de ${input.title}`}
      style={{ left: menuPos.x, top: menuPos.y, position: "fixed" }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="explorer-context-item"
        onClick={() => void copyText(`[[${input.title}]]`)}
      >
        <span className="explorer-context-icon" aria-hidden="true">
          <Link2 size={14} />
        </span>
        <span>Copiar enlace</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="explorer-context-item"
        onClick={() => void copyText(input.title)}
      >
        <span className="explorer-context-icon" aria-hidden="true">
          <Copy size={14} />
        </span>
        <span>Copiar título</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="explorer-context-item"
        onClick={rename}
      >
        <span className="explorer-context-icon" aria-hidden="true">
          <Pencil size={14} />
        </span>
        <span>Renombrar</span>
      </button>
      <div className="explorer-context-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="explorer-context-item"
        aria-expanded={moveOpen}
        onClick={() => setMoveOpen((open) => !open)}
      >
        <span className="explorer-context-icon" aria-hidden="true">
          <FolderInput size={14} />
        </span>
        <span>Mover archivo a…</span>
      </button>
      {moveOpen && (
        <div
          className="explorer-context-submenu"
          role="menu"
          aria-label="Destino de nota"
        >
          <button
            type="button"
            role="menuitem"
            disabled={(input.folder_id ?? null) === null}
            onClick={() => void moveTo(null)}
          >
            Sin carpeta
          </button>
          {(folders.data ?? []).map((folder) => (
            <button
              key={folder.id}
              type="button"
              role="menuitem"
              disabled={(input.folder_id ?? null) === folder.id}
              onClick={() => void moveTo(folder.id)}
            >
              {folder.name}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        role="menuitem"
        className="explorer-context-item"
        onClick={() => void duplicate()}
      >
        <span className="explorer-context-icon" aria-hidden="true">
          <Copy size={14} />
        </span>
        <span>Hacer una copia</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="explorer-context-item"
        onClick={exportMarkdown}
      >
        <span className="explorer-context-icon" aria-hidden="true">
          <Download size={14} />
        </span>
        <span>Exportar a Markdown</span>
      </button>
      <div className="explorer-context-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="explorer-context-item is-danger"
        onClick={() => {
          closeMenu();
          void trash();
        }}
      >
        <span className="explorer-context-icon" aria-hidden="true">
          <Trash2 size={14} />
        </span>
        <span>Eliminar archivo</span>
      </button>
    </div>
  ) : null;
  const errorBanner = error ? (
    <p role="alert" className="error">
      {error}
    </p>
  ) : null;
  if (input.kind === "canvas")
    return (
      <div
        className="canvas-shell"
        data-unsaved={dirty}
        onContextMenu={handleContextMenu}
      >
        <DocumentToolbar
          stickyEl={stickyEl}
          status={statusText}
          menuOpen={Boolean(menuPos)}
          menuButtonRef={menuButtonRef}
          onOpenMenu={openMenuAt}
          onCloseMenu={closeMenu}
        />
        <CanvasBoard
          input={input}
          notes={notes}
          titleRef={titleRef}
          onChange={setInput}
          onCreateNote={onCreateNote}
          onOpenNote={(identifier) => {
            if (
              !dirty ||
              window.confirm("Hay cambios sin guardar. ¿Abrir otra nota?")
            )
              navigate(`/notes/${identifier}`);
          }}
          onUpdateNote={onUpdateNote}
          onWiki={wiki}
        />
        {contextMenu}
        {errorBanner}
      </div>
    );
  return (
    <article
      className="note-document"
      data-unsaved={dirty}
      onContextMenu={handleContextMenu}
    >
      <DocumentToolbar
        stickyEl={stickyEl}
        status={statusText}
        menuOpen={Boolean(menuPos)}
        menuButtonRef={menuButtonRef}
        onOpenMenu={openMenuAt}
        onCloseMenu={closeMenu}
      />
      {contextMenu}
      {errorBanner}
      <fieldset className="document-fields" disabled={deleting}>
        {folderLabel && (
          <span className="note-folder-badge">{folderLabel}</span>
        )}
        <input
          ref={titleRef}
          className="note-title"
          aria-label="Título de nota"
          value={input.title}
          onChange={(event) =>
            setInput({ ...input, title: event.target.value })
          }
        />
        {input.kind === "note" && (
          <>
            <NoteProperties input={input} notes={notes} onChange={setInput} />
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
      </fieldset>
      {linkedTasks.length > 0 && (
        <section className="note-tasks" aria-label="Tareas vinculadas">
          <h2 className="note-tasks-title">Tareas vinculadas</h2>
          <ul className="note-tasks-list">
            {linkedTasks.map((task) => (
              <li key={task.id}>
                <a
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setLinkedTask(task);
                  }}
                >
                  {task.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {linkedTask && (
        <TaskEditor
          draft={{ task: linkedTask }}
          projects={projects.data ?? []}
          sections={sections.data ?? []}
          labels={labels.data ?? []}
          timezone={timezone}
          onClose={() => setLinkedTask(null)}
        />
      )}
    </article>
  );
}
function propertyIcon(name: string) {
  const key = name.toLowerCase();
  if (key.includes("tag")) return Tag;
  if (key.includes("date") || key.includes("fecha") || key.includes("creation"))
    return Calendar;
  if (
    key.includes("categor") ||
    key.includes("facet") ||
    key.includes("list") ||
    key.includes("type")
  )
    return List;
  if (key.includes("link") || key.includes("url") || key.includes("ref"))
    return Link2;
  return List;
}

function splitMulti(value: string): string[] {
  return value
    .split(/[,;]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Properties block styled like the reference: icon + key + tinted values. */
function NoteProperties({
  input,
  notes,
  onChange,
}: {
  input: NoteInput;
  notes: Note[];
  onChange: (input: NoteInput) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});
  const entries = Object.entries(input.properties);
  const availableNames = useMemo(() => {
    const names = new Set<string>();
    for (const note of notes)
      for (const name of Object.keys(note.properties)) names.add(name);
    return [...names]
      .filter((name) => !Object.hasOwn(input.properties, name))
      .sort((left, right) => left.localeCompare(right));
  }, [notes, input.properties]);

  function setProperty(name: string, value: string) {
    onChange({ ...input, properties: { ...input.properties, [name]: value } });
  }
  function removeProperty(name: string) {
    onChange({
      ...input,
      properties: Object.fromEntries(
        Object.entries(input.properties).filter(([key]) => key !== name),
      ),
    });
  }
  function removeTag(name: string, tag: string) {
    const rest = splitMulti(input.properties[name] ?? "").filter(
      (candidate) => candidate !== tag,
    );
    if (rest.length === 0) removeProperty(name);
    else setProperty(name, rest.join(", "));
  }
  function addTag(name: string) {
    const draft = (tagDraft[name] ?? "").trim();
    if (!draft) return;
    const current = splitMulti(input.properties[name] ?? "");
    if (current.some((c) => c.toLowerCase() === draft.toLowerCase())) return;
    setProperty(name, [...current, draft].join(", "));
    setTagDraft((prev) => ({ ...prev, [name]: "" }));
  }

  return (
    <section className="note-props" aria-label="Propiedades">
      <h2 className="note-props-title">Propiedades</h2>
      <div className="note-props-list">
        {entries.map(([name, value]) => {
          const Icon = propertyIcon(name);
          const isTags = name.toLowerCase() === "tags";
          const isDate =
            name.toLowerCase().includes("date") ||
            name.toLowerCase().includes("creation");
          const multi = isTags ? splitMulti(value) : [];
          return (
            <div className="prop-row" key={name}>
              <span className="prop-key">
                <Icon size={14} aria-hidden="true" />
                <span>{name}</span>
              </span>
              <span className="prop-value">
                {isTags ? (
                  <>
                    {multi.map((tag) => (
                      <span className="prop-pill" key={tag}>
                        {tag}
                        <button
                          type="button"
                          aria-label={`Quitar ${tag}`}
                          onClick={() => removeTag(name, tag)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <input
                      className="prop-inline-input"
                      aria-label={`Añadir etiqueta a ${name}`}
                      placeholder={multi.length === 0 ? "Añadir etiqueta…" : ""}
                      value={tagDraft[name] ?? ""}
                      onChange={(event) =>
                        setTagDraft((prev) => ({
                          ...prev,
                          [name]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addTag(name);
                        }
                      }}
                      onBlur={() => addTag(name)}
                    />
                  </>
                ) : isDate ? (
                  <>
                    <Calendar
                      size={13}
                      aria-hidden="true"
                      className="prop-mini-icon"
                    />
                    <input
                      className="prop-text-input"
                      aria-label={name}
                      value={value}
                      placeholder="YYYY-MM-DD"
                      onChange={(event) =>
                        setProperty(name, event.target.value)
                      }
                    />
                    <Link2
                      size={13}
                      aria-hidden="true"
                      className="prop-mini-icon muted"
                    />
                    <button
                      type="button"
                      className="prop-remove"
                      aria-label={`Quitar propiedad ${name}`}
                      onClick={() => removeProperty(name)}
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      className="prop-text-input"
                      aria-label={name}
                      value={value}
                      placeholder="Sin valor"
                      onChange={(event) =>
                        setProperty(name, event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="prop-remove"
                      aria-label={`Quitar propiedad ${name}`}
                      onClick={() => removeProperty(name)}
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="prop-add-row">
        {adding ? (
          <PropertyPicker
            options={availableNames}
            onSelect={(name) => {
              setProperty(name, "");
              setAdding(false);
            }}
            onClose={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            className="prop-add-button"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} aria-hidden="true" />
            Añadir propiedad
          </button>
        )}
      </div>
    </section>
  );
}
/** Combobox de nombres: busca entre las existentes o crea una nueva si no existe. */
function PropertyPicker({
  options,
  onSelect,
  onClose,
}: {
  options: string[];
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const normalized = trimmed.toLocaleLowerCase();
  const matches = options.filter((name) =>
    name.toLocaleLowerCase().includes(normalized),
  );
  const exists = options.some(
    (name) => name.toLocaleLowerCase() === normalized,
  );
  const choices: { name: string; create: boolean }[] = [
    ...matches.map((name) => ({ name, create: false })),
    ...(trimmed && !exists ? [{ name: trimmed, create: true }] : []),
  ];
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);
  const selected = Math.min(highlight, Math.max(choices.length - 1, 0));
  function choose(index: number) {
    const choice = choices[index];
    if (choice) onSelect(choice.name);
    else onClose();
  }
  return (
    <div className="property-picker" ref={rootRef}>
      <input
        ref={inputRef}
        className="property-picker-input"
        role="combobox"
        aria-label="Añadir propiedad"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="property-picker-options"
        aria-activedescendant={
          choices[selected] ? `property-picker-option-${selected}` : undefined
        }
        placeholder="Nombre de la propiedad…"
        value={query}
        maxLength={200}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((current) =>
              Math.min(current + 1, Math.max(choices.length - 1, 0)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(selected);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <div
        className="custom-select-menu property-picker-menu"
        id="property-picker-options"
        role="listbox"
        aria-label="Propiedades existentes"
      >
        {choices.map((choice, index) => (
          <button
            key={`${choice.create ? "new:" : ""}${choice.name}`}
            id={`property-picker-option-${index}`}
            type="button"
            role="option"
            aria-selected={index === selected}
            className={`custom-select-option ${index === selected ? "is-highlighted" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setHighlight(index)}
            onClick={() => choose(index)}
          >
            <span className="custom-select-option-label">
              {choice.create ? `Crear «${choice.name}»` : choice.name}
            </span>
          </button>
        ))}
        {choices.length === 0 && (
          <p className="custom-select-empty">No hay propiedades existentes.</p>
        )}
      </div>
    </div>
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
        <Dropdown
          ariaLabel="Ordenar base"
          variant="inline"
          value={input.sort}
          searchable={false}
          onChange={(next) =>
            onChange({
              ...input,
              sort: next === "updated_at" ? "updated_at" : "title",
            })
          }
          options={[
            { value: "title", label: "Título A–Z" },
            { value: "updated_at", label: "Última modificación" },
          ]}
        />
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
