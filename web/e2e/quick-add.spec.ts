import { test, expect } from "@playwright/test";
import type { TaskInput } from "../src/types";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-15T10:00:00Z") });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/v1/auth/me": { id: "owner", username: "owner" },
      "/api/v1/settings": {
        timezone: "Europe/Madrid",
        language: "es",
        week_start: 1,
        hour_format: "24",
        date_format: "DD/MM/YYYY",
        theme: "light",
        accent_color: "#2563eb",
        default_sort: "manual",
        browser_notifications: false,
      },
      "/api/v1/projects": [
        {
          id: "home",
          name: "Casa",
          archived: false,
          favorite: false,
          parent_project_id: null,
          color: "#123456",
          position: 1,
        },
      ],
      "/api/v1/sections": [
        { id: "week", project_id: "home", name: "Esta semana", position: 1 },
      ],
      "/api/v1/labels": [
        { id: "shopping", name: "compras", color: "#123456", favorite: false },
      ],
    };
    await route.fulfill({ json: data[path] ?? [] });
  });
  await page.goto("/");
  await page.getByRole("heading", { name: "Hoy", exact: true }).waitFor();
  await page.keyboard.press("q");
});

test("single title recognizes dates and supports keyboard suggestions before saving", async ({
  page,
}) => {
  const title = page.getByRole("combobox", { name: "Título", exact: true });
  await expect(title).toBeFocused();
  await title.fill("Comprar leche mañana a las 18:30 #Ca");
  await expect(
    page.getByRole("option", { name: "#Casa", exact: true }),
  ).toBeVisible();
  await title.press("Enter");
  await title.pressSequentially("/Esta");
  await title.press("Tab");
  await title.pressSequentially("@com");
  await title.press("Enter");
  await title.pressSequentially("p1");
  await expect(page.getByLabel("Datos detectados")).toContainText(
    "16/09/2026 · 18:30",
  );
  const request = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/tasks"),
  );
  await title.press("Enter");
  const body: TaskInput = (await request).postDataJSON();
  expect(body).toMatchObject({
    title: "Comprar leche",
    project_id: "home",
    section_id: "week",
    label_ids: ["shopping"],
    priority: 1,
    due_date: "2026-09-16",
    due_time: "18:30",
  });
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("recognition is reversible and manual choices override detected values", async ({
  page,
}) => {
  const title = page.getByRole("combobox", { name: "Título", exact: true });
  await title.fill("Leer mañana");
  await page.getByTitle("Conservar «mañana» como texto").click();
  await expect(page.getByLabel("Resumen de tarea")).toContainText("Sin fecha");
  await title.fill("Leer viernes p1");
  await page
    .getByText("Más opciones · fecha, prioridad, descripción y etiquetas", {
      exact: true,
    })
    .click();
  await page.getByLabel("Prioridad", { exact: true }).selectOption("3");
  await page.getByLabel("Fecha", { exact: true }).fill("2026-12-25");
  const request = page.waitForRequest((request) => request.method() === "POST");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({
    title: "Leer",
    due_date: "2026-12-25",
    priority: 3,
  });
});

test("Escape closes suggestions first and metadata alone cannot create an empty task", async ({
  page,
}) => {
  const title = page.getByRole("combobox", { name: "Título", exact: true });
  await title.fill("Comprar #");
  await title.press("ArrowDown");
  await title.press("Escape");
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await title.fill("mañana p1");
  await title.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Escribe un título");
});

test("compact composer fits a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("combobox", { name: "Título", exact: true })
    .fill("Comprar leche mañana @compras p1");
  await expect(
    page.getByRole("button", { name: "Guardar", exact: true }),
  ).toBeInViewport();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/mytools-quickadd-mobile.png" });
});

test("creates an unknown label only after selecting the create option", async ({
  page,
}) => {
  await page.route("**/api/v1/labels", async (route) => {
    await route.fulfill({
      json:
        route.request().method() === "POST"
          ? {
              id: "new-label",
              name: "recados",
              color: "#123456",
              favorite: false,
            }
          : [],
    });
  });
  const title = page.getByRole("combobox", { name: "Título", exact: true });
  await title.fill("Comprar @recados");
  await page.getByRole("option", { name: "Crear etiqueta @recados" }).click();
  await expect(page.getByLabel("Datos detectados")).toContainText("@recados");
  const request = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/tasks"),
  );
  await title.press("Enter");
  expect((await request).postDataJSON()).toMatchObject({
    title: "Comprar",
    label_ids: ["new-label"],
  });
});

test("a failed save preserves the draft for retry", async ({ page }) => {
  await page.route("**/api/v1/tasks", async (route) => {
    await route.fulfill({ status: 500, json: { error: "No se pudo guardar" } });
  });
  const title = page.getByRole("combobox", { name: "Título", exact: true });
  await title.fill("Comprar mañana p1");
  await title.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("No se pudo guardar");
  await expect(title).toHaveValue("Comprar mañana p1");
  await expect(
    page.getByRole("button", { name: "Guardar", exact: true }),
  ).toBeEnabled();
});
