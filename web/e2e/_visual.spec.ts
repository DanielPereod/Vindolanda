import { test } from "@playwright/test";
import type { Note, NoteFolder } from "../src/notes";

const now = new Date().toISOString();
function note(
  title: string,
  kind: Note["kind"],
  folder_id: string | null,
): Note {
  return {
    id: crypto.randomUUID(),
    title,
    kind,
    content: "",
    properties: {},
    nodes: [],
    edges: [],
    filter: "",
    sort: "title",
    folder_id,
    created_at: now,
    updated_at: now,
  };
}

test("explorer visual", async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 900 });
  const canvas = crypto.randomUUID();
  const bases = crypto.randomUUID();
  const facets = crypto.randomUUID();
  const folders: NoteFolder[] = [
    { id: canvas, name: "Canvas", parent_id: null },
    { id: bases, name: "Bases", parent_id: null },
    { id: facets, name: "Facets", parent_id: null },
    { id: crypto.randomUUID(), name: "Templates", parent_id: facets },
  ];
  const notes: Note[] = [
    note("Tamish", "canvas", canvas),
    note("Meal Prep Framework", "canvas", canvas),
    note("Vida", "canvas", canvas),
    note("Hybrid Bodybuilding", "canvas", canvas),
    note("Mental Health Map", "canvas", canvas),
    note("Jardinero", "note", facets),
    note("Software Engineer", "note", facets),
    note("Martech Engineer", "note", facets),
    note("Violinist", "note", facets),
    note("Painter", "note", facets),
    note("Notes Database", "base", bases),
    note("Recipe Database", "base", bases),
  ];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const resources: Record<string, unknown> = {
      "/auth/me": { id: "owner", username: "owner" },
      "/notes": notes,
      "/note-folders": folders,
      "/tasks": [],
      "/views/inbox": [],
      "/settings": {
        timezone: "Europe/Madrid",
        theme: "light",
        accent_color: "#2563eb",
        default_sort: "manual",
      },
    };
    await route.fulfill({ json: resources[path] ?? [] });
  });
  await page.goto("/notes");
  await page.locator(".note-explorer").waitFor();
  await page.locator(".notes-sidebar").screenshot({ path: "/tmp/explorer.png" });
});
