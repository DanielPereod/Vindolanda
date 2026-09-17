import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, RotateCcw, X } from "lucide-react";
import { useResource } from "./api";
import type { Attachment } from "./attachments";
import {
  DEFAULT_GRAPH_FILTERS,
  DEFAULT_GRAPH_FORCES,
  GRAPH_GROUP_COLORS,
  GRAPH_KIND_COLORS,
  buildGraph,
  compileGroups,
  filterGraph,
  groupColor,
  seedPosition,
  simulateStep,
} from "./graph";
import type {
  CompiledGraphGroup,
  Graph,
  GraphFilters,
  GraphForces,
  GraphGroup,
  GraphNode,
  SimulationNode,
} from "./graph";
import type { Note, NoteFolder } from "./notes";

interface GraphViewProps {
  notes: Note[];
  onOpen: (noteId: string) => void;
  onCreateNote: (title: string) => void;
}

interface GraphDisplaySettings {
  nodeSize: number;
  textFade: number;
  linkThickness: number;
}

const DEFAULT_GRAPH_DISPLAY: GraphDisplaySettings = {
  nodeSize: 1,
  textFade: 6,
  linkThickness: 1,
};

type GraphSectionName = "filters" | "groups" | "display" | "forces";

const DEFAULT_SECTIONS: Record<GraphSectionName, boolean> = {
  filters: true,
  groups: true,
  display: false,
  forces: false,
};

let paletteCache = { theme: "\u0000", text: "#e1e4eb", ink: 150 };

function themePalette() {
  const theme = document.documentElement.dataset.theme ?? "";
  if (paletteCache.theme !== theme) {
    const styles = getComputedStyle(document.documentElement);
    paletteCache = {
      theme,
      text: styles.getPropertyValue("--text").trim() || "#e1e4eb",
      ink: theme === "light" ? 110 : 150,
    };
  }
  return paletteCache;
}

function nodeRadius(node: GraphNode, display: GraphDisplaySettings): number {
  const base =
    node.kind === "tag" ? 3 : 4 + Math.min(node.degree, 14) * 0.9;
  return base * display.nodeSize;
}

function newGroupId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `group-${Date.now()}`;
}

