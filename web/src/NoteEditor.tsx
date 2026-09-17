import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
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

/** Editing surfaces: inline live preview, raw source and read-only rendering. */
export type NoteViewMode = "live" | "source" | "reading";

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
  view,
  onToggleReading,
  onRevealSource,
}: {
  content: string;
  onChange: (content: string) => void;
  onWiki: (title: string) => void;
  links?: NoteLink[];
  view: NoteViewMode;
  onToggleReading: () => void;
  onRevealSource: () => void;
}) {
  const [outline, setOutline] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const toggleReading = useRef(onToggleReading);
  useEffect(() => {
    toggleReading.current = onToggleReading;
  });
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        toggleReading.current();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (view !== "source" || !editor.current) return;
    editor.current.style.height = "auto";
    editor.current.style.height = `${Math.max(480, editor.current.scrollHeight)}px`;
  }, [content, view]);
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
      <div className="editor-surface">
        <div className="editor-page">
          {view === "reading" ? (
            <NoteMarkdown content={content} onWiki={onWiki} links={links} />
          ) : view === "live" ? (
            <MarkdownEditor
              content={content}
              onChange={onChange}
              onWiki={onWiki}
              onPasteFiles={attach}
              ariaLabel="Contenido Markdown"
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
              {view === "reading"
                ? "Vista de lectura"
                : view === "live"
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
                    onRevealSource();
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
