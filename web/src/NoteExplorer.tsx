import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  ArrowUpRight,
  Copy,
  FilePlus2,
  FileText,
  FolderInput,
  FolderOpen,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Link2,
  Network,
  Pencil,
  RotateCcw,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import { Modal } from "./Modal";
import { useQueryClient } from "@tanstack/react-query";
import type { Note, NoteFolder } from "./notes";

type ExplorerDialog =
  | { kind: "create-folder"; parentId: string | null }
  | { kind: "rename-note"; noteId: string; initial: string }
  | { kind: "rename-folder"; folderId: string; initial: string }
  | { kind: "delete-note"; noteId: string; title: string }
  | { kind: "delete-folder"; folderId: string; name: string };

type MenuTarget =
  | { kind: "note"; noteId: string; x: number; y: number }
  | { kind: "folder"; folderId: string; x: number; y: number }
  | { kind: "empty"; x: number; y: number };

/** Every folder at or below the given root, used to reject cyclic drag moves. */
function folderSubtree(folders: NoteFolder[], rootId: string): Set<string> {
  const result = new Set<string>([rootId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const candidate of folders) {
      if (
        candidate.parent_id &&
        result.has(candidate.parent_id) &&
        !result.has(candidate.id)
      ) {
        result.add(candidate.id);
        expanded = true;
      }
    }
  }
  return result;
}

