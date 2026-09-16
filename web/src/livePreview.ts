import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type {
  EditorSelection,
  EditorState,
  Extension,
  Range,
  Text,
} from "@codemirror/state";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { tags as highlightTags } from "@lezer/highlight";

/** A `[[target|alias]]` occurrence resolved into hidden syntax and a visible label. */
export interface WikiOccurrence {
  from: number;
  to: number;
  hidden: { from: number; to: number }[];
  labelFrom: number;
  labelTo: number;
  label: string;
  target: string;
}

/** Positions of syntax that gets hidden while a line is not being edited. */
interface HiddenRange {
  from: number;
  to: number;
}

/** Structural subset of a syntax node, avoiding a direct parser dependency. */
interface TreeLike {
  name: string;
  from: number;
  to: number;
  firstChild: TreeLike | null;
  nextSibling: TreeLike | null;
}

const wikiPattern = /\[\[([^\]\n]+)\]\]/g;
const codeNodeNames = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "CodeText",
]);
const markNodeNames = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "QuoteMark",
]);

/** Parses `[[wikilinks]]`, keeping alias, target and hidden syntax positions. */
export function parseWikiLinks(content: string, offset = 0): WikiOccurrence[] {
  const occurrences: WikiOccurrence[] = [];
  for (const match of content.matchAll(wikiPattern)) {
    const inner = match[1];
    if (inner === undefined) continue;
    const start = offset + (match.index ?? 0);
    const end = start + match[0].length;
    const separator = inner.indexOf("|");
    const rawTarget = separator === -1 ? inner : inner.slice(0, separator);
    const rawAlias = separator === -1 ? undefined : inner.slice(separator + 1);
    const target = rawTarget.trim();
    if (!target) continue;
    const label = (rawAlias ?? rawTarget).trim();
    const labelFrom =
      start + 2 + (rawAlias === undefined ? 0 : rawTarget.length + 1);
    const labelTo = end - 2;
    if (labelFrom >= labelTo) continue;
    occurrences.push({
      from: start,
      to: end,
      hidden: [
        { from: start, to: labelFrom },
        { from: labelTo, to: end },
      ],
      labelFrom,
      labelTo,
      label,
      target,
    });
  }
  return occurrences;
}

/** Line numbers touched by any selection range; their source stays visible. */
export function activeLineNumbers(
  doc: Text,
  selection: EditorSelection,
): Set<number> {
  const lines = new Set<number>();
  for (const range of selection.ranges) {
    const first = doc.lineAt(range.from).number;
    const last = doc.lineAt(range.to).number;
    for (let line = first; line <= last; line++) lines.add(line);
  }
  return lines;
}

function overlaps(range: HiddenRange, occurrence: WikiOccurrence): boolean {
  return occurrence.from < range.to && range.from < occurrence.to;
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-lp-bullet";
    bullet.textContent = "•";
    return bullet;
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-lp-rule";
    return rule;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt;
  }
  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-lp-image";
    const image = document.createElement("img");
    image.src = this.url;
    image.alt = this.alt;
    image.loading = "lazy";
    wrapper.append(image);
    if (this.alt) {
      const caption = document.createElement("span");
      caption.className = "cm-lp-image-caption";
      caption.textContent = this.alt;
      wrapper.append(caption);
    }
    return wrapper;
  }
  ignoreEvent() {
    return true;
  }
}

const bulletWidget = new BulletWidget();
const horizontalRuleWidget = new HorizontalRuleWidget();

function decorateLink(
  node: TreeLike,
  state: EditorState,
  output: Range<Decoration>[],
) {
  const marks: TreeLike[] = [];
  let url = "";
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "LinkMark") marks.push(child);
    else if (child.name === "URL") url = state.sliceDoc(child.from, child.to);
  }
  const open = marks[0];
  const close = marks[1];
  if (
    node.name === "Image" &&
    state.doc.lineAt(node.from).number === state.doc.lineAt(node.to).number
  ) {
    const alt = open && close ? state.sliceDoc(open.to, close.from) : "";
    output.push(
      Decoration.replace({ widget: new ImageWidget(url, alt) }).range(
        node.from,
        node.to,
      ),
    );
    return;
  }
  for (const mark of marks)
    output.push(Decoration.replace({}).range(mark.from, mark.to));
  if (open && close && close.from > open.to)
    output.push(
      Decoration.mark({
        class: "cm-lp-link",
        attributes: url ? { "data-link-url": url, title: url } : undefined,
      }).range(open.to, close.from),
    );
}

