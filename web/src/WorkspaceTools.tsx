import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "./api";
import { Modal } from "./Modal";
import { CommandRegistry, fuzzyScore } from "./commands";
import type { Note } from "./notes";

type ToolMode = "commands" | "switcher" | "search";

/** Keyboard entry points backed by a dynamic command registry and indexed server search. */
export function WorkspaceTools({
  notes,
  onOpen,
  onCreate,
  onTrash,
  compact = false,
  searchSignal = 0,
}: {
  notes: Note[];
  onOpen: (identifier: string) => void;
  onCreate: (title?: string) => Promise<void>;
  onTrash: () => void;
  compact?: boolean;
  searchSignal?: number;
}) {
  const [mode, setMode] = useState<ToolMode | null>(null);
  const [registry] = useState(() => new CommandRegistry());
  useEffect(() => {
    const disposers = [
      registry.register({
        id: "notes.create",
        title: "Crear nota",
        execute: () => onCreate(),
      }),
      registry.register({
        id: "notes.search",
        title: "Buscar en todas las notas",
        shortcut: "Ctrl Shift F",
        execute: () => setMode("search"),
      }),
      registry.register({
        id: "notes.switcher",
        title: "Abrir nota",
        shortcut: "Ctrl O",
        execute: () => setMode("switcher"),
      }),
      registry.register({
        id: "notes.trash",
        title: "Abrir papelera",
        execute: onTrash,
      }),
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, [registry, onCreate, onTrash]);
  useEffect(() => {
    if (searchSignal > 0) setMode("search");
  }, [searchSignal]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        setMode("commands");
      }
      if (key === "o") {
        event.preventDefault();
        setMode("switcher");
      }
      if (key === "f" && event.shiftKey) {
        event.preventDefault();
        setMode("search");
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <>
      {!compact && (
        <div className="workspace-tools">
          <button onClick={() => setMode("switcher")}>
            Abrir nota <kbd>Ctrl O</kbd>
          </button>
          <button onClick={() => setMode("commands")}>
            Comandos <kbd>Ctrl P</kbd>
          </button>
          <button onClick={() => setMode("search")}>Búsqueda global</button>
        </div>
      )}
      {mode && (
        <WorkspacePicker
          key={mode}
          mode={mode}
          registry={registry}
          notes={notes}
          onOpen={onOpen}
          onCreate={onCreate}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}

function WorkspacePicker({
  mode,
  registry,
  notes,
  onOpen,
  onCreate,
  onClose,
}: {
  mode: ToolMode;
  registry: CommandRegistry;
  notes: Note[];
  onOpen: (identifier: string) => void;
  onCreate: (title?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const search = useQuery({
    queryKey: ["/notes/search", debounced],
    queryFn: () =>
      api<Note[]>(`/notes/search?q=${encodeURIComponent(debounced)}`),
    enabled: mode === "search",
  });
  const commands = registry.search(query);
  const matches =
    mode === "search"
      ? (search.data ?? [])
      : notes
          .map((note) => ({ note, score: fuzzyScore(note.title, query) }))
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 100)
          .map((entry) => entry.note);
  const options =
    mode === "commands"
      ? commands.map((command) => ({
          id: command.id,
          label: command.title,
          hint: command.shortcut ?? "",
        }))
      : matches.map((note) => ({
          id: note.id,
          label: note.title,
          hint: note.content.slice(0, 100),
        }));
  const title =
    mode === "commands"
      ? "Paleta de comandos"
      : mode === "switcher"
        ? "Abrir nota"
        : "Búsqueda global";
  async function choose(identifier: string) {
    setPending(true);
    try {
      if (mode === "commands") {
        onClose();
        await registry.run(identifier);
      } else {
        onOpen(identifier);
        onClose();
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  async function create() {
    setPending(true);
    try {
      await onCreate(query.trim());
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="workspace-picker">
        <input
          data-autofocus
          role="combobox"
          aria-label={title}
          aria-expanded="true"
          aria-controls="workspace-options"
          aria-activedescendant={
            options[selected] ? `workspace-option-${selected}` : undefined
          }
          value={query}
          placeholder={
            mode === "search"
              ? 'Palabras, "frase exacta", OR, -excluir'
              : "Escribe para buscar…"
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((current) =>
                Math.min(current + 1, Math.max(0, options.length - 1)),
              );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((current) => Math.max(0, current - 1));
            }
            if (event.key === "Enter" && !pending && options[selected]) {
              event.preventDefault();
              void choose(options[selected].id);
            }
          }}
        />
        {error && <p role="alert">{error}</p>}
        {mode === "search" && search.isFetching && <p>Buscando…</p>}
        {mode === "search" && search.isError && (
          <p role="alert">No se pudo completar la búsqueda.</p>
        )}
        <div
          id="workspace-options"
          role="listbox"
          aria-label="Resultados"
          className="workspace-options"
        >
          {options.map((option, index) => (
            <button
              id={`workspace-option-${index}`}
              key={option.id}
              role="option"
              aria-selected={selected === index}
              disabled={pending}
              onClick={() => void choose(option.id)}
            >
              <span>{option.label}</span>
              <small>{option.hint}</small>
            </button>
          ))}
        </div>
        {!options.length && <p>No hay resultados.</p>}
        {mode === "switcher" &&
          query.trim() &&
          !matches.some(
            (note) =>
              note.title.toLocaleLowerCase() ===
              query.trim().toLocaleLowerCase(),
          ) && (
            <button disabled={pending} onClick={() => void create()}>
              Crear «{query.trim()}»
            </button>
          )}
        {mode === "search" && options.length === 100 && (
          <p>Mostrando los primeros 100 resultados. Afina la búsqueda.</p>
        )}
        <p className="muted">↑ ↓ Seleccionar · Enter Abrir · Esc Cerrar</p>
      </div>
    </Modal>
  );
}
