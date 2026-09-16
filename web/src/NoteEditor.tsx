import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { wikiMarkdown } from "./notes";
import type { NoteLink } from "./notes";

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
  const [reading, setReading] = useState(false);
  const [outline, setOutline] = useState(true);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setReading((value) => !value);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (!editor.current) return;
    editor.current.style.height = "auto";
    editor.current.style.height = `${Math.max(480, editor.current.scrollHeight)}px`;
  }, [content, reading]);
  return (
    <section className="continuous-editor">
      <div className="editor-mode-bar">
        <span>Markdown</span>
        <button aria-pressed={!reading} onClick={() => setReading(false)}>
          Editar
        </button>
        <button aria-pressed={reading} onClick={() => setReading(true)}>
          Lectura
        </button>
        <kbd>Ctrl E</kbd>
      </div>
      <div className="editor-surface">
        <div className="editor-page">
          {reading ? (
            <NoteMarkdown content={content} onWiki={onWiki} links={links} />
          ) : (
            <textarea
              ref={editor}
              className="continuous-source"
              aria-label="Contenido Markdown"
              placeholder="Empieza a escribir… Usa [[ para enlazar tus ideas."
              spellCheck
              value={content}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </div>
        <aside className="document-outline">
          <button aria-expanded={outline} onClick={() => setOutline(!outline)}>
            Esquema {outline ? "−" : "+"}
          </button>
          {outline && (
            <p className="muted">
              {reading ? "Vista de lectura" : "Documento Markdown"}
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
                    setReading(false);
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
      </footer>
    </section>
  );
}
