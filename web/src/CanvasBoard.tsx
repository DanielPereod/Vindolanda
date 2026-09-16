import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  Palette,
  Pencil,
  RotateCcw,
  StickyNote,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  CANVAS_SIDES,
  edgeSides,
  fitView,
  mediaSource,
  nearestSide,
  newCanvasNodeId,
  nodeAnchor,
  nodeCardHeading,
  nodeSize,
  nodeType,
  resizeNodeRect,
  zoomAt,
} from "./canvas";
import type { CanvasRect, CanvasResizeDirection, CanvasView } from "./canvas";
import type { CanvasNode, CanvasSide, Note, NoteInput } from "./notes";
import { MarkdownEditor } from "./MarkdownEditor";
import { Modal } from "./Modal";
import { errorMessage } from "./api";
import {
  attachmentMarkdown,
  imageFiles,
  uploadAttachment,
} from "./attachments";

interface CanvasBoardProps {
  input: NoteInput;
  notes: Note[];
  titleRef?: React.RefObject<HTMLInputElement>;
  onChange: (input: NoteInput) => void;
  onCreateNote: (title?: string) => Promise<Note | null>;
  onOpenNote: (identifier: string) => void;
  onUpdateNote: (identifier: string, content: string) => void;
  onWiki: (title: string) => void;
}

interface DragState {
  id: string;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
  wasSelected: boolean;
  moved: boolean;
}
interface PanState {
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
}
interface ConnectState {
  from: string;
  fromSide: CanvasSide;
  x: number;
  y: number;
  to: string | null;
  toSide: CanvasSide | null;
}
interface ResizeState {
  id: string;
  direction: CanvasResizeDirection;
  pointerX: number;
  pointerY: number;
  rect: CanvasRect;
}

const SIDE_LABELS: Record<CanvasSide, string> = {
  top: "arriba",
  right: "derecha",
  bottom: "abajo",
  left: "izquierda",
};

const RESIZE_DIRECTIONS: { direction: CanvasResizeDirection; label: string }[] =
  [
    { direction: "nw", label: "arriba izquierda" },
    { direction: "ne", label: "arriba derecha" },
    { direction: "se", label: "abajo derecha" },
    { direction: "sw", label: "abajo izquierda" },
  ];

function edgeKey(edge: { from: string; to: string }): string {
  return `${edge.from}->${edge.to}`;
}

const MOVE_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Preset card colors offered by the selection toolbar. */
const NODE_COLORS: { label: string; value: string | null; swatch: string }[] = [
  { label: "Predeterminado", value: null, swatch: "var(--panel)" },
  { label: "Rojo", value: "#ef4444", swatch: "#ef4444" },
  { label: "Naranja", value: "#f97316", swatch: "#f97316" },
  { label: "Amarillo", value: "#eab308", swatch: "#eab308" },
  { label: "Verde", value: "#22c55e", swatch: "#22c55e" },
  { label: "Cian", value: "#06b6d4", swatch: "#06b6d4" },
  { label: "Azul", value: "#2563eb", swatch: "#2563eb" },
  { label: "Morado", value: "#a855f7", swatch: "#a855f7" },
];

