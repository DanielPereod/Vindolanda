import type { Attachment } from "./attachments";
import type { Note, NoteFolder } from "./notes";
import { wikiTargets } from "./notes";

/**
 * Graph view semantics: turns the note collection into a force-directed graph of
 * documents, tags, attachments and unresolved wiki references. All functions are
 * pure so the layout and the filters can be tested without a DOM.
 */

export type GraphNodeKind = "note" | "tag" | "attachment" | "missing";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  noteId?: string;
  folderId: string | null;
  folderPath: string;
  tags: string[];
  properties: Record<string, string>;
  degree: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "link" | "tag" | "attachment";
  weight: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilters {
  query: string;
  showTags: boolean;
  showAttachments: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
}

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  query: "",
  showTags: true,
  showAttachments: true,
  existingOnly: false,
  showOrphans: true,
};

export interface GraphGroup {
  id: string;
  query: string;
  color: string;
}

export interface CompiledGraphGroup extends GraphGroup {
  tokens: GraphToken[];
}

/** Default palette applied by kind when no group matches. */
export const GRAPH_KIND_COLORS: Record<GraphNodeKind, string> = {
  note: "#8b93a1",
  tag: "#e0a458",
  attachment: "#5b8def",
  missing: "#6b7280",
};

/** Palette proposed when the user adds a group, mirroring Obsidian's dots. */
export const GRAPH_GROUP_COLORS = [
  "#e05252",
  "#e0a458",
  "#5b8def",
  "#4ea45b",
  "#a855f7",
  "#e879b9",
  "#38bdf8",
  "#f97316",
];

export interface GraphForces {
  center: number;
  repel: number;
  link: number;
  distance: number;
}

export const DEFAULT_GRAPH_FORCES: GraphForces = {
  center: 0.05,
  repel: 320,
  link: 0.5,
  distance: 70,
};

const tagPattern = /(?:^|[\s(])#([\p{L}\p{N}_/-]+)/gu;
const embedPattern = /!\[[^\]]*\]\(([^)\s]+)\)/g;
const propertyTokenPattern = /^\["([^"]+)"\s*:\s*"?([^"\]]*)"?\]$/;

/** Tags written in prose, ignoring fenced and inline code. */
export function contentTags(content: string): string[] {
  const visible = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`]*`/g, " ");
  const tags = new Set<string>();
  for (const match of visible.matchAll(tagPattern)) {
    const name = match[1];
    if (name) tags.add(name.toLocaleLowerCase());
  }
  return [...tags].sort();
}

/** Values of any property whose name mentions tags, split on commas/semicolons. */
export function propertyTags(properties: Record<string, string>): string[] {
  const tags: string[] = [];
  for (const [name, value] of Object.entries(properties)) {
    if (!name.toLocaleLowerCase().includes("tag")) continue;
    for (const part of value.split(/[,;]+/u)) {
      const trimmed = part.trim().toLocaleLowerCase();
      if (trimmed) tags.push(trimmed);
    }
  }
  return tags;
}

/** Image embed URLs declared in Markdown, used to link notes to attachments. */
export function embeddedUrls(content: string): string[] {
  const urls = new Set<string>();
  for (const match of content.matchAll(embedPattern)) {
    const url = match[1];
    if (url) urls.add(url);
  }
  return [...urls];
}

/** Resolves every folder to its slash-separated path, guarding against cycles. */
export function folderPathMap(folders: NoteFolder[]): Map<string, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string>();
  for (const folder of folders) {
    const chain: string[] = [];
    const guard = new Set<string>();
    let current: string | null = folder.id;
    while (current && !guard.has(current)) {
      guard.add(current);
      const found = byId.get(current);
      if (!found) break;
      chain.unshift(found.name);
      current = found.parent_id;
    }
    paths.set(folder.id, chain.join("/"));
  }
  return paths;
}

