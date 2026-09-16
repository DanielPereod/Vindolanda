import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Eye,
  ImagePlus,
  type LucideIcon,
} from "lucide-react";
import { wikiMarkdown } from "./notes";
import type { NoteLink } from "./notes";
import { errorMessage } from "./api";
import {
  attachmentMarkdown,
  imageFiles,
  insertTextAtSelection,
  uploadAttachment,
} from "./attachments";
import { MarkdownEditor } from "./MarkdownEditor";

/** Editing surfaces: raw source, inline live preview and read-only rendering. */
type NoteEditorMode = "edit" | "live" | "reading";

const editorModes: { id: NoteEditorMode; label: string; icon: LucideIcon }[] = [
  { id: "edit", label: "Modo fuente", icon: Code2 },
  { id: "live", label: "Vista previa en vivo", icon: Eye },
  { id: "reading", label: "Modo lectura", icon: BookOpen },
];

/** Renders Markdown without executing embedded HTML. */
export function NoteMarkdown({
  content,
  onWiki,
  links,
}: {
  content: string;
  onWiki: (title: string) => void;
  links?: NoteLink[];
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        components={{
          a: ({ href, children }) =>
            href?.startsWith("#/wiki/") ? (
              <button
                className="wiki-link"
                onClick={() => onWiki(decodeURIComponent(href.slice(7)))}
              >
                {children}
              </button>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {wikiMarkdown(content, links)}
      </ReactMarkdown>
    </div>
  );
}

/** Edits a continuous document with native text selection and undo. */
export function NoteEditor({
  content,
  onChange,
  onWiki,
  links,
}: {
  content: string;
  onChange: (content: string) => void;
  onWiki: (title: string) => void;
  links?: NoteLink[];
}) {
  const [mode, setMode] = useState<NoteEditorMode>("edit");
  const [modeMenu, setModeMenu] = useState(false);
  const [outline, setOutline] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const current =
    editorModes.find((option) => option.id === mode) ??
    ({ id: "edit", label: "Modo fuente", icon: Code2 } as const);
  const CurrentIcon = current.icon;
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setModeMenu(false);
        setMode((current) =>
          current === "edit" ? "live" : current === "live" ? "reading" : "edit",
        );
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (!modeMenu) return;
    function onPointerDown(event: PointerEvent) {
      if (
        modeMenuRef.current &&
        !modeMenuRef.current.contains(event.target as Node)
      )
        setModeMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setModeMenu(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [modeMenu]);
  useEffect(() => {
    if (mode !== "edit" || !editor.current) return;
    editor.current.style.height = "auto";
    editor.current.style.height = `${Math.max(480, editor.current.scrollHeight)}px`;
  }, [content, mode]);
  async function attach(files: File[]): Promise<string> {
    const images = imageFiles(files);
    if (images.length === 0) return "";
    setUploading(true);
    setUploadError("");
    try {
      const snippets: string[] = [];
      for (const file of images) {
        const attachment = await uploadAttachment(file);
        snippets.push(attachmentMarkdown(attachment));
      }
      return snippets.join("\n");
    } catch (failure) {
      setUploadError(errorMessage(failure));
      return "";
    } finally {
      setUploading(false);
    }
  }
  function appendSnippet(snippet: string) {
    const separator =
      content.length === 0 || content.endsWith("\n") ? "" : "\n";
    onChange(`${content}${separator}${snippet}`);
  }
  function insertFromDevice(files: FileList | null) {
    if (!files || files.length === 0) return;
    const target = editor.current;
    const start = target?.selectionStart ?? content.length;
    const end = target?.selectionEnd ?? content.length;
    void attach([...files]).then((snippet) => {
      if (!snippet) return;
      if (mode !== "edit" || !target) {
        appendSnippet(snippet);
        return;
      }
      const result = insertTextAtSelection(target.value, start, end, snippet);
      onChange(result.value);
      window.requestAnimationFrame(() => {
        const node = editor.current;
        if (!node) return;
        node.focus();
        const cursor = Math.min(result.cursor, node.value.length);
        node.setSelectionRange(cursor, cursor);
      });
    });
  }
  function pasteIntoSource(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = imageFiles(event.clipboardData?.files);
    if (files.length === 0) return;
    event.preventDefault();
    const base = event.currentTarget.value;
    const start = event.currentTarget.selectionStart;
    const end = event.currentTarget.selectionEnd;
    void attach(files).then((snippet) => {
      if (!snippet) return;
      const result = insertTextAtSelection(base, start, end, snippet);
      onChange(result.value);
      window.requestAnimationFrame(() => {
        const node = editor.current;
        if (!node) return;
        node.focus();
        const cursor = Math.min(result.cursor, node.value.length);
        node.setSelectionRange(cursor, cursor);
      });
    });
  }
  return (
    <section className="continuous-editor">
      <div className="editor-mode-bar">
        <span>Markdown</span>
        <div className="editor-mode-menu" ref={modeMenuRef}>
          <button
            type="button"
            className="editor-mode-trigger"
            aria-label="Cambiar modo de vista"
            aria-haspopup="menu"
            aria-expanded={modeMenu}
            onClick={() => setModeMenu((open) => !open)}
          >
            <CurrentIcon size={14} aria-hidden="true" />
            <span>{current.label}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {modeMenu && (
            <div
              className="editor-mode-popover"
              role="menu"
              aria-label="Modo de vista"
            >
              {editorModes.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === option.id}
                    className="editor-mode-item"
                    onClick={() => {
                      setMode(option.id);
                      setModeMenu(false);
                    }}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{option.label}</span>
                    {mode === option.id && (
                      <Check
                        size={14}
                        aria-hidden="true"
                        className="editor-mode-check"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          className="editor-attach-button"
          aria-label="Añadir imagen"
          title="Añadir imagen"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={14} aria-hidden="true" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            insertFromDevice(event.target.files);
            event.target.value = "";
          }}
        />
        <kbd>Ctrl E</kbd>
      </div>
      <div className="editor-surface">
        <div className="editor-page">
          {mode === "reading" ? (
            <NoteMarkdown content={content} onWiki={onWiki} links={links} />
          ) : mode === "live" ? (
            <MarkdownEditor
              content={content}
              onChange={onChange}
              onWiki={onWiki}
              onPasteFiles={attach}
            />
          ) : (
            <textarea
              ref={editor}
              className="continuous-source"
              aria-label="Contenido Markdown"
              placeholder="Empieza a escribir… Usa [[ para enlazar tus ideas."
              spellCheck
              value={content}
              onChange={(event) => onChange(event.target.value)}
              onPaste={pasteIntoSource}
            />
          )}
        </div>
        <aside className="document-outline">
          <button aria-expanded={outline} onClick={() => setOutline(!outline)}>
            Esquema {outline ? "−" : "+"}
          </button>
          {outline && (
            <p className="muted">
              {mode === "reading"
                ? "Vista de lectura"
                : mode === "live"
                  ? "Vista previa en vivo"
                  : "Documento Markdown"}
            </p>
          )}
          {outline &&
            content.split("\n").map((line, index, lines) => {
              const heading = /^(#{1,6})\s+(.+)/u.exec(line);
              if (!heading) return null;
              return (
                <button
                  key={index}
                  style={{ paddingLeft: `${(heading[1]?.length ?? 1) * 8}px` }}
                  onClick={() => {
                    setMode("edit");
                    const offset = lines
                      .slice(0, index)
                      .reduce((total, value) => total + value.length + 1, 0);
                    window.requestAnimationFrame(() => {
                      editor.current?.focus();
                      editor.current?.setSelectionRange(
                        offset,
                        offset + line.length,
                      );
                    });
                  }}
                >
                  {heading[2]}
                </button>
              );
            })}
        </aside>
      </div>
      <footer className="editor-status">
        {content.trim() ? content.trim().split(/\s+/u).length : 0} palabras ·{" "}
        {content.length} caracteres
        {uploading && <span role="status"> · Subiendo imagen…</span>}
        {uploadError && (
          <span role="alert" className="editor-upload-error">
            {" "}
            · {uploadError}
          </span>
        )}
      </footer>
    </section>
  );
}