/** Immersive Obsidian-style canvas: full viewport, wheel zoom and middle-drag pan. */
export function CanvasBoard({
  input,
  notes,
  titleRef,
  onChange,
  onCreateNote,
  onOpenNote,
  onUpdateNote,
  onWiki,
}: CanvasBoardProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const didFit = useRef(false);
  const [view, setView] = useState<CanvasView>({ x: 0, y: 0, zoom: 1 });
  const [pan, setPan] = useState<PanState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [connect, setConnect] = useState<ConnectState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edgeSelected, setEdgeSelected] = useState<string | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const latestInput = useRef(input);
  latestInput.current = input;
  const deviceInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const surface = element;
    function wheel(event: WheelEvent) {
      // Cards scroll their own overflowing content; the canvas only zooms otherwise.
      const target = event.target;
      const scroller =
        target instanceof Element
          ? target.closest(".canvas-node-text, .canvas-node-note-body")
          : null;
      if (
        scroller instanceof HTMLElement &&
        scroller.scrollHeight > scroller.clientHeight
      ) {
        const down = event.deltaY > 0;
        const atTop = scroller.scrollTop <= 0;
        const atBottom =
          scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - 1;
        if ((down && !atBottom) || (!down && !atTop)) return;
      }
      event.preventDefault();
      const rectangle = surface.getBoundingClientRect();
      setView((current) =>
        zoomAt(
          current,
          Math.exp(-event.deltaY * 0.0015),
          event.clientX - rectangle.left,
          event.clientY - rectangle.top,
        ),
      );
    }
    function blockMiddleClick(event: MouseEvent) {
      if (event.button === 1) event.preventDefault();
    }
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("mousedown", blockMiddleClick);
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("mousedown", blockMiddleClick);
    };
  }, []);

  useEffect(() => {
    if (didFit.current) return;
    didFit.current = true;
    const element = viewport.current;
    if (!element || input.nodes.length === 0) return;
    setView(fitView(input.nodes, element.clientWidth, element.clientHeight));
  }, [input.nodes]);

  // Clipboard images become media cards; text paste stays untouched.
  const uploadPasted = useRef<(files: File[]) => void>(() => {});
  uploadPasted.current = (files) => {
    void addUploadedImages(files, pointer.current ?? undefined);
  };
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, .cm-content, [contenteditable=true]")
      )
        return;
      const files = imageFiles(event.clipboardData?.files);
      if (files.length === 0) return;
      event.preventDefault();
      uploadPasted.current(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const connectors = useMemo(() => {
    const byId = new Map(input.nodes.map((node) => [node.id, node]));
    const drawn = input.edges.flatMap((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return [];
      const sides = edgeSides(edge, from, to);
      const start = nodeAnchor(from, sides.fromSide);
      const end = nodeAnchor(to, sides.toSide);
      return [
        {
          key: edgeKey(edge),
          from: edge.from,
          to: edge.to,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          preview: false,
        },
      ];
    });
    const source = connect ? byId.get(connect.from) : undefined;
    if (connect && source) {
      const start = nodeAnchor(source, connect.fromSide);
      const target = connect.to ? byId.get(connect.to) : undefined;
      const end =
        target && connect.toSide
          ? nodeAnchor(target, connect.toSide)
          : { x: connect.x, y: connect.y };
      drawn.push({
        key: "preview",
        from: "",
        to: "",
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        preview: true,
      });
    }
    return drawn;
  }, [input.nodes, input.edges, connect]);

  const bounds = useMemo(() => {
    if (connectors.length === 0) return null;
    const xs = connectors.flatMap((link) => [link.x1, link.x2]);
    const ys = connectors.flatMap((link) => [link.y1, link.y2]);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    return {
      minX,
      minY,
      width: Math.max(...xs) + 40 - minX,
      height: Math.max(...ys) + 40 - minY,
    };
  }, [connectors]);

  useEffect(() => {
    if (!selected && !edgeSelected) return;
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [contenteditable=true]")
      )
        return;
      const direction = MOVE_DIRECTIONS[event.key];
      if (direction && selected) {
        event.preventDefault();
        const node = input.nodes.find((candidate) => candidate.id === selected);
        if (!node) return;
        const step = event.shiftKey ? 80 : 16;
        onChange({
          ...input,
          nodes: input.nodes.map((candidate) =>
            candidate.id === selected
              ? {
                  ...candidate,
                  x: node.x + direction[0] * step,
                  y: node.y + direction[1] * step,
                }
              : candidate,
          ),
        });
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      if (edgeSelected) {
        onChange({
          ...input,
          edges: input.edges.filter((edge) => edgeKey(edge) !== edgeSelected),
        });
        setEdgeSelected(null);
        return;
      }
      onChange({
        ...input,
        nodes: input.nodes.filter((node) => node.id !== selected),
        edges: input.edges.filter(
          (edge) => edge.from !== selected && edge.to !== selected,
        ),
      });
      setSelected(null);
      setEditing(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edgeSelected, input, onChange, selected]);

  function selectNode(identifier: string) {
    setSelected(identifier);
    setEdgeSelected(null);
    setColorOpen(false);
    setEditing((current) => (current === identifier ? current : null));
  }

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      const element = viewport.current?.querySelector(
        `[data-node-id="${editing}"] .cm-content`,
      );
      if (element instanceof HTMLElement) element.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    function exitOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setEditing(null);
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    }
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [editing]);

  function removeEdge(key: string) {
    onChange({
      ...input,
      edges: input.edges.filter((edge) => edgeKey(edge) !== key),
    });
    setEdgeSelected((current) => (current === key ? null : current));
  }

  function updateNode(identifier: string, patch: Partial<CanvasNode>) {
    onChange({
      ...input,
      nodes: input.nodes.map((node) =>
        node.id === identifier ? { ...node, ...patch } : node,
      ),
    });
  }

  function removeNode(identifier: string) {
    onChange({
      ...input,
      nodes: input.nodes.filter((node) => node.id !== identifier),
      edges: input.edges.filter(
        (edge) => edge.from !== identifier && edge.to !== identifier,
      ),
    });
    setSelected((current) => (current === identifier ? null : current));
    setEditing((current) => (current === identifier ? null : current));
  }

  function openNode(node: CanvasNode) {
    const type = nodeType(node);
    if (type === "note" && node.note_id) {
      onOpenNote(node.note_id);
      return;
    }
    if (type === "media" && node.url)
      window.open(node.url, "_blank", "noopener,noreferrer");
  }

  function viewportCenter() {
    const element = viewport.current;
    if (!element) return { x: 0, y: 0 };
    return {
      x: (element.clientWidth / 2 - view.x) / view.zoom,
      y: (element.clientHeight / 2 - view.y) / view.zoom,
    };
  }

  function addNode(
    partial: Omit<CanvasNode, "id" | "x" | "y">,
    origin?: { x: number; y: number },
  ) {
    const draft = {
      id: newCanvasNodeId(),
      x: 0,
      y: 0,
      ...partial,
    } as CanvasNode;
    const size = nodeSize(draft);
    const center = origin ?? viewportCenter();
    const placed = {
      ...draft,
      x: Math.round(center.x - size.width / 2),
      y: Math.round(center.y - size.height / 2),
    };
    onChange({ ...input, nodes: [...input.nodes, placed] });
    selectNode(placed.id);
  }

  function addExistingNote(note: Note) {
    addNode({ type: "note", note_id: note.id });
    setNoteOpen(false);
  }

  async function addNoteCard(title: string) {
    setBusy(true);
    try {
      const created = await onCreateNote(title);
      if (created) addNode({ type: "note", note_id: created.id });
      setNoteOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function addMedia() {
    const url = mediaUrl.trim();
    if (!/^https?:\/\//iu.test(url)) {
      setMediaError("Introduce una URL http(s) válida.");
      return;
    }
    addNode({ type: "media", url });
    setMediaUrl("");
    setMediaError("");
    setMediaOpen(false);
  }

  // Uploads images for pasted Markdown inside a card and returns the snippet.
  async function uploadSnippet(files: File[]): Promise<string> {
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

  // Uploads images and adds one media card each, centered on the drop point.
  async function addUploadedImages(
    files: File[],
    origin?: { x: number; y: number },
  ) {
    const images = imageFiles(files);
    if (images.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      const additions: CanvasNode[] = [];
      let index = 0;
      for (const file of images) {
        const attachment = await uploadAttachment(file);
        const draft: CanvasNode = {
          id: newCanvasNodeId(),
          type: "media",
          url: attachment.url,
          x: 0,
          y: 0,
        };
        const size = nodeSize(draft);
        const center = origin ?? viewportCenter();
        const shift = index * 28;
        additions.push({
          ...draft,
          x: Math.round(center.x - size.width / 2 + shift),
          y: Math.round(center.y - size.height / 2 + shift),
        });
        index += 1;
      }
      const current = latestInput.current;
      onChange({ ...current, nodes: [...current.nodes, ...additions] });
      const last = additions[additions.length - 1];
      if (last) selectNode(last.id);
      setMediaOpen(false);
    } catch (failure) {
      setUploadError(errorMessage(failure));
    } finally {
      setUploading(false);
    }
  }

  function zoomBy(factor: number) {
    const element = viewport.current;
    if (!element) return;
    setView((current) =>
      zoomAt(
        current,
        factor,
        element.clientWidth / 2,
        element.clientHeight / 2,
      ),
    );
  }

  function resetZoom() {
    const element = viewport.current;
    if (!element) return;
    setView((current) =>
      zoomAt(
        current,
        1 / current.zoom,
        element.clientWidth / 2,
        element.clientHeight / 2,
      ),
    );
  }

  function fitContent() {
    const element = viewport.current;
    if (!element) return;
    setView(fitView(input.nodes, element.clientWidth, element.clientHeight));
  }

  function worldPoint(clientX: number, clientY: number) {
    const element = viewport.current;
    if (!element) return { x: 0, y: 0 };
    const rectangle = element.getBoundingClientRect();
    return {
      x: (clientX - rectangle.left - view.x) / view.zoom,
      y: (clientY - rectangle.top - view.y) / view.zoom,
    };
  }

  function nodeAt(point: { x: number; y: number }): CanvasNode | null {
    for (let index = input.nodes.length - 1; index >= 0; index -= 1) {
      const node = input.nodes[index];
      if (!node) continue;
      const size = nodeSize(node);
      if (
        point.x >= node.x &&
        point.x <= node.x + size.width &&
        point.y >= node.y &&
        point.y <= node.y + size.height
      )
        return node;
    }
    return null;
  }

  function startDrop(event: React.DragEvent<HTMLDivElement>) {
    if (
      !Array.from(event.dataTransfer?.items ?? []).some(
        (item) => item.kind === "file",
      )
    )
      return;
    event.preventDefault();
    setDropActive(true);
  }

  function leaveDrop(event: React.DragEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDropActive(false);
  }

  function dropFiles(event: React.DragEvent<HTMLDivElement>) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (imageFiles(files).length === 0) return;
    event.preventDefault();
    setDropActive(false);
    void addUploadedImages(files, worldPoint(event.clientX, event.clientY));
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const interactive = Boolean(
      target.closest(
        ".canvas-node, .canvas-controls, .canvas-toolbar, .canvas-media-form, button, a, input, textarea, iframe",
      ),
    );
    if (event.button !== 1 && !(event.button === 0 && !interactive)) return;
    event.preventDefault();
    viewport.current?.setPointerCapture(event.pointerId);
    setPan({
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: view.x,
      y: view.y,
    });
    if (event.button === 0) {
      setSelected(null);
      setEdgeSelected(null);
      setEditing(null);
      setColorOpen(false);
    }
  }

  function moveViewport(event: React.PointerEvent<HTMLDivElement>) {
    const point = worldPoint(event.clientX, event.clientY);
    pointer.current = point;
    if (pan) {
      setView((current) => ({
        ...current,
        x: pan.x + (event.clientX - pan.pointerX),
        y: pan.y + (event.clientY - pan.pointerY),
      }));
      return;
    }
    if (!connect) return;
    const target = nodeAt(point);
    const valid = target && target.id !== connect.from ? target : null;
    setConnect((current) =>
      current
        ? {
            ...current,
            x: point.x,
            y: point.y,
            to: valid?.id ?? null,
            toSide: valid ? nearestSide(valid, point) : null,
          }
        : current,
    );
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (pan) {
      viewport.current?.releasePointerCapture(event.pointerId);
      setPan(null);
    }
    if (connect) finishConnect(event);
    if (drag) setDrag(null);
  }

  function startConnect(
    event: React.PointerEvent<HTMLButtonElement>,
    node: CanvasNode,
    side: CanvasSide,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    selectNode(node.id);
    viewport.current?.setPointerCapture(event.pointerId);
    const point = worldPoint(event.clientX, event.clientY);
    setConnect({
      from: node.id,
      fromSide: side,
      x: point.x,
      y: point.y,
      to: null,
      toSide: null,
    });
  }

  function finishConnect(event: React.PointerEvent<HTMLDivElement>) {
    viewport.current?.releasePointerCapture(event.pointerId);
    const { from, fromSide, to, toSide } = connect as ConnectState;
    setConnect(null);
    if (!to || !toSide || to === from) return;
    const duplicate = input.edges.some(
      (edge) => edge.from === from && edge.to === to,
    );
    if (duplicate) return;
    onChange({
      ...input,
      edges: [...input.edges, { from, fromSide, to, toSide }],
    });
  }

  function startNodeDrag(event: React.PointerEvent, node: CanvasNode) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const control = target.closest(
      ".canvas-node-toolbar, .canvas-resize, a, input, textarea, iframe, .canvas-port, button",
    );
    if (control) return;
    const inEditor = Boolean(target.closest(".cm-editor"));
    // Editing the card delegates pointer events to CodeMirror.
    if (editing === node.id && inEditor) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const wasSelected = selected === node.id;
    selectNode(node.id);
    setDrag({
      id: node.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: node.x,
      y: node.y,
      wasSelected,
      moved: false,
    });
  }

  function moveNode(event: React.PointerEvent) {
    if (!drag) return;
    const offsetX = event.clientX - drag.pointerX;
    const offsetY = event.clientY - drag.pointerY;
    if (!drag.moved && Math.abs(offsetX) + Math.abs(offsetY) > 3)
      setDrag({ ...drag, moved: true });
    updateNode(drag.id, {
      x: Math.round(drag.x + offsetX / view.zoom),
      y: Math.round(drag.y + offsetY / view.zoom),
    });
  }

  function endNodeDrag(event: React.PointerEvent) {
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const { id, wasSelected, moved } = drag;
    setDrag(null);
    // First click selects and shows the card menu; a second click edits it.
    if (!moved && wasSelected && editing !== id) setEditing(id);
  }

  function cancelNodeDrag(event: React.PointerEvent) {
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
  }

  function startResize(
    event: React.PointerEvent<HTMLButtonElement>,
    node: CanvasNode,
    direction: CanvasResizeDirection,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    selectNode(node.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const size = nodeSize(node);
    setResize({
      id: node.id,
      direction,
      pointerX: event.clientX,
      pointerY: event.clientY,
      rect: { x: node.x, y: node.y, width: size.width, height: size.height },
    });
  }

  function moveResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (!resize) return;
    const next = resizeNodeRect(
      resize.rect,
      resize.direction,
      (event.clientX - resize.pointerX) / view.zoom,
      (event.clientY - resize.pointerY) / view.zoom,
    );
    updateNode(resize.id, next);
  }

  function endResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (!resize) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setResize(null);
  }

  return (
    <section className="canvas-workspace" aria-label="Lienzo">
      <input
        ref={titleRef}
        className="canvas-title"
        aria-label="Título de nota"
        value={input.title}
        onChange={(event) => onChange({ ...input, title: event.target.value })}
      />
      <div
        ref={viewport}
        className={`canvas-viewport${pan ? " is-panning" : ""}${
          connect ? " is-connecting" : ""
        }${dropActive ? " is-dropping" : ""}`}
        style={{
          backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={startPan}
        onPointerMove={moveViewport}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDragOver={startDrop}
        onDragLeave={leaveDrop}
        onDrop={dropFiles}
      >
        {dropActive && (
          <div className="canvas-drop-overlay" aria-hidden="true">
            <ImageIcon size={26} />
            <span>Suelta la imagen para añadirla</span>
          </div>
        )}
        <div
          className="canvas-world"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        >
          {bounds && (
            <svg
              className="canvas-links"
              style={{
                left: bounds.minX,
                top: bounds.minY,
                width: bounds.width,
                height: bounds.height,
              }}
              viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
            >
              <defs>
                <marker
                  id="canvas-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {connectors.map((link) =>
                link.preview ? (
                  <line
                    key={link.key}
                    className="canvas-link-line is-preview"
                    x1={link.x1}
                    y1={link.y1}
                    x2={link.x2}
                    y2={link.y2}
                    markerEnd="url(#canvas-arrow)"
                  />
                ) : (
                  <g
                    key={link.key}
                    className={`canvas-link${
                      edgeSelected === link.key ? " is-selected" : ""
                    }`}
                  >
                    <line
                      className="canvas-link-hit"
                      x1={link.x1}
                      y1={link.y1}
                      x2={link.x2}
                      y2={link.y2}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelected(null);
                        setEdgeSelected(link.key);
                      }}
                    />
                    <line
                      className="canvas-link-line"
                      x1={link.x1}
                      y1={link.y1}
                      x2={link.x2}
                      y2={link.y2}
                      markerEnd="url(#canvas-arrow)"
                    />
                    <g
                      className="canvas-link-remove"
                      transform={`translate(${(link.x1 + link.x2) / 2} ${
                        (link.y1 + link.y2) / 2
                      })`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeEdge(link.key);
                      }}
                    >
                      <title>Eliminar conexión</title>
                      <circle r={9} />
                      <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" />
                    </g>
                  </g>
                ),
              )}
            </svg>
          )}
          {input.nodes.map((node, index) => {
            const type = nodeType(node);
            const size = nodeSize(node);
            const note = notes.find(
              (candidate) => candidate.id === node.note_id,
            );
            const heading = note
              ? nodeCardHeading(note.title, note.content)
              : null;
            return (
              <article
                key={node.id}
                className={`canvas-node canvas-node--${type}${
                  selected === node.id ? " is-selected" : ""
                }${editing === node.id ? " is-editing" : ""}`}
                data-type={type}
                data-node-id={node.id}
                style={{
                  left: node.x,
                  top: node.y,
                  width: size.width,
                  height: size.height,
                  ...(node.color
                    ? {
                        borderColor: node.color,
                        background: `color-mix(in srgb, ${node.color} 12%, var(--panel))`,
                      }
                    : {}),
                }}
                onPointerDown={(event) => startNodeDrag(event, node)}
                onPointerMove={moveNode}
                onPointerUp={endNodeDrag}
                onPointerCancel={cancelNodeDrag}
                onContextMenu={() => selectNode(node.id)}
              >
                {selected === node.id && (
                  <div
                    className="canvas-node-toolbar"
                    role="toolbar"
                    aria-label={`Acciones de la tarjeta ${index + 1}`}
                  >
                    <button
                      type="button"
                      aria-label={`Eliminar tarjeta ${index + 1}`}
                      title="Eliminar"
                      onClick={() => removeNode(node.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                    <span
                      className="canvas-node-toolbar-divider"
                      aria-hidden="true"
                    />
                    <div className="canvas-node-color">
                      <button
                        type="button"
                        aria-label={`Cambiar color de la tarjeta ${index + 1}`}
                        title="Color"
                        aria-expanded={colorOpen}
                        onClick={() => setColorOpen((open) => !open)}
                      >
                        <Palette size={15} />
                      </button>
                      {colorOpen && (
                        <div
                          className="canvas-node-colors"
                          role="menu"
                          aria-label="Color de tarjeta"
                        >
                          {NODE_COLORS.map((option) => (
                            <button
                              key={option.label}
                              type="button"
                              role="menuitemradio"
                              aria-checked={node.color === option.value}
                              aria-label={option.label}
                              title={option.label}
                              className="canvas-node-color-swatch"
                              style={{ background: option.swatch }}
                              onClick={() => {
                                updateNode(node.id, {
                                  color: option.value ?? undefined,
                                });
                                setColorOpen(false);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {type !== "text" && (
                      <button
                        type="button"
                        disabled={type === "note" ? !note : !node.url}
                        aria-label={`Abrir tarjeta ${index + 1}`}
                        title="Abrir"
                        onClick={() => openNode(node)}
                      >
                        <Maximize2 size={15} />
                      </button>
                    )}
                    {type !== "media" && (
                      <button
                        type="button"
                        aria-label={`Editar tarjeta ${index + 1}`}
                        title="Editar"
                        onClick={() => setEditing(node.id)}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
                )}
                {type === "text" && (
                  <div className="canvas-node-text">
                    <MarkdownEditor
                      content={node.text ?? ""}
                      onChange={(text) => updateNode(node.id, { text })}
                      onWiki={onWiki}
                      onPasteFiles={uploadSnippet}
                      ariaLabel={`Contenido de la tarjeta ${index + 1}`}
                      placeholderText="Escribe una idea…"
                    />
                  </div>
                )}
                {type === "media" && (
                  <div className="canvas-node-media">
                    <CanvasMedia url={node.url ?? ""} />
                  </div>
                )}
                {type === "note" && (
                  <div className="canvas-node-note">
                    <div className="canvas-node-note-body">
                      {note ? (
                        <>
                          {heading && (
                            <h3 className="canvas-node-note-title">
                              {heading}
                            </h3>
                          )}
                          <MarkdownEditor
                            content={note.content}
                            onChange={(content) =>
                              onUpdateNote(note.id, content)
                            }
                            onWiki={onWiki}
                            onPasteFiles={uploadSnippet}
                            ariaLabel={`Contenido de ${note.title}`}
                            placeholderText="Una idea por desarrollar"
                          />
                        </>
                      ) : (
                        <p>Nota no disponible</p>
                      )}
                    </div>
                  </div>
                )}
                {CANVAS_SIDES.map((side) => (
                  <button
                    key={side}
                    type="button"
                    className={`canvas-port canvas-port--${side}`}
                    aria-label={`Conectar tarjeta ${index + 1} por ${SIDE_LABELS[side]}`}
                    title={`Conectar por ${SIDE_LABELS[side]}`}
                    onPointerDown={(event) => startConnect(event, node, side)}
                    onPointerUp={(event) => event.stopPropagation()}
                  />
                ))}
                {RESIZE_DIRECTIONS.map(({ direction, label }) => (
                  <button
                    key={direction}
                    type="button"
                    className={`canvas-resize canvas-resize--${direction}`}
                    aria-label={`Redimensionar tarjeta ${index + 1} desde ${label}`}
                    title={`Redimensionar desde ${label}`}
                    onPointerDown={(event) =>
                      startResize(event, node, direction)
                    }
                    onPointerMove={moveResize}
                    onPointerUp={endResize}
                    onPointerCancel={endResize}
                  />
                ))}
              </article>
            );
          })}
        </div>
        <aside className="canvas-controls" aria-label="Controles del lienzo">
          <button
            type="button"
            aria-label="Acercar"
            title="Acercar"
            onClick={() => zoomBy(1.2)}
          >
            <ZoomIn size={17} />
          </button>
          <span className="canvas-zoom-value" aria-hidden="true">
            {Math.round(view.zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Alejar"
            title="Alejar"
            onClick={() => zoomBy(1 / 1.2)}
          >
            <ZoomOut size={17} />
          </button>
          <button
            type="button"
            aria-label="Restablecer zoom"
            title="Restablecer zoom"
            onClick={resetZoom}
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            aria-label="Ajustar a contenido"
            title="Ajustar a contenido"
            onClick={fitContent}
          >
            <Maximize2 size={17} />
          </button>
        </aside>
        <div
          className="canvas-toolbar"
          role="toolbar"
          aria-label="Crear en el lienzo"
        >
          <button
            type="button"
            onClick={() => addNode({ type: "text", text: "Nueva tarjeta" })}
          >
            <StickyNote size={17} />
            <span>Tarjeta</span>
          </button>
          <button
            type="button"
            aria-expanded={noteOpen}
            onClick={() => setNoteOpen(true)}
          >
            <FileText size={17} />
            <span>Nota</span>
          </button>
          <button
            type="button"
            aria-expanded={mediaOpen}
            onClick={() => setMediaOpen((open) => !open)}
          >
            <ImageIcon size={17} />
            <span>Media</span>
          </button>
          {mediaOpen && (
            <form
              className="canvas-media-form"
              onSubmit={(event) => {
                event.preventDefault();
                addMedia();
              }}
            >
              <label>
                URL de imagen, vídeo o YouTube
                <input
                  autoFocus
                  aria-label="URL de medios"
                  placeholder="https://…"
                  value={mediaUrl}
                  onChange={(event) => {
                    setMediaUrl(event.target.value);
                    setMediaError("");
                  }}
                />
              </label>
              {mediaError && <p role="alert">{mediaError}</p>}
              {uploadError && <p role="alert">{uploadError}</p>}
              <div className="canvas-media-actions">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => deviceInput.current?.click()}
                >
                  <ImagePlus size={14} aria-hidden="true" />
                  Subir imagen
                </button>
                <button type="button" onClick={() => setMediaOpen(false)}>
                  Cancelar
                </button>
                <button type="submit">Añadir</button>
              </div>
              <input
                ref={deviceInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  void addUploadedImages([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
            </form>
          )}
          {uploading && !mediaOpen && (
            <p className="canvas-upload-status" role="status">
              Subiendo imagen…
            </p>
          )}
          {uploadError && !mediaOpen && (
            <p className="canvas-upload-status is-error" role="alert">
              {uploadError}
            </p>
          )}
        </div>
      </div>
      {noteOpen && (
        <CanvasNotePicker
          notes={notes}
          busy={busy}
          onSelect={addExistingNote}
          onCreate={(title) => void addNoteCard(title)}
          onClose={() => setNoteOpen(false)}
        />
      )}
    </section>
  );
}

/** Reuses an existing note on the canvas or creates one when the title is new. */
function CanvasNotePicker({
  notes,
  busy,
  onSelect,
  onCreate,
  onClose,
}: {
  notes: Note[];
  busy: boolean;
  onSelect: (note: Note) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const trimmed = query.trim();
  const normalized = trimmed.toLocaleLowerCase();
  const candidates = notes.filter((note) => note.kind === "note");
  const matches = candidates
    .filter(
      (note) =>
        !normalized ||
        note.title.toLocaleLowerCase().includes(normalized) ||
        note.content.toLocaleLowerCase().includes(normalized),
    )
    .slice(0, 100);
  const exists = candidates.some(
    (note) => note.title.toLocaleLowerCase() === normalized,
  );
  const canCreate = Boolean(trimmed) && !exists;
  const active = Math.min(selected, Math.max(matches.length - 1, 0));
  return (
    <Modal title="Añadir nota" onClose={onClose}>
      <div className="workspace-picker">
        <input
          data-autofocus
          role="combobox"
          aria-label="Buscar o crear nota"
          aria-expanded="true"
          aria-controls="canvas-note-options"
          aria-activedescendant={
            matches[active] ? `canvas-note-option-${active}` : undefined
          }
          value={query}
          placeholder="Busca en tus notas…"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((current) =>
                Math.min(current + 1, Math.max(matches.length - 1, 0)),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (busy) return;
              if (matches[active]) onSelect(matches[active]);
              else if (canCreate) onCreate(trimmed);
            }
          }}
        />
        <div
          id="canvas-note-options"
          role="listbox"
          aria-label="Notas existentes"
          className="workspace-options"
        >
          {matches.map((note, index) => (
            <button
              id={`canvas-note-option-${index}`}
              key={note.id}
              role="option"
              aria-selected={active === index}
              disabled={busy}
              onClick={() => onSelect(note)}
            >
              <span>{note.title}</span>
              <small>{note.content.slice(0, 100)}</small>
            </button>
          ))}
        </div>
        {!matches.length && (
          <p className="muted">
            {trimmed
              ? "No hay notas que coincidan."
              : "Todavía no hay notas. Escribe un título para crearla."}
          </p>
        )}
        {canCreate && (
          <button disabled={busy} onClick={() => onCreate(trimmed)}>
            Crear «{trimmed}»
          </button>
        )}
        <p className="muted">↑ ↓ Seleccionar · Enter Añadir · Esc Cerrar</p>
      </div>
    </Modal>
  );
}

function CanvasMedia({ url }: { url: string }) {
  const source = mediaSource(url);
  if (source.kind === "youtube")
    return (
      <iframe
        title={`Vídeo de YouTube ${source.id}`}
        src={`https://www.youtube-nocookie.com/embed/${source.id}`}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  if (source.kind === "image")
    return <img src={source.url} alt="" loading="lazy" />;
  if (source.kind === "video") return <video src={source.url} controls />;
  return (
    <a href={source.url} target="_blank" rel="noreferrer">
      {source.url}
    </a>
  );
}
