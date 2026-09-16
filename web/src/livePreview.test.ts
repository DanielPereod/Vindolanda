import { describe, expect, it } from "vitest";
import { EditorSelection, Text } from "@codemirror/state";
import { activeLineNumbers, parseWikiLinks } from "./livePreview";

describe("live preview wikilinks", () => {
  it("splits aliases into a visible label and a navigation target", () => {
    const content = "See [[Idea|read]] and [[Other]].";
    const [aliased, plain] = parseWikiLinks(content);
    expect(aliased?.target).toBe("Idea");
    expect(aliased?.label).toBe("read");
    expect(aliased?.hidden).toEqual([
      { from: 4, to: 11 },
      { from: 15, to: 17 },
    ]);
    expect(content.slice(aliased?.labelFrom, aliased?.labelTo)).toBe("read");
    expect(plain?.target).toBe("Other");
    expect(plain?.label).toBe("Other");
    expect(content.slice(plain?.labelFrom, plain?.labelTo)).toBe("Other");
  });

  it("keeps heading fragments as part of the target and ignores single brackets", () => {
    const [fragment] = parseWikiLinks("[[Idea#Section|go]]");
    expect(fragment?.target).toBe("Idea#Section");
    expect(fragment?.label).toBe("go");
    expect(parseWikiLinks("[[unclosed")).toHaveLength(0);
  });

  it("applies an offset when scanning a fragment", () => {
    const [occurrence] = parseWikiLinks("[[Idea]]", 10);
    expect(occurrence?.from).toBe(10);
    expect(occurrence?.to).toBe(18);
  });
});

describe("live preview active lines", () => {
  const doc = Text.of(["# Title", "body", "more", "end"]);

  it("reveals the line that holds the cursor", () => {
    const selection = EditorSelection.single(doc.line(2).from + 1);
    expect([...activeLineNumbers(doc, selection)]).toEqual([2]);
  });

  it("reveals every line touched by a selection", () => {
    const selection = EditorSelection.single(doc.line(1).from, doc.line(3).to);
    expect(
      [...activeLineNumbers(doc, selection)].sort((a, b) => a - b),
    ).toEqual([1, 2, 3]);
  });
});
