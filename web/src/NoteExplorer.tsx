import { useState } from "react";
import { NavLink } from "react-router-dom";
import { FileText, Folder, ChevronDown, ChevronRight } from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import { useQueryClient } from "@tanstack/react-query";
import type { Note, NoteFolder } from "./notes";

/** Displays the database folder tree with explicit keyboard-accessible move controls. */
export function NoteExplorer({ notes, search }: { notes: Note[]; search: string }) {
  const folders = useResource<NoteFolder[]>("/note-folders");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const client = useQueryClient();
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, body);
      await client.invalidateQueries({ queryKey: ["/note-folders"] });
      setName("");
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  const visible = notes.filter((note) => `${note.title} ${note.content}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const allFolders = folders.data ?? [];
  function entries(parentID: string | null) {
    return <>
      {allFolders.filter((folder) => folder.parent_id === parentID).map((folder) =>
        <FolderBranch key={folder.id} folder={folder} folders={allFolders} busy={busy} mutate={mutate}>
          {entries(folder.id)}
        </FolderBranch>)}
      {visible.filter((note) => (note.folder_id ?? null) === parentID).map((note) =>
        <NavLink key={note.id} to={`/notes/${note.id}`} className="explorer-note"><FileText size={14}/><span>{note.title}</span></NavLink>)}
    </>;
  }
  return <div className="note-explorer">
    <details className="folder-create"><summary>+ Carpeta</summary>
      <form onSubmit={(event) => { event.preventDefault(); void mutate("/note-folders", "POST", { name, parent_id: parent || null }); }}>
        <input aria-label="Nombre de carpeta" placeholder="Nombre de carpeta" value={name} onChange={(event) => setName(event.target.value)} maxLength={200}/>
        <select aria-label="Carpeta superior" value={parent} onChange={(event) => setParent(event.target.value)}><option value="">Raíz</option>{allFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
        <button disabled={busy || !name.trim()}>Crear carpeta</button>
      </form>
    </details>
    {error && <p role="alert">{error}</p>}
    {folders.isError && <p role="alert">No se pudieron cargar las carpetas. <button onClick={() => void folders.refetch()}>Reintentar</button></p>}
    {entries(null)}
  </div>;
}

function FolderBranch({ folder, folders, children, busy, mutate }: {
  folder: NoteFolder; folders: NoteFolder[]; children: React.ReactNode; busy: boolean;
  mutate: (path: string, method: string, body?: unknown) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [parent, setParent] = useState(folder.parent_id ?? "");
  return <div className="folder-branch">
    <div className="folder-heading">
      <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<Folder size={14}/>{folder.name}</button>
      <button aria-label={`Editar carpeta ${folder.name}`} onClick={() => setEditing(!editing)}>⋯</button>
    </div>
    {editing && <form onSubmit={(event) => { event.preventDefault(); void mutate(`/note-folders/${folder.id}`, "PUT", { name, parent_id: parent || null }); }}>
      <input aria-label={`Renombrar carpeta ${folder.name}`} value={name} onChange={(event) => setName(event.target.value)}/>
      <select aria-label={`Mover carpeta ${folder.name}`} value={parent} onChange={(event) => setParent(event.target.value)}><option value="">Raíz</option>{folders.filter((candidate) => candidate.id !== folder.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
      <button disabled={busy || !name.trim()}>Aplicar</button>
      <button type="button" disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar la carpeta vacía «${folder.name}»?`)) void mutate(`/note-folders/${folder.id}`, "DELETE"); }}>Eliminar carpeta vacía</button>
    </form>}
    {expanded && <div className="folder-children">{children}</div>}
  </div>;
}

/** Trash restores the same entity identity, including links and folder membership. */
export function NoteTrash({ onRestore }: { onRestore: (identifier: string) => void }) {
  const query = useResource<Note[]>("/notes?deleted=true");
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function restore(identifier: string) {
    setPending(true);
    try {
      await api(`/notes/${identifier}/restore`, "POST", {});
      await client.invalidateQueries({ queryKey: ["/notes"] });
      await client.invalidateQueries({ queryKey: ["/notes?deleted=true"] });
      onRestore(identifier);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }
  return <section className="note-trash"><h1>Papelera</h1>
    <p>Las notas conservan su identidad y sus enlaces al restaurarlas.</p>
    {error && <p role="alert">{error}</p>}
    {query.isError && <p role="alert">No se pudo cargar la papelera.</p>}
    {query.isPending && <p>Cargando…</p>}
    {query.data?.length === 0 && <p>La papelera está vacía.</p>}
    {query.data?.map((note) => <div key={note.id}><span>{note.title}</span><button disabled={pending} onClick={() => void restore(note.id)}>Restaurar {note.title}</button></div>)}
  </section>;
}
