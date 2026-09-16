import { test, expect } from "@playwright/test";
import type { Note, NoteInput } from "../src/notes";
import type { TaskInput } from "../src/types";

test.beforeEach(async ({ page }) => {
  const notes: Note[] = [];
  const tasks: (TaskInput & { id: string; status: string })[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    if (path === "/notes" && method === "POST") {
      const input = route.request().postDataJSON() as NoteInput;
      const note = {
        ...input,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      notes.push(note);
      await route.fulfill({ status: 201, json: note });
      return;
    }
    if (path.startsWith("/notes/") && method === "PUT") {
      const index = notes.findIndex((note) => note.id === path.split("/")[2]);
      const current = notes[index];
      if (!current) throw new Error("Unknown note");
      const updated = {
        ...current,
        ...(route.request().postDataJSON() as NoteInput),
      };
      notes[index] = updated;
      await route.fulfill({ json: updated });
      return;
    }
    if (path === "/tasks" && method === "POST") {
      const task = {
        ...(route.request().postDataJSON() as TaskInput),
        id: crypto.randomUUID(),
        status: "pending",
      };
      tasks.push(task);
      await route.fulfill({ status: 201, json: task });
      return;
    }
    const resources: Record<string, unknown> = {
      "/auth/me": { id: "owner", username: "owner" },
      "/notes": notes,
      "/tasks": tasks,
      "/views/inbox": tasks,
      "/settings": {
        timezone: "Europe/Madrid",
        theme: "light",
        accent_color: "#2563eb",
        default_sort: "manual",
      },
    };
    await route.fulfill({ json: resources[path] ?? [] });
  });
});

test("continuous editing autosaves without replacing newer input", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Contenido Markdown" });
  await editor.fill("# First\n\nA continuous document");
  await expect(page.getByRole("status")).toHaveText("Guardado");
  await expect(page.getByRole("button", { name: /bloque/i })).toHaveCount(0);
  await page.reload();
  await expect(editor).toHaveValue("# First\n\nA continuous document");
  await page.route("**/api/v1/notes/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fallback();
  });
  await editor.fill("First write");
  await expect(page.getByRole("status")).toHaveText("Guardando…");
  await editor.fill("Newer draft while saving");
  await expect(editor).toHaveValue("Newer draft while saving");
  await expect(page.getByRole("status")).toHaveText("Guardado");
  await page.reload();
  await expect(editor).toHaveValue("Newer draft while saving");
});

test("notes persist, navigate wiki links, organize a base and connect canvas cards", async ({
  page,
}) => {
  await page.goto("/today");
  await page
    .getByRole("navigation", { name: "Aplicaciones" })
    .getByRole("link", { name: "Notas" })
    .click();
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Primera idea");
  await page
    .getByRole("textbox", { name: "Contenido Markdown", exact: true })
    .fill("## Mi idea");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Guardado");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Segunda idea");
  await page
    .getByRole("textbox", { name: "Contenido Markdown" })
    .fill("Conecta [[Primera idea|la primera]]");
  await page.getByRole("textbox", { name: "Nueva propiedad" }).fill("Estado");
  await page.getByRole("button", { name: "+ Propiedad", exact: true }).click();
  await page.getByRole("textbox", { name: /Estado/ }).fill("Activa");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Guardado");
  await page.getByRole("button", { name: "Lectura" }).click();
  await page.getByRole("button", { name: "la primera", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Título de nota" }),
  ).toHaveValue("Primera idea");
  await expect(
    page.getByRole("button", { name: "Segunda idea", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Lectura", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mi idea", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Base", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Ideas activas");
  await page.getByRole("textbox", { name: "Filtrar base" }).fill("Activa");
  await expect(page.getByRole("table")).toContainText("Segunda idea");
  await expect(page.getByRole("table")).not.toContainText("Primera idea");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Guardado");
  await expect(
    page
      .locator(".notes-sidebar")
      .getByRole("link", { name: "Ideas activas", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Nota para canvas" })
    .selectOption({ label: "Primera idea" });
  await page.getByRole("button", { name: "+ Tarjeta", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Nota para canvas" })
    .selectOption({ label: "Segunda idea" });
  await page.getByRole("button", { name: "+ Tarjeta", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Origen", exact: true })
    .selectOption({ label: "1. Primera idea" });
  await page
    .getByRole("combobox", { name: "Destino", exact: true })
    .selectOption({ label: "2. Segunda idea" });
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  const card = page.getByRole("button", {
    name: "Mover tarjeta 2",
    exact: true,
  });
  await card.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Guardado");
  await page.reload();
  await expect(
    page.getByText("Primera idea → Segunda idea", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-card").nth(1)).toHaveCSS("left", "360px");
  await page.screenshot({
    path: "/tmp/mytools-notes-canvas.png",
    fullPage: true,
  });
});

test("task editor saves note associations and notes show the backlink", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Referencia");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Guardado");
  await page
    .getByRole("navigation", { name: "Aplicaciones" })
    .getByRole("link", { name: "Tareas" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hoy", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("q");
  await page
    .getByRole("combobox", { name: "Título", exact: true })
    .fill("Preparar propuesta");
  await page.getByRole("checkbox", { name: /Referencia/ }).check();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("navigation", { name: "Aplicaciones" })
    .getByRole("link", { name: "Notas" })
    .click();
  await page
    .locator(".notes-sidebar")
    .getByRole("link", { name: "Referencia", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Preparar propuesta", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Referencia/ }),
  ).toBeChecked();
});

test("mobile navigation and failed saves keep edits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/notes");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page.getByRole("textbox", { name: "Título de nota" }).fill("No perder");
  await page.route("**/api/v1/notes/*", (route) =>
    route.fulfill({ status: 500, json: { error: "Save failed" } }),
  );
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Save failed");
  await expect(
    page.getByRole("textbox", { name: "Título de nota" }),
  ).toHaveValue("No perder");
  await expect(
    page.getByRole("navigation", { name: "Aplicaciones" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/mytools-notes-mobile.png",
    fullPage: true,
  });
});
