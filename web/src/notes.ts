/** Markdown documents, saved property views and canvas layouts share one collection. */
export interface NoteInput {
  title: string;
  kind: "note" | "base" | "canvas";
  content: string;
  properties: Record<string, string>;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  filter: string;
  sort: "title" | "updated_at" | "";
  folder_id?: string | null;
}
export interface Note extends NoteInput {
  id: string;
  updated_at: string;
  created_at: string;
  deleted_at?: string | null;
}
/** Virtual folders are persisted entities; null parent means the explorer root. */
export interface NoteFolder {
  id: string;
  name: string;
  parent_id: string | null;
}
/** Server-indexed occurrence; a null target is an unresolved wiki reference. */
export interface NoteLink {
  id: string;
  source_note_id: string;
  target_note_id: string | null;
  target_title: string;
  current_title: string;
  source_title: string;
  target_heading: string;
  target_block: string;
  display_text: string;
  position: number;
  context: string;
  target_deleted: boolean;
}
/** Canvas cards are stored notes, canvas-only text cards or media embeds. */
export type CanvasNodeType = "note" | "text" | "media";
/** A card side whose midpoint exposes a connection port. */
export type CanvasSide = "top" | "right" | "bottom" | "left";
/** Edge connects two cards, remembering which side each arrow leaves and reaches. */
export interface CanvasEdge {
  from: string;
  to: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
}
export interface CanvasNode {
  id: string;
  type?: CanvasNodeType;
  note_id?: string;
  text?: string;
  url?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
}
const wikiPattern = /(```[\s\S]*?```|`[^`]*`)|\[\[([^\]\n]+)\]\]/g;
/** Extracts unique targets, excluding inline and fenced code. */
export function wikiTargets(content: string): string[] {
  return [
    ...new Set(
      [...content.matchAll(wikiPattern)].flatMap((match) =>
        match[2] ? [(match[2].split("|")[0] ?? "").trim()] : [],
      ),
    ),
  ];
}
/** Uses internal fragment links, leaving raw HTML disabled by the Markdown renderer. */
export function wikiMarkdown(
  content: string,
  links: Pick<NoteLink, "target_title" | "current_title">[] = [],
): string {
  return content.replace(
    wikiPattern,
    (
      original: string,
      code: string | undefined,
      target: string | undefined,
    ) => {
      if (code || !target) return original;
      const [title = "", alias] = target.split("|");
      const [noteTitle = "", ...fragment] = title.split("#");
      const reference = links.find(
        (link) =>
          link.target_title.toLocaleLowerCase() ===
          noteTitle.trim().toLocaleLowerCase(),
      );
      const label =
        alias ||
        (reference
          ? reference.current_title +
            (fragment.length ? `#${fragment.join("#")}` : "")
          : title);
      return `[${label.replace(/[[\]]/g, "")}](#/wiki/${encodeURIComponent(title.trim())})`;
    },
  );
}
/** Filters notes by title, content and property values; returns a sorted copy. */
export function filterNotes<
  Value extends Pick<
    Note,
    "id" | "title" | "kind" | "content" | "properties"
  > & { updated_at?: string },
>(notes: Value[], filter: string, sort: string): Value[] {
  const query = filter.toLocaleLowerCase();
  return notes
    .filter(
      (note) =>
        note.kind === "note" &&
        [note.title, note.content, ...Object.values(note.properties)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort((left, right) =>
      sort === "updated_at"
        ? (right.updated_at ?? "").localeCompare(left.updated_at ?? "")
        : left.title.localeCompare(right.title),
    );
}
/** Reorders complete Markdown blocks; out-of-range moves leave the content intact. */
export function moveBlock(
  blocks: string[],
  index: number,
  direction: number,
): string[] {
  const result = [...blocks];
  const target = index + direction;
  if (target < 0 || target >= result.length) return result;
  const sourceBlock = result[index];
  const targetBlock = result[target];
  if (sourceBlock === undefined || targetBlock === undefined) return result;
  result[index] = targetBlock;
  result[target] = sourceBlock;
  return result;
}

/** Separates paragraphs without splitting blank lines inside fenced code. */
export function splitBlocks(content: string): string[] {
  const blocks: string[] = [];
  let current = "";
  let fence = "";
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && !fence) fence = marker;
    else if (marker && marker[0] === fence[0] && marker.length >= fence.length)
      fence = "";
    current += line + (index < lines.length - 1 ? "\n" : "");
    if (current.endsWith("\n\n") && !fence) {
      blocks.push(current.slice(0, -2));
      current = "";
    }
  });
  blocks.push(current);
  return blocks;
}
