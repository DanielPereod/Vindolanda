import { test, expect } from "@playwright/test";

test("daily workflow persists projects, sections, labels and task changes", async ({
  page,
}) => {
  const projectName = `Casa de prueba ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Usuario").fill("owner");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hoy", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("link", { name: projectName }).click();
  await page.getByRole("button", { name: "Nueva sección" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Esta semana");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page
    .getByRole("button", { name: "Añadir tarea", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Comprar leche de prueba");
  await page
    .getByText("Más opciones · fecha, prioridad, descripción y etiquetas", {
      exact: true,
    })
    .click();
  await page.getByLabel("Prioridad").selectOption("1");
  await page
    .getByLabel("Sección", { exact: true })
    .selectOption({ label: "Esta semana" });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByText("Comprar leche de prueba", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Completar Comprar leche de prueba",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Completadas", exact: true }).click();
  await expect(
    page.getByText("Comprar leche de prueba", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Restaurar Comprar leche de prueba",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: projectName }).click();
  await page.getByText("Comprar leche de prueba", { exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill("Comprar leche y pan");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByText("Comprar leche y pan", { exact: true }),
  ).toBeVisible();
});
