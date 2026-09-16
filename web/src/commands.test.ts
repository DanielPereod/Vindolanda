import { describe, expect, it, vi } from "vitest";
import { CommandRegistry, fuzzyScore } from "./commands";

describe("workspace commands", () => {
  it("registers commands with reversible ownership and rejects duplicate IDs", () => {
    const registry = new CommandRegistry();
    const execute = vi.fn();
    const unregister = registry.register({
      id: "notes.create",
      title: "Crear nota",
      execute,
    });
    expect(() =>
      registry.register({ id: "notes.create", title: "Duplicate", execute }),
    ).toThrow();
    registry.run("notes.create");
    expect(execute).toHaveBeenCalledOnce();
    unregister();
    expect(registry.search("")).toEqual([]);
  });
  it("matches fuzzy subsequences and ranks exact text first", () => {
    expect(fuzzyScore("Abrir búsqueda", "abbs")).toBeGreaterThan(0);
    expect(fuzzyScore("Crear nota", "nota")).toBeGreaterThan(
      fuzzyScore("Nueva organización de tareas activas", "nota"),
    );
    expect(fuzzyScore("Crear nota", "xyz")).toBe(0);
  });
});