function buildDecorations(view: EditorView): DecorationSet {
  const state = view.state;
  const active = activeLineNumbers(state.doc, state.selection);
  const output: Range<Decoration>[] = [];
  const code: HiddenRange[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (codeNodeNames.has(node.name))
        code.push({ from: node.from, to: node.to });
      if (active.has(state.doc.lineAt(node.from).number)) return;
      const name = node.name;
      if (name === "Link" || name === "Image") {
        decorateLink(node.node, state, output);
        return false;
      }
      if (markNodeNames.has(name)) {
        output.push(Decoration.replace({}).range(node.from, node.to));
        return;
      }
      if (name === "CodeMark" && node.node.parent?.name === "InlineCode") {
        output.push(Decoration.replace({}).range(node.from, node.to));
        return;
      }
      if (
        name === "ListMark" &&
        /^[-*+]$/.test(state.sliceDoc(node.from, node.to))
      ) {
        output.push(
          Decoration.replace({ widget: bulletWidget }).range(
            node.from,
            node.to,
          ),
        );
        return;
      }
      if (name === "HorizontalRule") {
        output.push(
          Decoration.replace({ widget: horizontalRuleWidget }).range(
            node.from,
            node.to,
          ),
        );
      }
    },
  });
  for (const occurrence of parseWikiLinks(state.doc.toString())) {
    if (active.has(state.doc.lineAt(occurrence.from).number)) continue;
    if (code.some((range) => overlaps(range, occurrence))) continue;
    for (const range of occurrence.hidden)
      output.push(Decoration.replace({}).range(range.from, range.to));
    if (occurrence.labelFrom < occurrence.labelTo)
      output.push(
        Decoration.mark({
          class: "cm-lp-wiki",
          attributes: { "data-wiki-target": occurrence.target },
        }).range(occurrence.labelFrom, occurrence.labelTo),
      );
  }
  return Decoration.set(output, true);
}

/** Colors Markdown tokens so rendered marks read like formatted text. */
export const livePreviewHighlight = HighlightStyle.define([
  { tag: highlightTags.heading1, fontSize: "1.6em", fontWeight: "750" },
  { tag: highlightTags.heading2, fontSize: "1.4em", fontWeight: "700" },
  { tag: highlightTags.heading3, fontSize: "1.22em", fontWeight: "650" },
  { tag: highlightTags.heading4, fontSize: "1.1em", fontWeight: "650" },
  { tag: highlightTags.heading5, fontWeight: "650" },
  { tag: highlightTags.heading6, fontWeight: "650" },
  { tag: highlightTags.strong, fontWeight: "700" },
  { tag: highlightTags.emphasis, fontStyle: "italic" },
  { tag: highlightTags.strikethrough, textDecoration: "line-through" },
  {
    tag: highlightTags.monospace,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "0.9em",
  },
  { tag: highlightTags.link, color: "var(--accent, #8b5cf6)" },
  { tag: highlightTags.url, color: "var(--muted)" },
  {
    tag: highlightTags.quote,
    color: "var(--muted)",
    fontStyle: "italic",
  },
  { tag: highlightTags.processingInstruction, color: "var(--muted)" },
  { tag: highlightTags.contentSeparator, color: "var(--muted)" },
]);

/** Neutral chrome so the editor blends into the note document surface. */
export const livePreviewTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "inherit",
    fontSize: "15px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.8",
    overflow: "visible",
  },
  ".cm-content": {
    padding: "8px 0 24px",
    caretColor: "var(--accent, #8b5cf6)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent, #8b5cf6)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in srgb, var(--accent, #8b5cf6) 22%, transparent)",
    },
});

/** Renders Markdown inline while keeping the active line editable as source. */
export function livePreview(onWiki: (target: string) => void): Extension {
  return [
    syntaxHighlighting(livePreviewHighlight),
    livePreviewTheme,
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = buildDecorations(view);
        }
        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged
          )
            this.decorations = buildDecorations(update.view);
        }
      },
      { decorations: (value) => value.decorations },
    ),
    EditorView.domEventHandlers({
      mousedown(event) {
        if (!(event.target instanceof Element)) return false;
        const element = event.target.closest("[data-wiki-target]");
        if (!(element instanceof HTMLElement)) return false;
        const target = element.dataset.wikiTarget;
        if (!target) return false;
        event.preventDefault();
        onWiki(target);
        return true;
      },
    }),
  ];
}
