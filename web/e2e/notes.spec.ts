import { test, expect, type Locator, type Page } from "@playwright/test";
import type { Note, NoteInput, NoteFolder, NoteLink } from "../src/notes";
import type { TaskInput } from "../src/types";

test.beforeEach(async ({ page }) => {
  const notes: Note[] = [];
  const folders: NoteFolder[] = [];
  const links = new Map<string, NoteLink[]>();
  function indexNote(note: Note) {
    const previous = links.get(note.id) ?? [];
    links.set(
      note.id,
      [...note.content.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map(
        (match) => {
          const title = match[1] ?? "";
          const target = notes.find((candidate) => candidate.title === title);
          return {
            id: crypto.randomUUID(),
            source_note_id: note.id,
            target_note_id:
              previous.find((link) => link.target_title === title)
                ?.target_note_id ??
              target?.id ??
              null,
            target_title: title,
            current_title: title,
            source_title: note.title,
            target_heading: "",
            target_block: "",
            display_text: "",
            position: match.index,
            context: note.content,
            target_deleted: false,
          };
        },
      ),
    );
  }
  const tasks: (TaskInput & { id: string; status: string })[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    if (
      method === "DELETE" &&
      (path === "/notes/trash" || path.endsWith("/permanent"))
    ) {
      const identifier = path.split("/")[2];
      const retained = notes.filter(
        (note) =>
          !note.deleted_at ||
          (identifier !== "trash" && note.id !== identifier),
      );
      notes.splice(0, notes.length, ...retained);
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === "/notes/search") {
      const query =
        new URL(route.request().url()).searchParams
          .get("q")
          ?.toLocaleLowerCase() ?? "";
      await route.fulfill({
        json: notes.filter(
          (note) =>
            !note.deleted_at &&
            `${note.title} ${note.content}`.toLocaleLowerCase().includes(query),
        ),
      });
      return;
    }
    if (path === "/notes" && method === "POST") {
      const input = route.request().postDataJSON() as NoteInput;
      const note = {
        ...input,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      notes.push(note);
      indexNote(note);
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
      indexNote(updated);
      await route.fulfill({ json: updated });
      return;
    }
    if (path === "/note-folders" && method === "POST") {
      const input = route.request().postDataJSON() as Pick<
        NoteFolder,
        "name" | "parent_id"
      >;
      const folder = { ...input, id: crypto.randomUUID() };
      folders.push(folder);
      await route.fulfill({ status: 201, json: folder });
      return;
    }
    if (path.startsWith("/note-folders/") && method === "PUT") {
      const index = folders.findIndex(
        (folder) => folder.id === path.split("/")[2],
      );
      const current = folders[index];
      if (!current) throw new Error("Unknown folder");
      const updated = {
        ...current,
        ...(route.request().postDataJSON() as Pick<
          NoteFolder,
          "name" | "parent_id"
        >),
      };
      folders[index] = updated;
      await route.fulfill({ json: updated });
      return;
    }
    if (
      path.startsWith("/notes/") &&
      (path.endsWith("/links") || path.endsWith("/backlinks"))
    ) {
      const identifier = path.split("/")[2];
      const result = [...links.values()]
        .flat()
        .filter((link) =>
          path.endsWith("/backlinks")
            ? link.target_note_id === identifier
            : link.source_note_id === identifier,
        )
        .map((link) => {
          const target = notes.find(
            (candidate) => candidate.id === link.target_note_id,
          );
          return {
            ...link,
            current_title: target?.title ?? link.target_title,
            target_deleted: Boolean(target?.deleted_at),
          };
        });
      await route.fulfill({ json: result });
      return;
    }
    if (
      path.startsWith("/notes/") &&
      (method === "DELETE" || path.endsWith("/restore"))
    ) {
      const note = notes.find(
        (candidate) => candidate.id === path.split("/")[2],
      );
      if (!note) throw new Error("Missing fixture note");
      note.deleted_at = method === "DELETE" ? new Date().toISOString() : null;
      await route.fulfill({ status: 204 });
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
      "/notes": notes.filter(
        (note) =>
          Boolean(note.deleted_at) ===
          (new URL(route.request().url()).searchParams.get("deleted") ===
            "true"),
      ),
      "/note-folders": folders,
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

test("permanent deletion requires confirmation and removes a trash entry", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Disposable");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page.getByRole("button", { name: "Más opciones" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Eliminar archivo" }).click();
  await expect(
    page.getByRole("heading", { name: "Papelera", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Eliminar definitivamente Disposable" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar" })
    .click();
  await expect(
    page.getByRole("button", { name: "Restaurar Disposable" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Eliminar definitivamente Disposable" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Eliminar definitivamente", exact: true })
    .click();
  await expect(page.getByText("La papelera está vacía.")).toBeVisible();
});

test("keyboard switcher, command registry and server search navigate notes", async ({
  page,
}) => {
  await page.goto("/notes");
  await expect(
    page.getByRole("button", { name: "Carpeta", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+p");
  await page.getByRole("combobox", { name: "Paleta de comandos" }).fill("crnt");
  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Knowledge book");
  await page
    .getByRole("textbox", { name: "Contenido Markdown" })
    .fill("The quantum orchard");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  const targetURL = page.url();
  await page.keyboard.press("Control+o");
  await page.getByRole("combobox", { name: "Abrir nota" }).fill("knbk");
  await expect(
    page.getByRole("option", { name: /Knowledge book/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(targetURL);
  await page.keyboard.press("Control+Shift+f");
  await page.getByRole("combobox", { name: "Búsqueda global" }).fill("quantum");
  await expect(
    page.getByRole("option", { name: /Knowledge book/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(targetURL);
});

test("folders, trash and restoration preserve notes and their identity", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/notes");
  await page.getByRole("button", { name: "Carpeta", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre de la carpeta", exact: true })
    .fill("Research");
  await page
    .getByRole("button", { name: "Crear carpeta", exact: true })
    .click();
  await expect(
    page.locator(".folder-heading", { hasText: "Research" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Organized idea");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  // Organización orgánica: mover desde el explorador con clic derecho (menú contextual).
  await page
    .locator(".explorer-note-row", { hasText: "Organized idea" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mover a" }).click();
  await page
    .locator(".explorer-context-submenu")
    .getByRole("menuitem", { name: "Research", exact: true })
    .click();
  await expect(page.locator(".note-folder-badge")).toHaveText("Research");
  const originalURL = page.url();
  await expect(
    page
      .locator(".folder-children")
      .getByRole("button", { name: "Organized idea" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Eliminar archivo" }).click();
  await expect(
    page.getByRole("heading", { name: "Papelera", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".notes-sidebar")
      .getByRole("button", { name: "Organized idea" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Restaurar Organized idea", exact: true })
    .click();
  await expect(page).toHaveURL(originalURL);
  await expect(page.locator(".note-folder-badge")).toHaveText("Research");
  await expect(
    page
      .locator(".folder-children")
      .getByRole("button", { name: "Organized idea" }),
  ).toBeVisible();
});

test("folders drag into other folders and back to the root", async ({
  page,
}) => {
  await page.goto("/notes");
  for (const name of ["Research", "Archive"]) {
    await page.getByRole("button", { name: "Carpeta", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Nombre de la carpeta", exact: true })
      .fill(name);
    await page
      .getByRole("button", { name: "Crear carpeta", exact: true })
      .click();
    await expect(
      page.locator(".folder-heading", { hasText: name }).first(),
    ).toBeVisible();
  }
  // Una nota situada en la raíz también sirve para devolver la carpeta a la raíz.
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page.getByRole("textbox", { name: "Título de nota" }).fill("Root note");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await drag(
    page,
    page.locator(".folder-heading", { hasText: "Archive" }).first(),
    page.locator(".folder-heading", { hasText: "Research" }).first(),
  );
  const nested = page
    .locator(".folder-branch", { hasText: "Research" })
    .locator(".folder-children .folder-heading", { hasText: "Archive" });
  await expect(nested).toBeVisible();
  await drag(
    page,
    page.locator(".folder-heading", { hasText: "Archive" }).first(),
    page.locator(".explorer-note-row", { hasText: "Root note" }).first(),
  );
  await expect(nested).toHaveCount(0);
});

async function drag(page: Page, source: Locator, target: Locator) {
  await source.hover();
  const sourceBounds = await source.boundingBox();
  if (!sourceBounds) throw new Error("Drag source must be visible");
  const sourceX = sourceBounds.x + sourceBounds.width / 2;
  const sourceY = sourceBounds.y + sourceBounds.height / 2;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 12, sourceY + 4, { steps: 4 });
  const targetBounds = await target.boundingBox();
  if (!targetBounds) throw new Error("Drag target must be visible");
  await page.mouse.move(
    targetBounds.x + targetBounds.width / 2,
    targetBounds.y + targetBounds.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}

test("renamed links display the new title and navigate by original identity", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page.getByRole("textbox", { name: "Título de nota" }).fill("Original");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  const targetURL = page.url();
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page.getByRole("textbox", { name: "Título de nota" }).fill("Source");
  await page
    .getByRole("textbox", { name: "Contenido Markdown" })
    .fill("[[Original]]");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page
    .locator(".notes-sidebar")
    .getByRole("button", { name: "Original", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Título de nota" }),
  ).toHaveValue("Original");
  await page.getByRole("textbox", { name: "Título de nota" }).fill("Renamed");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await expect(
    page
      .locator(".notes-sidebar")
      .getByRole("button", { name: "Renamed", exact: true }),
  ).toBeVisible();
  await page
    .locator(".notes-sidebar")
    .getByRole("button", { name: "Source", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Título de nota" }),
  ).toHaveValue("Source");
  await page.getByRole("button", { name: "Cambiar modo de vista" }).click();
  await page
    .getByRole("menuitemradio", { name: "Modo lectura", exact: true })
    .click();
  await expect(
    page
      .locator(".markdown")
      .getByRole("button", { name: "Renamed", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/mytools-knowledge-workspace.png",
    fullPage: true,
  });
  await page
    .locator(".markdown")
    .getByRole("button", { name: "Renamed", exact: true })
    .click();
  await expect(page).toHaveURL(targetURL);
});

test("continuous editing autosaves without replacing newer input", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Contenido Markdown" });
  await editor.fill("# First\n\nA continuous document");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await expect(page.getByRole("button", { name: /bloque/i })).toHaveCount(0);
  await page.reload();
  await expect(editor).toHaveValue("# First\n\nA continuous document");
  await page.route("**/api/v1/notes/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fallback();
  });
  await editor.fill("First write");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardando…",
  );
  await editor.fill("Newer draft while saving");
  await expect(editor).toHaveValue("Newer draft while saving");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page.reload();
  await expect(editor).toHaveValue("Newer draft while saving");
});

test("notes persist, navigate wiki links, organize a base and connect canvas cards", async ({
  page,
}) => {
  await page.goto("/today");
  await page.getByRole("button", { name: "Cambiar de aplicación" }).click();
  await page.getByRole("menuitem", { name: /Notas/ }).click();
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Primera idea");
  await page
    .getByRole("textbox", { name: "Contenido Markdown", exact: true })
    .fill("## Mi idea");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Segunda idea");
  await page
    .getByRole("textbox", { name: "Contenido Markdown" })
    .fill("Conecta [[Primera idea|la primera]]");
  await page.getByRole("button", { name: "Añadir propiedad" }).click();
  await page.getByRole("combobox", { name: "Añadir propiedad" }).fill("Estado");
  await page.getByRole("option", { name: "Crear «Estado»" }).click();
  await page.getByRole("textbox", { name: /Estado/ }).fill("Activa");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page.getByRole("button", { name: "Cambiar modo de vista" }).click();
  await page
    .getByRole("menuitemradio", { name: "Modo lectura", exact: true })
    .click();
  await page.getByRole("button", { name: "la primera", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Título de nota" }),
  ).toHaveValue("Primera idea");
  await expect(
    page.getByRole("button", { name: "Segunda idea", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Cambiar modo de vista" }).click();
  await page
    .getByRole("menuitemradio", { name: "Modo lectura", exact: true })
    .click();
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
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await expect(
    page
      .locator(".notes-sidebar")
      .getByRole("button", { name: "Ideas activas", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  // Pantalla completa: la barra inferior crea tarjetas que solo viven en el lienzo.
  await page.getByRole("button", { name: "Tarjeta", exact: true }).click();
  // El primer clic selecciona la tarjeta; el segundo habilita la edición.
  const canvasCard = page.locator(".canvas-node--text");
  await canvasCard.click();
  await page
    .getByRole("textbox", { name: "Contenido de la tarjeta 1" })
    .pressSequentially("Idea suelta del lienzo");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  // La rueda hace zoom sobre el punto del cursor.
  await expect(page.locator(".canvas-zoom-value")).toHaveText("100%");
  await page.mouse.move(500, 420);
  await page.mouse.wheel(0, -240);
  await expect(page.locator(".canvas-zoom-value")).not.toHaveText("100%");
  await page.getByRole("button", { name: "Restablecer zoom" }).click();
  await expect(page.locator(".canvas-zoom-value")).toHaveText("100%");
  // El botón central del ratón desplaza el lienzo.
  const worldBefore = await page
    .locator(".canvas-world")
    .evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.move(500, 420);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(620, 500);
  await page.mouse.up({ button: "middle" });
  const worldAfter = await page
    .locator(".canvas-world")
    .evaluate((element) => getComputedStyle(element).transform);
  expect(worldAfter).not.toBe(worldBefore);
  // El modal busca entre las notas existentes y reutiliza la elegida.
  await page
    .locator(".canvas-toolbar")
    .getByRole("button", { name: "Nota", exact: true })
    .click();
  const notePicker = page.getByRole("dialog");
  await notePicker
    .getByRole("combobox", { name: "Buscar o crear nota" })
    .fill("Segunda");
  await notePicker.getByRole("option", { name: /^Segunda idea/ }).click();
  await expect(
    page.locator(".canvas-node--note", { hasText: "Segunda idea" }),
  ).toBeVisible();
  // Cuando el título no existe, el modal permite crear la nota.
  await page
    .locator(".canvas-toolbar")
    .getByRole("button", { name: "Nota", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Buscar o crear nota" })
    .fill("Nota del lienzo");
  await page.getByRole("button", { name: "Crear «Nota del lienzo»" }).click();
  await expect(
    page.locator(".canvas-node--note", { hasText: "Nota del lienzo" }),
  ).toBeVisible();
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Contenido de la tarjeta 1" }),
  ).toContainText("Idea suelta del lienzo");
  await expect(
    page.locator(".canvas-node--note", { hasText: "Nota del lienzo" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/mytools-notes-canvas.png",
    fullPage: true,
  });
});

test("live preview renders Markdown inline and follows wikilinks", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Live source");
  await page
    .getByRole("textbox", { name: "Contenido Markdown" })
    .fill("# Encabezado\n\nTexto con **negrita** y [[Live target]].");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Live target");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page
    .locator(".notes-sidebar")
    .getByRole("button", { name: "Live source", exact: true })
    .click();
  await page.getByRole("button", { name: "Cambiar modo de vista" }).click();
  await page
    .getByRole("menuitemradio", { name: "Vista previa en vivo" })
    .click();
  const preview = page.locator(".live-preview");
  await expect(
    preview.locator(".cm-lp-wiki", { hasText: "Live target" }),
  ).toBeVisible();
  await expect(preview).toContainText("Encabezado");
  await expect(preview).toContainText("negrita");
  await expect(preview).not.toContainText("**negrita**");
  await expect(preview).not.toContainText("[[Live target]]");
  await preview.getByText("Live target", { exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Título de nota" }),
  ).toHaveValue("Live target");
});

test("task editor saves note associations and notes show the backlink", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("Referencia");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  await page.getByRole("button", { name: "Cambiar de aplicación" }).click();
  await page.getByRole("menuitem", { name: /Tareas/ }).click();
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
  await page.getByRole("button", { name: "Cambiar de aplicación" }).click();
  await page.getByRole("menuitem", { name: /Notas/ }).click();
  await page
    .locator(".notes-sidebar")
    .getByRole("button", { name: "Referencia", exact: true })
    .click();
  await page.getByRole("link", { name: /Preparar propuesta/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Referencia/ }),
  ).toBeChecked();
});

test("mobile navigation and failed saves keep edits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/notes");
  await page.getByRole("button", { name: "Mostrar navegación" }).click();
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page.getByRole("textbox", { name: "Título de nota" }).fill("No perder");
  await page.route("**/api/v1/notes/*", (route) =>
    route.fulfill({ status: 500, json: { error: "Save failed" } }),
  );
  await page
    .getByRole("textbox", { name: "Título de nota" })
    .fill("No perder editado");
  await expect(page.getByRole("alert")).toContainText("Save failed");
  await expect(
    page.getByRole("textbox", { name: "Título de nota" }),
  ).toHaveValue("No perder editado");
  await expect(
    page.getByRole("button", { name: "Cambiar de aplicación" }),
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

test("canvas note cards always render the Markdown live view", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/notes");
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await page
    .locator(".canvas-toolbar")
    .getByRole("button", { name: "Nota", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Buscar o crear nota" })
    .fill("Nota del lienzo");
  await page.getByRole("button", { name: "Crear «Nota del lienzo»" }).click();
  const card = page.locator(".canvas-node--note");
  await expect(card).toBeVisible();
  const editor = card.getByRole("textbox", { name: /Contenido de / });
  await editor.fill("# Encabezado del lienzo\n\nTexto con **negrita**.");
  const rendered = card.locator(".cm-content");
  await expect(rendered).toContainText("Encabezado del lienzo");
  await expect(rendered).toContainText("negrita");
  await expect(rendered).not.toContainText("# Encabezado");
  await expect(page.locator('.notes-toolbar [role="status"]')).toHaveText(
    "Guardado",
  );
  // La tarjeta seleccionada muestra la barra flotante con sus acciones.
  const toolbar = card.getByRole("toolbar", {
    name: "Acciones de la tarjeta 1",
  });
  await expect(toolbar).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Eliminar tarjeta 1" }),
  ).toBeVisible();
  await toolbar
    .getByRole("button", { name: "Cambiar color de la tarjeta 1" })
    .click();
  await toolbar.getByRole("menuitemradio", { name: "Verde" }).click();
  await expect(card).toHaveCSS("border-color", "rgb(34, 197, 94)");
});
