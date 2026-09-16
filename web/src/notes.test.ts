import { describe, expect, it } from "vitest";
import {
  wikiTargets,
  wikiMarkdown,
  filterNotes,
  moveBlock,
  splitBlocks,
} from "./notes";

describe("note semantics", () => {
  it("renders renamed targets using stored identity without changing explicit aliases", () => {
    const links = [{ target_title: "Old", current_title: "New" }];
    expect(wikiMarkdown("[[Old]] [[Old|Alias]] [[Old#Heading]]", links)).toBe("[New](#/wiki/Old) [Alias](#/wiki/Old) [New#Heading](#/wiki/Old%23Heading)");
  });
  it("keeps code fences intact when editing or moving blocks", () => {
    expect(splitBlocks("Intro\n\n```js\nfirst\n\nsecond\n```\n\nEnd")).toEqual([
      "Intro",
      "```js\nfirst\n\nsecond\n```",
      "End",
    ]);
  });
  it("deduplicates wikilinks and resolves aliases without interpreting code", () => {
    expect(
      wikiTargets("[[Idea|read]] [[Idea]] `[[ignored]]`\n```\n[[code]]\n```"),
    ).toEqual(["Idea"]);
    expect(wikiMarkdown("[[Idea|read]]")).toBe("[read](#/wiki/Idea)");
  });
  it("filters property values and sorts titles without mutating notes", () => {
    const notes = [
      {
        id: "1",
        title: "Zulu",
        kind: "note" as const,
        content: "",
        properties: { tag: "work" },
      },
      {
        id: "2",
        title: "Alpha",
        kind: "note" as const,
        content: "",
        properties: { tag: "home" },
      },
    ];
    expect(filterNotes(notes, "work", "title").map((note) => note.id)).toEqual([
      "1",
    ]);
    expect(filterNotes(notes, "", "title").map((note) => note.id)).toEqual([
      "2",
      "1",
    ]);
    expect(notes[0]?.id).toBe("1");
  });
  it("moves whole markdown blocks without losing content", () => {
    expect(moveBlock(["# Heading", "paragraph", "- item"], 1, -1)).toEqual([
      "paragraph",
      "# Heading",
      "- item",
    ]);
  });
});