/** Builds the complete graph before any filter is applied. */
export function buildGraph(
  notes: Note[],
  folders: NoteFolder[] = [],
  attachments: Attachment[] = [],
): Graph {
  const paths = folderPathMap(folders);
  const documents = notes.filter((note) => note.kind === "note");
  const byTitle = new Map<string, Note>();
  for (const note of documents)
    byTitle.set(note.title.trim().toLocaleLowerCase(), note);
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  function addEdge(source: string, target: string, kind: GraphEdge["kind"]) {
    if (source === target) return;
    const key = `${source}|${target}|${kind}`;
    const existing = edgeMap.get(key);
    if (existing) existing.weight += 1;
    else edgeMap.set(key, { id: key, source, target, kind, weight: 1 });
  }

  for (const note of documents) {
    const tags = [
      ...new Set([...contentTags(note.content), ...propertyTags(note.properties)]),
    ].sort();
    nodeMap.set(`note:${note.id}`, {
      id: `note:${note.id}`,
      kind: "note",
      label: note.title,
      noteId: note.id,
      folderId: note.folder_id ?? null,
      folderPath: note.folder_id ? (paths.get(note.folder_id) ?? "") : "",
      tags,
      properties: note.properties,
      degree: 0,
    });
  }

  for (const note of documents) {
    const source = `note:${note.id}`;
    for (const raw of wikiTargets(note.content)) {
      const title = raw.split("#")[0]?.trim() ?? "";
      if (!title) continue;
      const resolved = byTitle.get(title.toLocaleLowerCase());
      if (resolved) {
        addEdge(source, `note:${resolved.id}`, "link");
        continue;
      }
      const identifier = `missing:${title.toLocaleLowerCase()}`;
      if (!nodeMap.has(identifier)) {
        nodeMap.set(identifier, {
          id: identifier,
          kind: "missing",
          label: title,
          folderId: null,
          folderPath: "",
          tags: [],
          properties: {},
          degree: 0,
        });
      }
      addEdge(source, identifier, "link");
    }
  }

  const allTags = new Set<string>();
  for (const note of documents) {
    const node = nodeMap.get(`note:${note.id}`);
    for (const tag of node?.tags ?? []) allTags.add(tag);
  }
  for (const tag of [...allTags].sort()) {
    nodeMap.set(`tag:${tag}`, {
      id: `tag:${tag}`,
      kind: "tag",
      label: `#${tag}`,
      folderId: null,
      folderPath: "",
      tags: [tag],
      properties: {},
      degree: 0,
    });
  }
  for (const note of documents) {
    const node = nodeMap.get(`note:${note.id}`);
    for (const tag of node?.tags ?? []) addEdge(`note:${note.id}`, `tag:${tag}`, "tag");
  }

  const attachmentByUrl = new Map(attachments.map((file) => [file.url, file]));
  for (const note of documents) {
    for (const url of embeddedUrls(note.content)) {
      const attachment = attachmentByUrl.get(url);
      if (!attachment) continue;
      const identifier = `attachment:${attachment.id}`;
      if (!nodeMap.has(identifier)) {
        nodeMap.set(identifier, {
          id: identifier,
          kind: "attachment",
          label: attachment.filename,
          folderId: null,
          folderPath: "",
          tags: [],
          properties: {},
          degree: 0,
        });
      }
      addEdge(`note:${note.id}`, identifier, "attachment");
    }
  }

  const nodes = [...nodeMap.values()];
  const edges = [...edgeMap.values()];
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (source) source.degree += 1;
    if (target) target.degree += 1;
  }
  return { nodes, edges };
}

export interface GraphToken {
  negated: boolean;
  field: "text" | "path" | "tag" | "file" | "property";
  value: string;
  key: string;
}

