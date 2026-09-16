import { describe, expect, it } from "vitest";
import {
  MAX_NODE_HEIGHT,
  MAX_NODE_WIDTH,
  MAX_ZOOM,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_ZOOM,
  edgeSides,
  facingSide,
  fitView,
  mediaSource,
  nearestSide,
  nodeAnchor,
  nodeCardHeading,
  nodeSize,
  nodeType,
  resizeNodeRect,
  zoomAt,
  youtubeIdentifier,
} from "./canvas";
import type { CanvasNode } from "./notes";

function node(partial: Partial<CanvasNode>): CanvasNode {
  return { id: "n", x: 0, y: 0, ...partial };
}

describe("nodeType", () => {
  it("treats untagged nodes as note references", () => {
    expect(nodeType({})).toBe("note");
    expect(nodeType({ type: "text" })).toBe("text");
    expect(nodeType({ type: "media" })).toBe("media");
  });
});

describe("nodeCardHeading", () => {
  it("shows the note title when the content does not repeat it", () => {
    expect(nodeCardHeading("Mente", "")).toBe("Mente");
    expect(nodeCardHeading("Mente", "Cuerpo de la nota.")).toBe("Mente");
    expect(nodeCardHeading("Mente", "# Otra cosa")).toBe("Mente");
  });

  it("omits the title when the first heading already matches it", () => {
    expect(nodeCardHeading("Mente", "# Mente\n\n- Punto")).toBeNull();
    expect(nodeCardHeading("Mente", "## mente\n\nCuerpo")).toBeNull();
  });

  it("ignores an empty title", () => {
    expect(nodeCardHeading("   ", "# Mente")).toBeNull();
  });
});

describe("nodeSize", () => {
  it("prefers stored dimensions and falls back to type defaults", () => {
    expect(nodeSize(node({ type: "media" }))).toEqual({
      width: 340,
      height: 220,
    });
    expect(nodeSize(node({ type: "text", width: 500, height: 90 }))).toEqual({
      width: 500,
      height: 90,
    });
  });
});

describe("resizeNodeRect", () => {
  const rect = { x: 100, y: 100, width: 300, height: 200 };

  it("grows and shrinks from the south-east corner", () => {
    expect(resizeNodeRect(rect, "se", 50, 40)).toEqual({
      x: 100,
      y: 100,
      width: 350,
      height: 240,
    });
    expect(resizeNodeRect(rect, "se", -50, -40)).toEqual({
      x: 100,
      y: 100,
      width: 250,
      height: 160,
    });
  });

  it("keeps the opposite edge fixed when resizing from the north-west", () => {
    expect(resizeNodeRect(rect, "nw", -50, -40)).toEqual({
      x: 50,
      y: 60,
      width: 350,
      height: 240,
    });
  });

  it("clamps to the minimum and maximum size", () => {
    expect(resizeNodeRect(rect, "se", -1000, -1000)).toEqual({
      x: 100,
      y: 100,
      width: MIN_NODE_WIDTH,
      height: MIN_NODE_HEIGHT,
    });
    expect(resizeNodeRect(rect, "se", 10000, 10000)).toEqual({
      x: 100,
      y: 100,
      width: MAX_NODE_WIDTH,
      height: MAX_NODE_HEIGHT,
    });
    expect(resizeNodeRect(rect, "nw", 10000, 10000)).toEqual({
      x: 100 + 300 - MIN_NODE_WIDTH,
      y: 100 + 200 - MIN_NODE_HEIGHT,
      width: MIN_NODE_WIDTH,
      height: MIN_NODE_HEIGHT,
    });
  });
});

describe("nodeAnchor", () => {
  it("returns the midpoint of the requested side", () => {
    const card = node({ type: "text", width: 200, height: 100 });
    expect(nodeAnchor(card, "top")).toEqual({ x: 100, y: 0 });
    expect(nodeAnchor(card, "right")).toEqual({ x: 200, y: 50 });
    expect(nodeAnchor(card, "bottom")).toEqual({ x: 100, y: 100 });
    expect(nodeAnchor(card, "left")).toEqual({ x: 0, y: 50 });
  });
});

describe("nearestSide", () => {
  it("snaps a point to the dominant side of the card", () => {
    const card = node({ type: "text", width: 200, height: 100 });
    expect(nearestSide(card, { x: 400, y: 50 })).toBe("right");
    expect(nearestSide(card, { x: 100, y: -30 })).toBe("top");
    expect(nearestSide(card, { x: -50, y: 50 })).toBe("left");
    expect(nearestSide(card, { x: 100, y: 400 })).toBe("bottom");
  });
});

describe("facingSide", () => {
  it("points at the neighboring card", () => {
    const left = node({ type: "text", width: 100, height: 100 });
    const right = node({
      id: "b",
      x: 400,
      y: 0,
      type: "text",
      width: 100,
      height: 100,
    });
    expect(facingSide(left, right)).toBe("right");
    expect(facingSide(right, left)).toBe("left");
  });
});

describe("edgeSides", () => {
  it("keeps stored sides and derives missing ones", () => {
    const from = node({ type: "text", width: 100, height: 100 });
    const to = node({
      id: "b",
      x: 400,
      y: 0,
      type: "text",
      width: 100,
      height: 100,
    });
    expect(edgeSides({ fromSide: "top", toSide: "bottom" }, from, to)).toEqual({
      fromSide: "top",
      toSide: "bottom",
    });
    expect(edgeSides({}, from, to)).toEqual({
      fromSide: "right",
      toSide: "left",
    });
  });
});

describe("zoomAt", () => {
  it("keeps the pointer anchored while zooming", () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const zoomed = zoomAt(view, 2, 100, 100);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.x).toBe(-100);
    expect(zoomed.y).toBe(-100);
  });

  it("clamps zoom between the configured limits", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 100, 0, 0).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0.0001, 0, 0).zoom).toBe(MIN_ZOOM);
  });
});

describe("fitView", () => {
  it("centers the visible cards", () => {
    const view = fitView(
      [node({ x: 0, y: 0 }), node({ id: "b", x: 400, y: 400 })],
      1000,
      1000,
    );
    expect(view.zoom).toBeGreaterThan(0);
    expect(view.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    const left = view.x;
    const right = view.x + 700 * view.zoom;
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(1000);
  });

  it("returns the identity view for an empty canvas", () => {
    expect(fitView([], 800, 600)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("mediaSource", () => {
  it("recognizes YouTube watch, short and embed links", () => {
    expect(youtubeIdentifier("https://www.youtube.com/watch?v=abc123")).toBe(
      "abc123",
    );
    expect(youtubeIdentifier("https://youtu.be/xyz789")).toBe("xyz789");
    expect(youtubeIdentifier("https://www.youtube.com/shorts/short1")).toBe(
      "short1",
    );
    expect(mediaSource("https://youtu.be/xyz789")).toEqual({
      kind: "youtube",
      id: "xyz789",
    });
  });

  it("recognizes images and videos by extension", () => {
    expect(mediaSource("https://example.com/cat.png?size=2")).toEqual({
      kind: "image",
      url: "https://example.com/cat.png?size=2",
    });
    expect(mediaSource("https://example.com/clip.webm")).toEqual({
      kind: "video",
      url: "https://example.com/clip.webm",
    });
  });

  it("falls back to a plain link", () => {
    expect(mediaSource("https://example.com/article")).toEqual({
      kind: "link",
      url: "https://example.com/article",
    });
    expect(youtubeIdentifier("not a url")).toBeNull();
  });
});