/** Explorador con organización orgánica: arrastra notas y carpetas o usa clic derecho. */
export function NoteExplorer({
  notes,
  onSearch,
  onCreateDocument,
}: {
  notes: Note[];
  onSearch: () => void;
  onCreateDocument: (
    kind: "note" | "base" | "canvas",
    folderId: string | null,
  ) => void;
}) {
  const folders = useResource<NoteFolder[]>("/note-folders");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [dialog, setDialog] = useState<ExplorerDialog | null>(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const allFolders = folders.data ?? [];

  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, body);
      await client.invalidateQueries({ queryKey: ["/note-folders"] });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function moveNote(target: Note, folderId: string | null) {
    if ((target.folder_id ?? null) === folderId) return;
    setMoveError("");
    const previous = notes;
    client.setQueryData<Note[]>(["/notes"], (old) =>
      old?.map((candidate) =>
        candidate.id === target.id
          ? { ...candidate, folder_id: folderId }
          : candidate,
      ),
    );
    try {
      const { title, kind, content, properties, nodes, edges, filter, sort } =
        target;
      const updated = await api<Note>(`/notes/${target.id}`, "PUT", {
        title,
        kind,
        content,
        properties,
        nodes,
        edges,
        filter,
        sort,
        folder_id: folderId,
      });
      client.setQueryData<Note[]>(["/notes"], (old) =>
        old?.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
    } catch (failure) {
      client.setQueryData(["/notes"], previous);
      setMoveError(errorMessage(failure));
    } finally {
      void client.invalidateQueries({ queryKey: ["/notes"] });
    }
  }

  async function moveFolder(target: NoteFolder, parentId: string | null) {
    if ((target.parent_id ?? null) === parentId) return;
    setMoveError("");
    const previous = allFolders;
    client.setQueryData<NoteFolder[]>(["/note-folders"], (old) =>
      old?.map((candidate) =>
        candidate.id === target.id
          ? { ...candidate, parent_id: parentId }
          : candidate,
      ),
    );
    try {
      const updated = await api<NoteFolder>(
        `/note-folders/${target.id}`,
        "PUT",
        { name: target.name, parent_id: parentId },
      );
      client.setQueryData<NoteFolder[]>(["/note-folders"], (old) =>
        old?.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
    } catch (failure) {
      client.setQueryData(["/note-folders"], previous);
      setMoveError(errorMessage(failure));
    } finally {
      void client.invalidateQueries({ queryKey: ["/note-folders"] });
    }
  }

  function dragStart(event: DragStartEvent) {
    const raw = String(event.active.id);
    if (raw.startsWith("note:") || raw.startsWith("folder:"))
      setActiveDrag(raw);
  }

  function dragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    if (!event.over) return;
    const rawOver = String(event.over.id);
    if (!rawOver.startsWith("folder:")) return;
    const parentId =
      rawOver === "folder:root" ? null : rawOver.slice("folder:".length);
    const rawActive = String(event.active.id);
    if (rawActive.startsWith("note:")) {
      const target = notes.find(
        (note) => note.id === rawActive.slice("note:".length),
      );
      if (target) void moveNote(target, parentId);
      return;
    }
    if (rawActive.startsWith("folder:")) {
      const folderId = rawActive.slice("folder:".length);
      const target = allFolders.find((folder) => folder.id === folderId);
      if (!target) return;
      if (
        parentId !== null &&
        folderSubtree(allFolders, folderId).has(parentId)
      )
        return;
      void moveFolder(target, parentId);
    }
  }

  const activeNote = activeDrag?.startsWith("note:")
    ? (notes.find((note) => note.id === activeDrag.slice("note:".length)) ??
      null)
    : null;
  const activeFolder = activeDrag?.startsWith("folder:")
    ? (allFolders.find(
        (folder) => folder.id === activeDrag.slice("folder:".length),
      ) ?? null)
    : null;

  function openMenu(target: MenuTarget) {
    setMenu(target);
  }

  function closeMenu() {
    setMenu(null);
  }

  function createDocument(
    kind: "note" | "base" | "canvas",
    folderId: string | null,
  ) {
    closeMenu();
    onCreateDocument(kind, folderId);
  }

  function createFolderHere(parentId: string | null) {
    closeMenu();
    setDialog({ kind: "create-folder", parentId });
  }

  async function confirmCreateFolder(name: string) {
    const target = dialog;
    if (!target || target.kind !== "create-folder") return;
    setDialog(null);
    await mutate("/note-folders", "POST", {
      name: name.trim().slice(0, 200),
      parent_id: target.parentId,
    });
  }

  async function duplicateNote(noteId: string) {
    const target = notes.find((candidate) => candidate.id === noteId);
    closeMenu();
    if (!target) return;
    setBusy(true);
    try {
      const created = await api<Note>("/notes", "POST", {
        title: `${target.title} copia`,
        kind: target.kind,
        content: target.content,
        properties: target.properties,
        nodes: target.nodes,
        edges: target.edges,
        filter: target.filter,
        sort: target.sort,
        folder_id: target.folder_id ?? null,
      });
      await client.invalidateQueries({ queryKey: ["/notes"] });
      navigate(`/notes/${created.id}`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function duplicateFolder(folderId: string) {
    const target = allFolders.find((folder) => folder.id === folderId);
    closeMenu();
    if (!target) return;
    await mutate("/note-folders", "POST", {
      name: `${target.name} copia`.slice(0, 200),
      parent_id: target.parent_id,
    });
  }

  function requestRenameNote(noteId: string) {
    const target = notes.find((candidate) => candidate.id === noteId);
    closeMenu();
    if (!target) return;
    setDialog({ kind: "rename-note", noteId, initial: target.title });
  }

  async function confirmRenameNote(title: string) {
    const current = dialog;
    if (!current || current.kind !== "rename-note") return;
    const target = notes.find((candidate) => candidate.id === current.noteId);
    if (!target) {
      setDialog(null);
      return;
    }
    const next = title.trim();
    if (!next || next === target.title) {
      setDialog(null);
      return;
    }
    setDialog(null);
    setBusy(true);
    try {
      await api<Note>(`/notes/${target.id}`, "PUT", {
        title: next,
        kind: target.kind,
        content: target.content,
        properties: target.properties,
        nodes: target.nodes,
        edges: target.edges,
        filter: target.filter,
        sort: target.sort,
        folder_id: target.folder_id ?? null,
      });
      await client.invalidateQueries({ queryKey: ["/notes"] });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function requestRenameFolder(folderId: string) {
    const target = allFolders.find((folder) => folder.id === folderId);
    closeMenu();
    if (!target) return;
    setDialog({ kind: "rename-folder", folderId, initial: target.name });
  }

  async function confirmRenameFolder(name: string) {
    const current = dialog;
    if (!current || current.kind !== "rename-folder") return;
    const target = allFolders.find((folder) => folder.id === current.folderId);
    if (!target) {
      setDialog(null);
      return;
    }
    const next = name.trim().slice(0, 200);
    if (!next || next === target.name) {
      setDialog(null);
      return;
    }
    setDialog(null);
    await mutate(`/note-folders/${current.folderId}`, "PUT", {
      name: next,
      parent_id: target.parent_id,
    });
  }

  function requestDeleteNote(noteId: string) {
    const target = notes.find((candidate) => candidate.id === noteId);
    closeMenu();
    if (!target) return;
    setDialog({ kind: "delete-note", noteId, title: target.title });
  }

  async function confirmDeleteNote() {
    const current = dialog;
    if (!current || current.kind !== "delete-note") return;
    setDialog(null);
    setBusy(true);
    try {
      await api(`/notes/${current.noteId}`, "DELETE");
      await client.invalidateQueries({ queryKey: ["/notes"] });
      await client.invalidateQueries({ queryKey: ["/notes?deleted=true"] });
      if (window.location.pathname.endsWith(current.noteId)) navigate("/notes");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteFolder(folderId: string) {
    const target = allFolders.find((folder) => folder.id === folderId);
    closeMenu();
    if (!target) return;
    setDialog({ kind: "delete-folder", folderId, name: target.name });
  }

  async function confirmDeleteFolder() {
    const current = dialog;
    if (!current || current.kind !== "delete-folder") return;
    setDialog(null);
    await mutate(`/note-folders/${current.folderId}`, "DELETE");
  }

  function folderPath(folderId: string | null): string {
    if (!folderId) return "";
    const chain: string[] = [];
    let current: string | null = folderId;
    const guard = new Set<string>();
    while (current && !guard.has(current)) {
      guard.add(current);
      const folder = allFolders.find((candidate) => candidate.id === current);
      if (!folder) break;
      chain.unshift(folder.name);
      current = folder.parent_id;
    }
    return chain.join("/");
  }

  async function copyText(text: string) {
    closeMenu();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  function focusGlobalSearch() {
    closeMenu();
    onSearch();
  }

  function revealFolder(folderId: string) {
    closeMenu();
    requestAnimationFrame(() => {
      document
        .getElementById(`folder-heading-${folderId}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function entries(parentID: string | null) {
    return (
      <>
        {allFolders
          .filter((folder) => folder.parent_id === parentID)
          .map((folder) => (
            <FolderBranch
              key={folder.id}
              folder={folder}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openMenu({
                  kind: "folder",
                  folderId: folder.id,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
            >
              {entries(folder.id)}
            </FolderBranch>
          ))}
        {notes
          .filter((note) => (note.folder_id ?? null) === parentID)
          .map((note) => (
            <DraggableNote
              key={note.id}
              note={note}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openMenu({
                  kind: "note",
                  noteId: note.id,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
            />
          ))}
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={dragStart}
      onDragCancel={() => setActiveDrag(null)}
      onDragEnd={dragEnd}
    >
      <div
        className="note-explorer"
        onContextMenu={(event) => {
          const interactive = (event.target as HTMLElement).closest(
            ".explorer-note-row, .folder-heading, .explorer-context-menu",
          );
          if (interactive) return;
          event.preventDefault();
          openMenu({ kind: "empty", x: event.clientX, y: event.clientY });
        }}
      >
        <div className="explorer-toolbar">
          <div className="explorer-actions">
            <button
              type="button"
              aria-label="Buscar notas"
              title="Buscar"
              onClick={onSearch}
            >
              <Search size={15} />
            </button>
            <button
              type="button"
              aria-label="Nota"
              title="Nueva nota"
              disabled={busy}
              onClick={() => createDocument("note", null)}
            >
              <FilePlus2 size={15} />
            </button>
            <button
              type="button"
              aria-label="Carpeta"
              title="Nueva carpeta"
              disabled={busy}
              onClick={() => createFolderHere(null)}
            >
              <FolderPlus size={15} />
            </button>
            <button
              type="button"
              aria-label="Canvas"
              title="Nuevo lienzo"
              disabled={busy}
              onClick={() => createDocument("canvas", null)}
            >
              <Network size={15} />
            </button>
            <button
              type="button"
              aria-label="Base"
              title="Nueva base"
              disabled={busy}
              onClick={() => createDocument("base", null)}
            >
              <Table2 size={15} />
            </button>
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        {moveError && <p role="alert">{moveError}</p>}
        {folders.isError && (
          <p role="alert">
            No se pudieron cargar las carpetas.{" "}
            <button onClick={() => void folders.refetch()}>Reintentar</button>
          </p>
        )}
        <RootDropZone>{entries(null)}</RootDropZone>
        <DragOverlay dropAnimation={null}>
          {activeFolder ? (
            <div className="explorer-drag-preview">
              <GripVertical size={14} />
              <FolderOpen size={14} />
              <span>{activeFolder.name}</span>
            </div>
          ) : activeNote ? (
            <div className="explorer-drag-preview">
              <GripVertical size={14} />
              <FileText size={14} />
              <span>{activeNote.title}</span>
            </div>
          ) : null}
        </DragOverlay>
        {menu && (
          <ExplorerContextMenu
            target={menu}
            notes={notes}
            folders={allFolders}
            busy={busy}
            onClose={closeMenu}
            onCreateDocument={(kind, folderId) =>
              createDocument(kind, folderId)
            }
            onCreateFolder={(parentId) => createFolderHere(parentId)}
            onDuplicateNote={(noteId) => void duplicateNote(noteId)}
            onDuplicateFolder={(folderId) => void duplicateFolder(folderId)}
            onMoveNote={(noteId, folderId) => {
              const target = notes.find((note) => note.id === noteId);
              closeMenu();
              if (target) void moveNote(target, folderId);
            }}
            onMoveFolder={(folderId, parentId) => {
              const target = allFolders.find(
                (folder) => folder.id === folderId,
              );
              closeMenu();
              if (target)
                void mutate(`/note-folders/${folderId}`, "PUT", {
                  name: target.name,
                  parent_id: parentId,
                });
            }}
            onRenameNote={(noteId) => requestRenameNote(noteId)}
            onRenameFolder={(folderId) => requestRenameFolder(folderId)}
            onDeleteNote={(noteId) => requestDeleteNote(noteId)}
            onDeleteFolder={(folderId) => requestDeleteFolder(folderId)}
            onCopyPath={(text) => void copyText(text)}
            onSearchInFolder={() => focusGlobalSearch()}
            onRevealFolder={(folderId) => revealFolder(folderId)}
            folderPath={folderPath}
          />
        )}
        {dialog?.kind === "create-folder" && (
          <ExplorerPromptDialog
            title="Nueva carpeta"
            label="Nombre de la carpeta"
            placeholder="Nombre de la carpeta"
            submitLabel="Crear carpeta"
            busy={busy}
            onClose={() => setDialog(null)}
            onSubmit={(value) => void confirmCreateFolder(value)}
          />
        )}
        {dialog?.kind === "rename-note" && (
          <ExplorerPromptDialog
            title="Renombrar nota"
            label="Título de la nota"
            submitLabel="Renombrar"
            initial={dialog.initial}
            busy={busy}
            onClose={() => setDialog(null)}
            onSubmit={(value) => void confirmRenameNote(value)}
          />
        )}
        {dialog?.kind === "rename-folder" && (
          <ExplorerPromptDialog
            title="Renombrar carpeta"
            label="Nombre de la carpeta"
            submitLabel="Renombrar"
            initial={dialog.initial}
            busy={busy}
            onClose={() => setDialog(null)}
            onSubmit={(value) => void confirmRenameFolder(value)}
          />
        )}
        {dialog?.kind === "delete-note" && (
          <ExplorerConfirmDialog
            title="Mover a la papelera"
            description={`¿Mover «${dialog.title}» a la papelera? Podrás restaurarla después.`}
            confirmLabel="Mover a la papelera"
            busy={busy}
            onClose={() => setDialog(null)}
            onConfirm={() => void confirmDeleteNote()}
          />
        )}
        {dialog?.kind === "delete-folder" && (
          <ExplorerConfirmDialog
            title="Eliminar carpeta"
            description={`¿Eliminar la carpeta vacía «${dialog.name}»?`}
            confirmLabel="Eliminar"
            busy={busy}
            onClose={() => setDialog(null)}
            onConfirm={() => void confirmDeleteFolder()}
          />
        )}
      </div>
    </DndContext>
  );
}

function ExplorerPromptDialog({
  title,
  label,
  initial = "",
  placeholder,
  submitLabel,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSubmit(value);
        }}
      >
        <label>
          {label}
          <input
            data-autofocus
            aria-label={label}
            placeholder={placeholder ?? initial}
            value={value}
            maxLength={200}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <footer className="form-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !value.trim()}
          >
            {submitLabel}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function ExplorerConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="editor">
        <p>{description}</p>
        <footer className="form-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function DraggableNote({
  note,
  onContextMenu,
}: {
  note: Note;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `note:${note.id}`,
    data: { type: "note", noteId: note.id },
  });
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === `/notes/${note.id}`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`explorer-note-row${active ? " active" : ""}${
        isDragging ? " is-dragging" : ""
      }`}
      title="Arrastra para mover · Clic derecho para opciones"
      aria-current={active ? "page" : undefined}
      onContextMenu={onContextMenu}
      onClick={(event) => {
        if (isDragging) {
          event.preventDefault();
          return;
        }
        navigate(`/notes/${note.id}`);
      }}
      {...listeners}
      {...attributes}
    >
      <span>{note.title}</span>
    </button>
  );
}

/** Root target: dropping on it (empty area or a top-level row) detaches items from their parent. */
function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({
    id: "folder:root",
    data: { type: "folder", folderId: null },
  });
  return (
    <div ref={setNodeRef} className="explorer-root-drop">
      {children}
    </div>
  );
}

function FolderBranch({
  folder,
  children,
  onContextMenu,
}: {
  folder: NoteFolder;
  children: React.ReactNode;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `folder:${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    isDragging,
  } = useDraggable({
    id: `folder:${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });
  useEffect(() => {
    if (isOver) setExpanded(true);
  }, [isOver]);
  return (
    <div
      ref={setDropNodeRef}
      className={`folder-branch${isOver ? " is-over" : ""}${
        isDragging ? " is-dragging" : ""
      }`}
    >
      <div
        ref={setDragNodeRef}
        className="folder-heading"
        id={`folder-heading-${folder.id}`}
        onContextMenu={onContextMenu}
        title="Arrastra para mover · Clic derecho para opciones"
        {...listeners}
        {...attributes}
      >
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{folder.name}</span>
        </button>
      </div>
      {expanded && <div className="folder-children">{children}</div>}
    </div>
  );
}

function ExplorerContextMenu({
  target,
  notes,
  folders,
  busy,
  onClose,
  onCreateDocument,
  onCreateFolder,
  onDuplicateNote,
  onDuplicateFolder,
  onMoveNote,
  onMoveFolder,
  onRenameNote,
  onRenameFolder,
  onDeleteNote,
  onDeleteFolder,
  onCopyPath,
  onSearchInFolder,
  onRevealFolder,
  folderPath,
}: {
  target: MenuTarget;
  notes: Note[];
  folders: NoteFolder[];
  busy: boolean;
  onClose: () => void;
  onCreateDocument: (
    kind: "note" | "base" | "canvas",
    folderId: string | null,
  ) => void;
  onCreateFolder: (parentId: string | null) => void;
  onDuplicateNote: (noteId: string) => void;
  onDuplicateFolder: (folderId: string) => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
  onRenameNote: (noteId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onCopyPath: (text: string) => void;
  onSearchInFolder: () => void;
  onRevealFolder: (folderId: string) => void;
  folderPath: (folderId: string | null) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [position, setPosition] = useState({ x: target.x, y: target.y });

  const note =
    target.kind === "note" ? notes.find((n) => n.id === target.noteId) : null;
  const folder =
    target.kind === "folder"
      ? folders.find((f) => f.id === target.folderId)
      : null;
  const contextFolderId =
    target.kind === "folder"
      ? target.folderId
      : target.kind === "note"
        ? (note?.folder_id ?? null)
        : null;

  const descendants = useMemo(
    () =>
      target.kind === "folder"
        ? folderSubtree(folders, target.folderId)
        : new Set<string>(),
    [folders, target],
  );

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onScroll() {
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("contextmenu", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("contextmenu", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
    };
  }, [onClose]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition((previous) => ({
      x: Math.min(previous.x, window.innerWidth - rect.width - 8),
      y: Math.min(previous.y, window.innerHeight - rect.height - 8),
    }));
    const first = element.querySelector<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    first?.focus();
  }, []);

  const moveTargets = folders.filter(
    (candidate) => !descendants.has(candidate.id),
  );

  return (
    <div
      ref={ref}
      className="explorer-context-menu"
      role="menu"
      aria-label={
        target.kind === "folder"
          ? `Opciones de carpeta ${folder?.name ?? ""}`
          : target.kind === "note"
            ? `Opciones de nota ${note?.title ?? ""}`
            : "Opciones del explorador"
      }
      style={{ left: Math.max(8, position.x), top: Math.max(8, position.y) }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {(target.kind === "folder" || target.kind === "empty") && (
        <>
          <MenuItem
            icon={<FilePlus2 size={14} />}
            label="Nueva nota"
            disabled={busy}
            onSelect={() =>
              onCreateDocument(
                "note",
                target.kind === "folder" ? target.folderId : null,
              )
            }
          />
          <MenuItem
            icon={<FolderPlus size={14} />}
            label="Nueva carpeta"
            disabled={busy}
            onSelect={() =>
              onCreateFolder(target.kind === "folder" ? target.folderId : null)
            }
          />
          <MenuItem
            icon={<Network size={14} />}
            label="Nuevo lienzo"
            disabled={busy}
            onSelect={() =>
              onCreateDocument(
                "canvas",
                target.kind === "folder" ? target.folderId : null,
              )
            }
          />
          <MenuItem
            icon={<Table2 size={14} />}
            label="Nueva base"
            disabled={busy}
            onSelect={() =>
              onCreateDocument(
                "base",
                target.kind === "folder" ? target.folderId : null,
              )
            }
          />
          <MenuSeparator />
        </>
      )}

      {target.kind === "folder" && folder && (
        <>
          <MenuItem
            icon={<Copy size={14} />}
            label="Hacer una copia"
            disabled={busy}
            onSelect={() => onDuplicateFolder(folder.id)}
          />
          <div className="explorer-context-submenu-wrap">
            <MenuItem
              icon={<FolderInput size={14} />}
              label="Mover carpeta a…"
              hasArrow
              onSelect={() => setMoveOpen((open) => !open)}
            />
            {moveOpen && (
              <div
                className="explorer-context-submenu"
                role="menu"
                aria-label="Destino de carpeta"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy || folder.parent_id === null}
                  onClick={() => onMoveFolder(folder.id, null)}
                >
                  Raíz
                </button>
                {moveTargets.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="menuitem"
                    disabled={busy || candidate.id === folder.parent_id}
                    onClick={() => onMoveFolder(folder.id, candidate.id)}
                  >
                    {folderPath(candidate.id) || candidate.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <MenuItem
            icon={<Search size={14} />}
            label="Buscar en la carpeta"
            onSelect={onSearchInFolder}
          />
          <MenuSeparator />
          <MenuItem
            icon={<Link2 size={14} />}
            label="Copiar ruta"
            onSelect={() => onCopyPath(folderPath(folder.id) || folder.name)}
          />
          <MenuItem
            icon={<FolderOpen size={14} />}
            label="Mostrar en carpeta"
            onSelect={() => onRevealFolder(folder.id)}
          />
          <MenuSeparator />
          <MenuItem
            icon={<Pencil size={14} />}
            label="Renombrar"
            disabled={busy}
            onSelect={() => onRenameFolder(folder.id)}
          />
          <MenuItem
            icon={<Trash2 size={14} />}
            label="Borrar"
            danger
            disabled={busy}
            onSelect={() => onDeleteFolder(folder.id)}
          />
        </>
      )}

      {target.kind === "note" && note && (
        <>
          <MenuItem
            icon={<Copy size={14} />}
            label="Hacer una copia"
            disabled={busy}
            onSelect={() => onDuplicateNote(note.id)}
          />
          <div className="explorer-context-submenu-wrap">
            <MenuItem
              icon={<FolderInput size={14} />}
              label="Mover a…"
              hasArrow
              onSelect={() => setMoveOpen((open) => !open)}
            />
            {moveOpen && (
              <div
                className="explorer-context-submenu"
                role="menu"
                aria-label="Destino de nota"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={(note.folder_id ?? null) === null}
                  onClick={() => onMoveNote(note.id, null)}
                >
                  Sin carpeta
                </button>
                {folders.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="menuitem"
                    disabled={(note.folder_id ?? null) === candidate.id}
                    onClick={() => onMoveNote(note.id, candidate.id)}
                  >
                    {folderPath(candidate.id) || candidate.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <MenuItem
            icon={<Link2 size={14} />}
            label="Copiar ruta"
            onSelect={() =>
              onCopyPath(
                [folderPath(note.folder_id ?? null), note.title]
                  .filter(Boolean)
                  .join("/"),
              )
            }
          />
          <MenuItem
            icon={<ArrowUpRight size={14} />}
            label="Copiar enlace"
            onSelect={() => onCopyPath(`[[${note.title}]]`)}
          />
          <MenuSeparator />
          <MenuItem
            icon={<Pencil size={14} />}
            label="Renombrar"
            disabled={busy}
            onSelect={() => onRenameNote(note.id)}
          />
          <MenuItem
            icon={<Trash2 size={14} />}
            label="Borrar"
            danger
            disabled={busy}
            onSelect={() => onDeleteNote(note.id)}
          />
        </>
      )}

      {target.kind === "empty" && contextFolderId === null && (
        <p className="explorer-context-hint">
          Clic derecho en una carpeta para moverla, renombrarla o borrarla.
        </p>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  disabled,
  hasArrow,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  hasArrow?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`explorer-context-item${danger ? " is-danger" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="explorer-context-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      {hasArrow && (
        <span className="explorer-context-arrow" aria-hidden="true">
          <ChevronRight size={13} />
        </span>
      )}
    </button>
  );
}

function MenuSeparator() {
  return <div className="explorer-context-separator" role="separator" />;
}

/** Trash restores the same entity identity, including links and folder membership. */
export function NoteTrash({
  onRestore,
}: {
  onRestore: (identifier: string) => void;
}) {
  const query = useResource<Note[]>("/notes?deleted=true");
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<string | null | undefined>(
    undefined,
  );
  async function restore(identifier: string) {
    setPending(true);
    setError("");
    try {
      await api(`/notes/${identifier}/restore`, "POST", {});
      await client.invalidateQueries({ queryKey: ["/notes"] });
      await client.invalidateQueries({ queryKey: ["/notes?deleted=true"] });
      onRestore(identifier);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  async function purge(identifier?: string) {
    setPurgeTarget(undefined);
    setPending(true);
    setError("");
    try {
      await api(
        identifier ? `/notes/${identifier}/permanent` : "/notes/trash",
        "DELETE",
      );
      await client.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("/notes"),
      });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  const kindIcons = { note: FileText, base: Table2, canvas: Network } as const;
  return (
    <section className="note-trash">
      <header className="note-trash-header">
        <h1>Papelera</h1>
        <p className="muted">
          Las notas conservan su identidad y sus enlaces al restaurarlas.
        </p>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {query.isError && (
        <p role="alert" className="error">
          No se pudo cargar la papelera.
        </p>
      )}
      {query.isPending && <p className="note-trash-empty">Cargando…</p>}
      {query.data?.length === 0 && (
        <p className="note-trash-empty">La papelera está vacía.</p>
      )}
      {Boolean(query.data?.length) && (
        <div className="note-trash-toolbar">
          <button
            type="button"
            className="danger-button"
            disabled={pending}
            onClick={() => setPurgeTarget(null)}
          >
            <Trash2 size={14} aria-hidden="true" />
            Vaciar papelera
          </button>
        </div>
      )}
      <ul className="note-trash-list">
        {query.data?.map((note) => {
          const Icon = kindIcons[note.kind] ?? FileText;
          return (
            <li key={note.id} className="note-trash-item">
              <span className="note-trash-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <div className="note-trash-meta">
                <span className="note-trash-title" title={note.title}>
                  {note.title}
                </span>
                <span className="note-trash-facts">
                  {note.deleted_at
                    ? `Eliminada el ${new Date(note.deleted_at).toLocaleDateString("es-ES")}`
                    : "Eliminada"}
                </span>
              </div>
              <div className="note-trash-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={pending}
                  aria-label={`Restaurar ${note.title}`}
                  onClick={() => void restore(note.id)}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Restaurar
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={pending}
                  aria-label={`Eliminar definitivamente ${note.title}`}
                  onClick={() => setPurgeTarget(note.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Eliminar definitivamente
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {purgeTarget !== undefined && (
        <ExplorerConfirmDialog
          title={purgeTarget ? "Eliminar definitivamente" : "Vaciar papelera"}
          description={
            purgeTarget
              ? "¿Eliminar definitivamente esta nota? No podrás recuperarla."
              : "¿Vaciar la papelera? Las notas se eliminarán definitivamente."
          }
          confirmLabel={
            purgeTarget ? "Eliminar definitivamente" : "Vaciar papelera"
          }
          busy={pending}
          onClose={() => setPurgeTarget(undefined)}
          onConfirm={() => void purge(purgeTarget ?? undefined)}
        />
      )}
    </section>
  );
}
