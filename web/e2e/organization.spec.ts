import type { Page, Locator } from "@playwright/test";
import { test, expect } from "@playwright/test";

// Each run uses distinct names and only creates disposable acceptance-test data.
test("labels, subtasks, search, moving and deletion work together", async ({
  page,
}) => {
  const suffix = Date.now();
  const title = `Organizar viaje ${suffix}`;
  const child = `Reservar hotel ${suffix}`;
  const labelName = `viaje-${suffix}`;
  await page.goto("/");
  await page.getByLabel("Usuario").fill("owner");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("link", { name: "Etiquetas", exact: true }).click();
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill(labelName);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page
    .getByRole("link", { name: "Bandeja de entrada", exact: true })
    .click();
  await page.keyboard.press("q");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page
    .getByText("Más opciones · fecha, prioridad, descripción y etiquetas", {
      exact: true,
    })
    .click();
  await page.getByLabel("Fecha", { exact: true }).fill("2026-09-15");
  await page.getByLabel("Hora", { exact: true }).fill("18:30");
  await page.getByRole("checkbox", { name: labelName }).check();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page
    .getByRole("button", { name: `Acciones de ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Subtarea", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill(child);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page
    .getByRole("button", { name: `Completar ${child}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Completar ${title}`, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByLabel("Buscar tareas", { exact: true }).fill(labelName);
  await page
    .getByRole("button", { name: "Ver resultados", exact: true })
    .click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByText(title, { exact: true }).click();
  await page.getByLabel("Proyecto", { exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page
    .getByRole("button", { name: `Acciones de ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page
    .getByRole("button", { name: "Eliminar definitivamente", exact: true })
    .click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});

test("mobile navigation and task editor fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Usuario").fill("owner");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Abrir navegación", exact: true })
    .click();
  await page.getByRole("link", { name: "Próximo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Próximo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Añadir tarea", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Añadir tarea", exact: true }),
  ).toBeVisible();
  const size = await page.locator("dialog").boundingBox();
  expect(size?.width).toBeLessThan(390);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("drag-and-drop persists task order and moves between sections", async ({
  page,
}) => {
  const suffix = Date.now();
  await page.goto("/");
  await page.getByLabel("Usuario").fill("owner");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hoy", exact: true }),
  ).toBeVisible();
  const headers = { Origin: "http://localhost:5173" };
  const projectResponse = await page.request.post("/api/v1/projects", {
    headers,
    data: { name: `Drag ${suffix}` },
  });
  expect(projectResponse.status()).toBe(201);
  const project = (await projectResponse.json()) as { id: string };
  const sectionResponse = await page.request.post("/api/v1/sections", {
    headers,
    data: { name: "Destination", project_id: project.id },
  });
  const section = (await sectionResponse.json()) as { id: string };
  for (const title of ["First drag task", "Second drag task"]) {
    expect(
      (
        await page.request.post("/api/v1/tasks", {
          headers,
          data: { title, project_id: project.id },
        })
      ).status(),
    ).toBe(201);
  }
  await page.goto(`/project/${project.id}`);
  await drag(
    page,
    page.getByRole("button", {
      name: "Arrastrar Second drag task",
      exact: true,
    }),
    page.getByRole("button", {
      name: "Arrastrar First drag task",
      exact: true,
    }),
  );
  await expect(page.locator(".task-title").first()).toHaveText(
    "Second drag task",
  );
  await page.reload();
  await expect(page.locator(".task-title").first()).toHaveText(
    "Second drag task",
  );
  await drag(
    page,
    page.getByRole("button", {
      name: "Arrastrar First drag task",
      exact: true,
    }),
    page.getByText("Arrastra tareas aquí para organizarlas.", { exact: true }),
  );
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `/api/v1/tasks?project_id=${project.id}`,
      );
      const tasks = (await response.json()) as Array<{
        title: string;
        section_id: string | null;
      }>;
      return tasks.find((task) => task.title === "First drag task")?.section_id;
    })
    .toBe(section.id);
});

async function drag(page: Page, source: Locator, target: Locator) {
  await source.hover();
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  if (!sourceBounds || !targetBounds)
    throw new Error("Drag elements must be visible");
  const sourceX = sourceBounds.x + sourceBounds.width / 2;
  const sourceY = sourceBounds.y + sourceBounds.height / 2;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 10, sourceY, { steps: 3 });
  await page.mouse.move(
    targetBounds.x + targetBounds.width / 2,
    targetBounds.y + targetBounds.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}