function tokenize(query: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  for (const character of query) {
    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }
    if (!quoted && /\s/u.test(character)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Parses an Obsidian-like query: free text, path:, file:, tag: and ["key":"value"]. */
export function parseGraphQuery(query: string): GraphToken[] {
  return tokenize(query).map((raw) => {
    let token = raw;
    let negated = false;
    if (token.startsWith("-") && token.length > 1) {
      negated = true;
      token = token.slice(1);
    }
    const property = propertyTokenPattern.exec(token);
    if (property) {
      return {
        negated,
        field: "property",
        key: (property[1] ?? "").toLocaleLowerCase(),
        value: (property[2] ?? "").toLocaleLowerCase(),
      };
    }
    const separator = token.indexOf(":");
    if (separator > 0) {
      const field = token.slice(0, separator).toLocaleLowerCase();
      const value = token
        .slice(separator + 1)
        .replace(/^#/, "")
        .toLocaleLowerCase();
      if (field === "path" || field === "tag" || field === "file")
        return { negated, field, value, key: "" };
    }
    return {
      negated,
      field: "text",
      value: token.toLocaleLowerCase(),
      key: "",
    };
  });
}

function matchToken(node: GraphNode, token: GraphToken): boolean {
  const label = node.label.toLocaleLowerCase();
  switch (token.field) {
    case "path":
      return node.folderPath.toLocaleLowerCase().includes(token.value);
    case "tag":
      return (
        node.tags.some((tag) => tag.includes(token.value)) ||
        label === `#${token.value}`
      );
    case "file":
      return label.includes(token.value);
    case "property": {
      const value = node.properties[token.key];
      return value !== undefined
        ? value.toLocaleLowerCase().includes(token.value)
        : false;
    }
    default:
      return (
        label.includes(token.value) ||
        node.tags.some((tag) => tag.includes(token.value)) ||
        node.folderPath.toLocaleLowerCase().includes(token.value)
      );
  }
}

export function matchesGraphQuery(node: GraphNode, tokens: GraphToken[]): boolean {
  for (const token of tokens)
    if (token.negated === matchToken(node, token)) return false;
  return true;
}

export function compileGroups(groups: GraphGroup[]): CompiledGraphGroup[] {
  return groups.map((group) => ({ ...group, tokens: parseGraphQuery(group.query) }));
}

/** First matching group wins, like Obsidian's ordered group list. */
export function groupColor(
  node: GraphNode,
  groups: CompiledGraphGroup[],
): string | null {
  for (const group of groups)
    if (matchesGraphQuery(node, group.tokens)) return group.color;
  return null;
}

function nodeVisible(
  node: GraphNode,
  filters: GraphFilters,
  tokens: GraphToken[],
): boolean {
  if (!matchesGraphQuery(node, tokens)) return false;
  if (node.kind === "tag") return filters.showTags;
  if (node.kind === "attachment") return filters.showAttachments;
  if (node.kind === "missing") return !filters.existingOnly;
  if (!filters.showOrphans && node.degree === 0) return false;
  return true;
}

/** Applies visibility rules and recomputes degrees over the visible subgraph. */
export function filterGraph(graph: Graph, filters: GraphFilters): Graph {
  const tokens = parseGraphQuery(filters.query);
  const visible = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (!nodeVisible(node, filters, tokens)) continue;
    visible.set(node.id, { ...node, degree: 0 });
  }
  const edges: GraphEdge[] = [];
  for (const edge of graph.edges) {
    const source = visible.get(edge.source);
    const target = visible.get(edge.target);
    if (!source || !target) continue;
    source.degree += 1;
    target.degree += 1;
    edges.push(edge);
  }
  return { nodes: [...visible.values()], edges };
}

export interface SimulationNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Stable hash so the same note always starts in the same place. */
export function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic seed around the viewport center, avoiding a single pile-up. */
export function seedPosition(
  id: string,
  width: number,
  height: number,
): { x: number; y: number } {
  const hash = hashText(id);
  const angle = ((hash % 3600) / 3600) * Math.PI * 2;
  const radius = Math.min(width, height) * (0.12 + ((hash >>> 8) % 1000) / 4000);
  return {
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
  };
}

/**
 * One Verlet-like integration step. Mutates positions and velocities so the
 * animation loop stays allocation-free. Alpha cools the simulation down.
 */
export function simulateStep(
  nodes: SimulationNode[],
  edges: GraphEdge[],
  index: Map<string, SimulationNode>,
  forces: GraphForces,
  alpha: number,
  width: number,
  height: number,
): void {
  const centerX = width / 2;
  const centerY = height / 2;
  const friction = 0.82;
  for (const node of nodes) {
    node.vx *= friction;
    node.vy *= friction;
    node.vx += (centerX - node.x) * forces.center * alpha;
    node.vy += (centerY - node.y) * forces.center * alpha;
  }
  for (let left = 0; left < nodes.length; left++) {
    const a = nodes[left];
    if (!a) continue;
    for (let right = left + 1; right < nodes.length; right++) {
      const b = nodes[right];
      if (!b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distanceSquared = Math.max(dx * dx + dy * dy, 25);
      const distance = Math.sqrt(distanceSquared);
      const magnitude = (forces.repel * alpha) / distanceSquared;
      const fx = (dx / distance) * magnitude;
      const fy = (dy / distance) * magnitude;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }
  for (const edge of edges) {
    const a = index.get(edge.source);
    const b = index.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
    const correction =
      ((distance - forces.distance) * forces.link * alpha) / distance;
    const fx = dx * correction;
    const fy = dy * correction;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }
  const margin = 24;
  for (const node of nodes) {
    node.x += node.vx;
    node.y += node.vy;
    if (node.x < margin) {
      node.x = margin;
      node.vx = Math.abs(node.vx) * 0.5;
    } else if (node.x > width - margin) {
      node.x = width - margin;
      node.vx = -Math.abs(node.vx) * 0.5;
    }
    if (node.y < margin) {
      node.y = margin;
      node.vy = Math.abs(node.vy) * 0.5;
    } else if (node.y > height - margin) {
      node.y = height - margin;
      node.vy = -Math.abs(node.vy) * 0.5;
    }
  }
}
