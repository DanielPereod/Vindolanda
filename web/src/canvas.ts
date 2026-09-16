import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeType,
  CanvasSide,
} from "./notes";

/** Infinite canvas helpers: viewport math, card sizing and media detection. */

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

export interface CanvasView {
  x: number;
  y: number;
  zoom: number;
}

const fallbackSizes: Record<CanvasNodeType, { width: number; height: number }> =
  {
    note: { width: 300, height: 170 },
    text: { width: 240, height: 140 },
    media: { width: 340, height: 220 },
  };

/** Legacy nodes have no type and are note references. */
export function nodeType(node: Pick<CanvasNode, "type">): CanvasNodeType {
  return node.type === "text" || node.type === "media" ? node.type : "note";
}

const headingPattern = /^#{1,6}\s+(.+?)\s*$/;

/** Title to show inside a note card, omitting it when the content repeats it. */
export function nodeCardHeading(title: string, content: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");
  const heading = firstLine ? headingPattern.exec(firstLine) : null;
  if (heading?.[1]?.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
    return null;
  return trimmed;
}

export function nodeSize(node: CanvasNode): { width: number; height: number } {
  const fallback = fallbackSizes[nodeType(node)];
  return {
    width: node.width || fallback.width,
    height: node.height || fallback.height,
  };
}

/** Resize limits keep cards usable and prevent them covering the whole canvas. */
export const MIN_NODE_WIDTH = 160;
export const MIN_NODE_HEIGHT = 100;
export const MAX_NODE_WIDTH = 1400;
export const MAX_NODE_HEIGHT = 1200;

/** Corner grab points; edges stay free for connection ports. */
export type CanvasResizeDirection = "nw" | "ne" | "se" | "sw";

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Resizes a card from a corner, keeping the opposite edge fixed and clamping. */
export function resizeNodeRect(
  rect: CanvasRect,
  direction: CanvasResizeDirection,
  deltaX: number,
  deltaY: number,
): CanvasRect {
  const west = direction === "nw" || direction === "sw";
  const north = direction === "nw" || direction === "ne";
  const width = clamp(
    west ? rect.width - deltaX : rect.width + deltaX,
    MIN_NODE_WIDTH,
    MAX_NODE_WIDTH,
  );
  const height = clamp(
    north ? rect.height - deltaY : rect.height + deltaY,
    MIN_NODE_HEIGHT,
    MAX_NODE_HEIGHT,
  );
  return {
    x: Math.round(west ? rect.x + (rect.width - width) : rect.x),
    y: Math.round(north ? rect.y + (rect.height - height) : rect.y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function nodeCenter(node: CanvasNode): { x: number; y: number } {
  const size = nodeSize(node);
  return { x: node.x + size.width / 2, y: node.y + size.height / 2 };
}

export const CANVAS_SIDES: CanvasSide[] = ["top", "right", "bottom", "left"];

const sideFractions: Record<CanvasSide, [number, number]> = {
  top: [0.5, 0],
  right: [1, 0.5],
  bottom: [0.5, 1],
  left: [0, 0.5],
};

/** Midpoint of a card side, where its connection port sits. */
export function nodeAnchor(
  node: CanvasNode,
  side: CanvasSide,
): { x: number; y: number } {
  const size = nodeSize(node);
  const [fractionX, fractionY] = sideFractions[side];
  return {
    x: node.x + size.width * fractionX,
    y: node.y + size.height * fractionY,
  };
}

/** Closest side to a world point, driving automatic anchors for dragged links. */
export function nearestSide(
  node: CanvasNode,
  point: { x: number; y: number },
): CanvasSide {
  const center = nodeCenter(node);
  const size = nodeSize(node);
  const offsetX = (point.x - center.x) / (size.width / 2 || 1);
  const offsetY = (point.y - center.y) / (size.height / 2 || 1);
  if (Math.abs(offsetX) >= Math.abs(offsetY))
    return offsetX >= 0 ? "right" : "left";
  return offsetY >= 0 ? "bottom" : "top";
}

/** Side of node that faces other; used as the anchor for legacy edges. */
export function facingSide(node: CanvasNode, other: CanvasNode): CanvasSide {
  const origin = nodeCenter(node);
  const destination = nodeCenter(other);
  const offsetX = destination.x - origin.x;
  const offsetY = destination.y - origin.y;
  if (Math.abs(offsetX) >= Math.abs(offsetY))
    return offsetX >= 0 ? "right" : "left";
  return offsetY >= 0 ? "bottom" : "top";
}

/** Resolves an edge's stored sides, falling back to the facing sides. */
export function edgeSides(
  edge: Pick<CanvasEdge, "fromSide" | "toSide">,
  from: CanvasNode,
  to: CanvasNode,
): { fromSide: CanvasSide; toSide: CanvasSide } {
  return {
    fromSide: edge.fromSide ?? facingSide(from, to),
    toSide: edge.toSide ?? facingSide(to, from),
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Zooms by factor around a viewport point, keeping that point fixed. */
export function zoomAt(
  view: CanvasView,
  factor: number,
  pointerX: number,
  pointerY: number,
): CanvasView {
  const zoom = clampZoom(view.zoom * factor);
  const ratio = zoom / view.zoom;
  return {
    zoom,
    x: pointerX - ratio * (pointerX - view.x),
    y: pointerY - ratio * (pointerY - view.y),
  };
}

/** Centers all cards inside the viewport with padding. */
export function fitView(
  nodes: CanvasNode[],
  width: number,
  height: number,
  padding = 90,
): CanvasView {
  if (nodes.length === 0 || width <= 0 || height <= 0)
    return { x: 0, y: 0, zoom: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const size = nodeSize(node);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + size.width);
    maxY = Math.max(maxY, node.y + size.height);
  }
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const zoom = clampZoom(
    Math.min(width / contentWidth, height / contentHeight),
  );
  return {
    zoom,
    x: (width - contentWidth * zoom) / 2 - minX * zoom,
    y: (height - contentHeight * zoom) / 2 - minY * zoom,
  };
}

export type MediaSource =
  | { kind: "youtube"; id: string }
  | { kind: "image" | "video" | "link"; url: string };

/** Recognizes YouTube links and image/video files; anything else is a link. */
export function mediaSource(url: string): MediaSource {
  const identifier = youtubeIdentifier(url);
  if (identifier) return { kind: "youtube", id: identifier };
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url))
    return { kind: "image", url };
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url))
    return { kind: "video", url };
  return { kind: "link", url };
}

export function youtubeIdentifier(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./u, "");
  if (host === "youtu.be")
    return parsed.pathname.slice(1).split("/")[0] || null;
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
    const match = /^\/(?:embed|shorts|v)\/([^/?#]+)/u.exec(parsed.pathname);
    return match?.[1] ?? null;
  }
  return null;
}

export function newCanvasNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `node-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
