import { useEffect, useRef } from "react";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { livePreview } from "./livePreview";
import { imageFiles } from "./attachments";

/** Editable CodeMirror surface that renders Markdown inline, Obsidian-style. */
export function MarkdownEditor({
  content,
  onChange,
  onWiki,
  onPasteFiles,
  ariaLabel,
  placeholderText,
}: {
  content: string;
  onChange: (content: string) => void;
  onWiki: (title: string) => void;
  onPasteFiles?: (files: File[]) => Promise<string>;
  ariaLabel?: string;
  placeholderText?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const initial = useRef(content);
  const initialLabel = useRef(ariaLabel);
  const initialPlaceholder = useRef(placeholderText);
  const changeHandler = useRef(onChange);
  const wikiHandler = useRef(onWiki);
  const pasteHandler = useRef(onPasteFiles);
  useEffect(() => {
    changeHandler.current = onChange;
    wikiHandler.current = onWiki;
    pasteHandler.current = onPasteFiles;
  });
  useEffect(() => {
    if (!host.current) return;
    const extensions: Extension[] = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      markdown(),
      livePreview((target) => wikiHandler.current(target)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged)
          changeHandler.current(update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        paste(event, editor) {
          const handle = pasteHandler.current;
          const files = imageFiles(event.clipboardData?.files);
          if (!handle || files.length === 0) return false;
          event.preventDefault();
          const { from, to } = editor.state.selection.main;
          void handle(files).then((snippet) => {
            if (!snippet) return;
            const length = editor.state.doc.length;
            const start = Math.min(from, length);
            const end = Math.min(Math.max(to, start), length);
            editor.dispatch({
              changes: { from: start, to: end, insert: snippet },
              selection: { anchor: start + snippet.length },
            });
            editor.focus();
          });
          return true;
        },
      }),
    ];
    if (initialLabel.current)
      extensions.push(
        EditorView.contentAttributes.of({ "aria-label": initialLabel.current }),
      );
    if (initialPlaceholder.current)
      extensions.push(placeholder(initialPlaceholder.current));
    const created = new EditorView({
      state: EditorState.create({ doc: initial.current, extensions }),
      parent: host.current,
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === content) return;
    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: content },
    });
  }, [content]);
  return <div className="live-preview" ref={host} />;
}
