import { describe, expect, it } from "vitest";
import type { Note } from "./notes";
import {
  DEFAULT_GRAPH_FILTERS,
  buildGraph,
  compileGroups,
  contentTags,
  filterGraph,
  groupColor,
  parseGraphQuery,
  propertyTags,
  seedPosition,
  simulateStep,
} from "./graph";
import type { GraphForces } from "./graph";

function note(input: Partial<Note> & { id: string; title: string }): Note {
  return {
    kind: "note",
    content: "",
    properties: {},
    nodes: [],
    edges: [],
    filter: "",
    sort: "",
    folder_id: null,
    updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...input,
  };
}

describe("graph semantics", () => {
  it("extracts prose tags but ignores fenced and inline code", () => {
    expect(contentTags("#work keep `#inline` ```\n#code\n```")).toEqual(["work"]);
    expect(contentTags("nada")).toEqual([]);
  });

  it("collects tag properties split on commas and semicolons", () => {
    expect(propertyTags({ tags: "uno, dos;tres", fecha: "2026" })).toEqual([
      "uno",
      "dos",
      "tres",
    ]);
  });

  it("links notes to resolved targets, tags and unresolved references", () => {
    const graph = buildGraph([
      note({ id: "1", title: "Alpha", content: "[[Beta]] [[Ghost]] #idea" }),
      note({ id: "2", title: "beta", content: "" }),
    ]);
    const alpha = graph.nodes.find((node) => node.id === "note:1");
    expect(alpha?.tags).toEqual(["idea"]);
    expect(alpha?.degree).toBe(3);
    expect(graph.nodes.some((node) => node.id === "missing:ghost")).toBe(true);
    expect(graph.nodes.some((node) => node.id === "tag:idea")).toBe(true);
    expect(
      graph.edges.some(
        (edge) => edge.source === "note:1" && edge.target === "note:2",
      ),
    ).toBe(true);
  });

  it("filters by query, orphans and existing files", () => {
    const graph = buildGraph([
      note({ id: "1", title: "Alpha", content: "[[Beta]] [[Ghost]] #idea" }),
      note({ id: "2", title: "Beta", content: "" }),
      note({ id: "3", title: "Suelta", content: "" }),
    ]);
    const onlyExisting = filterGraph(graph, {
      ...DEFAULT_GRAPH_FILTERS,
      existingOnly: true,
    });
    expect(onlyExisting.nodes.some((node) => node.kind === "missing")).toBe(
      false,
    );

    const noOrphans = filterGraph(graph, {
      ...DEFAULT_GRAPH_FILTERS,
      showOrphans: false,
    });
    expect(noOrphans.nodes.some((node) => node.id === "note:3")).toBe(false);

    const query = filterGraph(graph, {
      ...DEFAULT_GRAPH_FILTERS,
      query: "tag:#idea -path:privado",
    });
    expect(query.nodes.some((node) => node.id === "note:1")).toBe(true);
    expect(query.nodes.some((node) => node.id === "note:2")).toBe(false);

    const noTags = filterGraph(graph, {
      ...DEFAULT_GRAPH_FILTERS,
      showTags: false,
    });
    expect(noTags.nodes.some((node) => node.kind === "tag")).toBe(false);
  });

  it("parses negation, fields and property tokens", () => {
    expect(parseGraphQuery('-path:Templates tag:#x ["tipo":"nota"] hola')).toEqual(
      [
        { negated: true, field: "path", value: "templates", key: "" },
        { negated: false, field: "tag", value: "x", key: "" },
        { negated: false, field: "property", key: "tipo", value: "nota" },
        { negated: false, field: "text", value: "hola", key: "" },
      ],
    );
  });

  it("colors nodes with the first matching group", () => {
    const graph = buildGraph([
      note({ id: "1", title: "Alpha", content: "#idea", properties: { tipo: "nota" } }),
    ]);
    const alpha = graph.nodes.find((node) => node.id === "note:1");
    expect(alpha).toBeDefined();
    const groups = compileGroups([
      { id: "a", query: "tag:#idea", color: "#111111" },
      { id: "b", query: '["tipo":"nota"]', color: "#222222" },
    ]);
    expect(alpha ? groupColor(alpha, groups) : null).toBe("#111111");
  });

  it("seeds stable positions and pushes unlinked nodes apart", () => {
    expect(seedPosition("note:1", 800, 600)).toEqual(
      seedPosition("note:1", 800, 600),
    );
    const forces: GraphForces = {
      center: 0,
      repel: 320,
      link: 0,
      distance: 70,
    };
    const nodes = [
      { id: "a", x: 400, y: 300, vx: 0, vy: 0 },
      { id: "b", x: 402, y: 300, vx: 0, vy: 0 },
    ];
    const index = new Map(nodes.map((node) => [node.id, node]));
    simulateStep(nodes, [], index, forces, 1, 800, 600);
    const before = Math.abs(402 - 400);
    const after = Math.abs((nodes[1]?.x ?? 0) - (nodes[0]?.x ?? 0));
    expect(after).toBeGreaterThan(before);
  });

  it("pulls linked nodes toward the link distance", () => {
    const forces: GraphForces = {
      center: 0,
      repel: 0,
      link: 1,
      distance: 50,
    };
    const nodes = [
      { id: "a", x: 100, y: 300, vx: 0, vy: 0 },
      { id: "b", x: 700, y: 300, vx: 0, vy: 0 },
    ];
    const index = new Map(nodes.map((node) => [node.id, node]));
    simulateStep(
      nodes,
      [{ id: "e", source: "a", target: "b", kind: "link", weight: 1 }],
      index,
      forces,
      1,
      800,
      600,
    );
    const distance = Math.abs((nodes[1]?.x ?? 0) - (nodes[0]?.x ?? 0));
    expect(distance).toBeLessThan(600);
  });
});
