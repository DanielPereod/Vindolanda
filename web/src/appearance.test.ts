import { describe, expect, it } from "vitest";
import { ACCENT_OPTIONS, resolveAccentColor } from "./appearance";

describe("appearance", () => {
  it("exposes a restrained set of selectable accent colors", () => {
    expect(ACCENT_OPTIONS).toEqual([
      { name: "Azul", value: "#2563eb" },
      { name: "Violeta", value: "#7c3aed" },
      { name: "Verde", value: "#15803d" },
      { name: "Naranja", value: "#c2410c" },
      { name: "Rosa", value: "#be123c" },
    ]);
  });

  it("falls back to blue for an unknown persisted value", () => {
    expect(resolveAccentColor("#ffff00")).toBe("#2563eb");
  });
});