/** Obsidian-style global graph: force layout over notes, tags and attachments. */
export function GraphView({ notes, onOpen, onCreateNote }: GraphViewProps) {
  const foldersQuery = useResource<NoteFolder[]>("/note-folders");
  const attachmentsQuery = useResource<Attachment[]>("/attachments");
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_GRAPH_FILTERS);
  const [groups, setGroups] = useState<GraphGroup[]>([]);
  const [display, setDisplay] = useState<GraphDisplaySettings>(
    DEFAULT_GRAPH_DISPLAY,
  );
  const [forces, setForces] = useState<GraphForces>(DEFAULT_GRAPH_FORCES);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sections, setSections] =
    useState<Record<GraphSectionName, boolean>>(DEFAULT_SECTIONS);
  const [groupDraft, setGroupDraft] = useState("");
  const [groupColorDraft, setGroupColorDraft] = useState(
    GRAPH_GROUP_COLORS[0] ?? "#e05252",
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimulationNode[]>([]);
  const indexRef = useRef(new Map<string, SimulationNode>());
  const nodeMapRef = useRef(new Map<string, GraphNode>());
  const graphRef = useRef<Graph>({ nodes: [], edges: [] });
  const groupsRef = useRef<CompiledGraphGroup[]>([]);
  const displayRef = useRef(display);
  const forcesRef = useRef(forces);
  const alphaRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 });
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const dragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    clientX: number;
    clientY: number;
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{
    clientX: number;
    clientY: number;
    viewX: number;
    viewY: number;
  } | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const loopRef = useRef<() => void>(() => {});
  const initializedRef = useRef(false);
  const openRef = useRef(onOpen);
  const createRef = useRef(onCreateNote);
  openRef.current = onOpen;
  createRef.current = onCreateNote;

  const folderList = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const attachmentList = useMemo(
    () => attachmentsQuery.data ?? [],
    [attachmentsQuery.data],
  );
  const fullGraph = useMemo(
    () => buildGraph(notes, folderList, attachmentList),
    [notes, folderList, attachmentList],
  );
  const graph = useMemo(() => filterGraph(fullGraph, filters), [fullGraph, filters]);
  const compiledGroups = useMemo(() => compileGroups(groups), [groups]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const { width, height } = sizeRef.current;
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const view = viewRef.current;
    const settings = displayRef.current;
    const current = graphRef.current;
    const nodes = nodesRef.current;
    const index = indexRef.current;
    const nodeMap = nodeMapRef.current;
    const palette = themePalette();
    const active = hoverRef.current ?? selectedRef.current;
    const highlighted = new Set<string>();
    if (active) {
      highlighted.add(active);
      for (const edge of current.edges) {
        if (edge.source === active) highlighted.add(edge.target);
        if (edge.target === active) highlighted.add(edge.source);
      }
    }

    context.lineCap = "round";
    for (const edge of current.edges) {
      const source = index.get(edge.source);
      const target = index.get(edge.target);
      if (!source || !target) continue;
      const isActive =
        active !== null && (edge.source === active || edge.target === active);
      const alpha = isActive ? 0.9 : active ? 0.08 : 0.26;
      context.beginPath();
      context.moveTo(source.x * view.zoom + view.x, source.y * view.zoom + view.y);
      context.lineTo(target.x * view.zoom + view.x, target.y * view.zoom + view.y);
      context.strokeStyle = `rgba(${palette.ink},${palette.ink + 6},${palette.ink + 20},${alpha})`;
      context.lineWidth = (isActive ? 1.7 : 0.8) * settings.linkThickness;
      context.stroke();
    }

    for (const node of nodes) {
      const data = nodeMap.get(node.id);
      if (!data) continue;
      const radius = Math.max(nodeRadius(data, settings) * view.zoom, 1);
      const x = node.x * view.zoom + view.x;
      const y = node.y * view.zoom + view.y;
      const color = groupColor(data, groupsRef.current) ?? GRAPH_KIND_COLORS[data.kind];
      context.globalAlpha = active && !highlighted.has(node.id) ? 0.25 : 1;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      if (data.kind === "missing") {
        context.lineWidth = 1.5;
        context.strokeStyle = color;
        context.stroke();
      } else {
        context.fillStyle = color;
        context.fill();
      }
      if (view.zoom * 10 >= settings.textFade || node.id === active) {
        context.fillStyle = palette.text;
        context.font = `${Math.max(9, Math.round(11 * Math.min(view.zoom, 1.4)))}px system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(data.label, x, y + radius + 3);
      }
      context.globalAlpha = 1;
    }
  }, []);

  const startLoop = useCallback(() => {
    if (frameRef.current !== null) return;
    const step = () => {
      frameRef.current = null;
      const { width, height } = sizeRef.current;
      if (alphaRef.current > 0.004) {
        simulateStep(
          nodesRef.current,
          graphRef.current.edges,
          indexRef.current,
          forcesRef.current,
          alphaRef.current,
          width || 800,
          height || 600,
        );
        alphaRef.current = Math.max(0, alphaRef.current - 0.012);
        drawRef.current();
        frameRef.current = window.requestAnimationFrame(step);
      } else {
        drawRef.current();
      }
    };
    frameRef.current = window.requestAnimationFrame(step);
  }, []);

  drawRef.current = draw;
  loopRef.current = startLoop;

  useEffect(() => {
    graphRef.current = graph;
    groupsRef.current = compiledGroups;
    nodeMapRef.current = new Map(graph.nodes.map((node) => [node.id, node]));
    drawRef.current();
  }, [graph, compiledGroups]);

  useEffect(() => {
    displayRef.current = display;
    drawRef.current();
  }, [display]);

  useEffect(() => {
    forcesRef.current = forces;
    alphaRef.current = Math.max(alphaRef.current, 0.7);
    loopRef.current();
  }, [forces]);

  useEffect(() => {
    const { width, height } = sizeRef.current;
    const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
    const index = new Map<string, SimulationNode>();
    const nodes: SimulationNode[] = [];
    for (const node of graph.nodes) {
      const existing = previous.get(node.id);
      if (existing) {
        index.set(node.id, existing);
        nodes.push(existing);
        continue;
      }
      const seed = seedPosition(node.id, width || 800, height || 600);
      const created: SimulationNode = {
        id: node.id,
        x: seed.x,
        y: seed.y,
        vx: 0,
        vy: 0,
      };
      index.set(node.id, created);
      nodes.push(created);
    }
    nodesRef.current = nodes;
    indexRef.current = index;
    alphaRef.current = nodes.length
      ? initializedRef.current
        ? 0.5
        : 1
      : 0;
    initializedRef.current = true;
    loopRef.current();
  }, [graph]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height };
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      drawRef.current();
      loopRef.current();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas: HTMLCanvasElement = element;

    function world(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const view = viewRef.current;
      return {
        x: (clientX - rect.left - view.x) / view.zoom,
        y: (clientY - rect.top - view.y) / view.zoom,
      };
    }
    function nodeAt(x: number, y: number): SimulationNode | null {
      const view = viewRef.current;
      let best: SimulationNode | null = null;
      let bestDistance = Infinity;
      for (const node of nodesRef.current) {
        const data = nodeMapRef.current.get(node.id);
        if (!data) continue;
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.hypot(dx, dy);
        const threshold = nodeRadius(data, displayRef.current) + 6 / view.zoom;
        if (distance < threshold && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      }
      return best;
    }
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const view = viewRef.current;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const zoom = Math.min(4, Math.max(0.15, view.zoom * factor));
      const scale = zoom / view.zoom;
      view.x = pointerX - (pointerX - view.x) * scale;
      view.y = pointerY - (pointerY - view.y) * scale;
      view.zoom = zoom;
      drawRef.current();
    }
    function pointerDown(event: PointerEvent) {
      canvas.setPointerCapture(event.pointerId);
      const point = world(event.clientX, event.clientY);
      const node = nodeAt(point.x, point.y);
      if (node) {
        dragRef.current = {
          id: node.id,
          offsetX: node.x - point.x,
          offsetY: node.y - point.y,
          clientX: event.clientX,
          clientY: event.clientY,
          moved: false,
        };
        selectedRef.current = node.id;
      } else {
        panRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
          viewX: viewRef.current.x,
          viewY: viewRef.current.y,
        };
      }
    }
    function pointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (drag) {
        const point = world(event.clientX, event.clientY);
        const node = indexRef.current.get(drag.id);
        if (node) {
          node.x = point.x + drag.offsetX;
          node.y = point.y + drag.offsetY;
          node.vx = 0;
          node.vy = 0;
        }
        if (
          !drag.moved &&
          Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >
            4
        )
          drag.moved = true;
        alphaRef.current = Math.max(alphaRef.current, 0.4);
        drawRef.current();
        loopRef.current();
        return;
      }
      const pan = panRef.current;
      if (pan) {
        viewRef.current.x = pan.viewX + (event.clientX - pan.clientX);
        viewRef.current.y = pan.viewY + (event.clientY - pan.clientY);
        drawRef.current();
        return;
      }
      const point = world(event.clientX, event.clientY);
      const node = nodeAt(point.x, point.y);
      const identifier = node?.id ?? null;
      if (hoverRef.current !== identifier) {
        hoverRef.current = identifier;
        canvas.style.cursor = identifier ? "pointer" : "grab";
        drawRef.current();
      }
    }
    function pointerUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      panRef.current = null;
      if (!drag) return;
      if (drag.moved) return;
      const data = nodeMapRef.current.get(drag.id);
      if (data?.kind === "missing") createRef.current(data.label);
      else if (data?.noteId) openRef.current(data.noteId);
    }
    function pointerLeave() {
      panRef.current = null;
      if (hoverRef.current !== null) {
        hoverRef.current = null;
        drawRef.current();
      }
    }
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("pointerleave", pointerLeave);
    return () => {
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("pointerleave", pointerLeave);
    };
  }, []);

  function toggleSection(name: GraphSectionName) {
    setSections((current) => ({ ...current, [name]: !current[name] }));
  }
  function addGroup() {
    const query = groupDraft.trim();
    if (!query) return;
    setGroups((current) => [
      ...current,
      { id: newGroupId(), query, color: groupColorDraft },
    ]);
    setGroupDraft("");
    const next = GRAPH_GROUP_COLORS[groups.length % GRAPH_GROUP_COLORS.length];
    if (next) setGroupColorDraft(next);
  }
  function removeGroup(identifier: string) {
    setGroups((current) => current.filter((group) => group.id !== identifier));
  }
  function resetView() {
    viewRef.current = { x: 0, y: 0, zoom: 1 };
    alphaRef.current = 1;
    loopRef.current();
  }

  const isLoading = foldersQuery.isPending || attachmentsQuery.isPending;

  return (
    <div className="graph-shell">
      <div className="graph-canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          role="img"
          aria-label={`Gráfico de ${graph.nodes.length} nodos y ${graph.edges.length} enlaces`}
        />
        <div className="graph-hud">
          <span>
            {graph.nodes.length} nodos · {graph.edges.length} enlaces
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Restablecer vista"
            title="Restablecer vista"
            onClick={resetView}
          >
            <RotateCcw size={15} />
          </button>
          {!panelOpen && (
            <button
              type="button"
              className="secondary graph-open-panel"
              onClick={() => setPanelOpen(true)}
            >
              Filtros
            </button>
          )}
        </div>
        {isLoading && <p className="graph-loading">Cargando…</p>}
        {graph.nodes.length === 0 && !isLoading && (
          <div className="graph-empty">
            <p>No hay notas que mostrar.</p>
            <p className="muted">
              Crea notas y conéctalas con [[wikilinks]] para ver el gráfico.
            </p>
          </div>
        )}
      </div>

      {panelOpen && (
        <aside className="graph-panel" aria-label="Ajustes del gráfico">
          <header className="graph-panel-head">
            <strong>Gráfico</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Cerrar ajustes"
              title="Cerrar ajustes"
              onClick={() => setPanelOpen(false)}
            >
              <X size={15} />
            </button>
          </header>

          <GraphSection
            title="Filtros"
            open={sections.filters}
            onToggle={() => toggleSection("filters")}
          >
            <input
              className="graph-search"
              aria-label="Filtrar el gráfico"
              placeholder="Filtrar… (path:, tag:, -)"
              value={filters.query}
              onChange={(event) =>
                setFilters({ ...filters, query: event.target.value })
              }
            />
            <GraphSwitch
              label="Etiquetas"
              checked={filters.showTags}
              onChange={(value) => setFilters({ ...filters, showTags: value })}
            />
            <GraphSwitch
              label="Adjuntos"
              checked={filters.showAttachments}
              onChange={(value) =>
                setFilters({ ...filters, showAttachments: value })
              }
            />
            <GraphSwitch
              label="Solo archivos existentes"
              checked={filters.existingOnly}
              onChange={(value) =>
                setFilters({ ...filters, existingOnly: value })
              }
            />
            <GraphSwitch
              label="Huérfanos"
              checked={filters.showOrphans}
              onChange={(value) =>
                setFilters({ ...filters, showOrphans: value })
              }
            />
          </GraphSection>

          <GraphSection
            title="Grupos"
            open={sections.groups}
            onToggle={() => toggleSection("groups")}
          >
            {groups.map((group) => (
              <div className="graph-group-row" key={group.id}>
                <span
                  className="graph-group-swatch"
                  style={{ background: group.color }}
                  aria-hidden="true"
                />
                <span className="graph-group-query" title={group.query}>
                  {group.query}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Quitar grupo ${group.query}`}
                  onClick={() => removeGroup(group.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <form
              className="graph-group-add"
              onSubmit={(event) => {
                event.preventDefault();
                addGroup();
              }}
            >
              <input
                aria-label="Consulta del grupo"
                placeholder='tag:#idea o ["clave":"valor"]'
                value={groupDraft}
                onChange={(event) => setGroupDraft(event.target.value)}
              />
              <input
                type="color"
                aria-label="Color del grupo"
                value={groupColorDraft}
                onChange={(event) => setGroupColorDraft(event.target.value)}
              />
              <button
                type="submit"
                className="icon-button"
                aria-label="Añadir grupo"
                title="Añadir grupo"
                disabled={!groupDraft.trim()}
              >
                <Plus size={14} />
              </button>
            </form>
          </GraphSection>

          <GraphSection
            title="Mostrar"
            open={sections.display}
            onToggle={() => toggleSection("display")}
          >
            <GraphSlider
              label="Tamaño de nodo"
              value={display.nodeSize}
              min={0.5}
              max={2.5}
              step={0.1}
              onChange={(value) => setDisplay({ ...display, nodeSize: value })}
            />
            <GraphSlider
              label="Umbral de texto"
              value={display.textFade}
              min={0}
              max={20}
              step={1}
              onChange={(value) => setDisplay({ ...display, textFade: value })}
            />
            <GraphSlider
              label="Grosor de enlaces"
              value={display.linkThickness}
              min={0.2}
              max={3}
              step={0.1}
              onChange={(value) =>
                setDisplay({ ...display, linkThickness: value })
              }
            />
          </GraphSection>

          <GraphSection
            title="Fuerzas"
            open={sections.forces}
            onToggle={() => toggleSection("forces")}
          >
            <GraphSlider
              label="Fuerza central"
              value={forces.center}
              min={0}
              max={0.3}
              step={0.005}
              onChange={(value) => setForces({ ...forces, center: value })}
            />
            <GraphSlider
              label="Fuerza de repulsión"
              value={forces.repel}
              min={0}
              max={800}
              step={10}
              onChange={(value) => setForces({ ...forces, repel: value })}
            />
            <GraphSlider
              label="Fuerza de enlace"
              value={forces.link}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => setForces({ ...forces, link: value })}
            />
            <GraphSlider
              label="Distancia de enlace"
              value={forces.distance}
              min={20}
              max={200}
              step={5}
              onChange={(value) => setForces({ ...forces, distance: value })}
            />
          </GraphSection>
        </aside>
      )}
    </div>
  );
}

function GraphSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="graph-section">
      <button
        type="button"
        className="graph-section-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
      </button>
      {open && <div className="graph-section-body">{children}</div>}
    </section>
  );
}

function GraphSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="graph-switch">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="graph-switch-track" aria-hidden="true" />
    </label>
  );
}

function GraphSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="graph-slider">
      <span>
        {label}
        <em>{Number.isInteger(step) ? value : value.toFixed(2)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
