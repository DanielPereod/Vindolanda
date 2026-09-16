import { expect, test } from "vitest";
import { parseQuickAdd } from "./quickAdd";
import type { Label, Project, Section, TaskInput } from "./types";

test.each([
  ["Comprar leche lunes", "Comprar leche", "2026-09-21", null],
  ["Comprar pasado mañana a las 18:30", "Comprar", "2026-09-17", "18:30"],
  ["Comprar pasado mañana", "Comprar", "2026-09-17", null],
  ["Comprar 2026-10-12", "Comprar", "2026-10-12", null],
  ["Comprar 12 de octubre", "Comprar", "2026-10-12", null],
  ["Comprar a las 18:30", "Comprar", "2026-09-15", "18:30"],
  ["Comprar 31/02/2026", "Comprar 31/02/2026", null, null],
])("interprets %s safely", (text, title, due_date, due_time) => {
  expect(
    parseQuickAdd(
      text,
      current,
      projects,
      sections,
      labels,
      "Europe/Madrid",
      new Date("2026-09-15T10:00:00Z"),
    ).input,
  ).toMatchObject({ title, due_date, due_time });
});

test("supports a separate section marker and preserves selected labels", () => {
  const result = parseQuickAdd(
    "Comprar #Personal /Esta semana @compras @compras",
    { ...current, label_ids: ["existing"] },
    projects,
    sections,
    labels,
    "Europe/Madrid",
  );
  expect(result.input).toMatchObject({
    title: "Comprar",
    project_id: "p",
    section_id: "s",
    label_ids: ["existing", "l"],
  });
});

test("does not detach a subtask when its location is unchanged", () => {
  expect(
    parseQuickAdd(
      "Comprar #Personal",
      { ...current, project_id: "p", parent_task_id: "parent" },
      projects,
      sections,
      labels,
      "Europe/Madrid",
    ).input.parent_task_id,
  ).toBe("parent");
});

test("dates use the account day across midnight", () => {
  expect(
    parseQuickAdd(
      "Comprar mañana",
      current,
      [],
      [],
      [],
      "Europe/Madrid",
      new Date("2026-09-15T22:30:00Z"),
    ).input.due_date,
  ).toBe("2026-09-17");
});

test("ignored dates stay literal without partial recognition by another locale", () => {
  expect(
    parseQuickAdd(
      "Comprar mañana a las 18:30",
      current,
      [],
      [],
      [],
      "Europe/Madrid",
      new Date("2026-09-15T10:00:00Z"),
      ["mañana a las 18:30"],
    ).input,
  ).toMatchObject({
    title: "Comprar mañana a las 18:30",
    due_date: null,
    due_time: null,
  });
});

test.each([
  "Comprar cada lunes",
  "Comprar every Monday",
  'Leer "mañana"',
  "Leer https://example.com/2026-10-12",
  "Comprar @lunes",
])("keeps unsupported or literal scheduling intact: %s", (title) => {
  expect(
    parseQuickAdd(title, current, [], [], [], "Europe/Madrid").input,
  ).toMatchObject({ title, due_date: null, due_time: null });
});

test("recognizes labels containing spaces and keeps manual scheduling for a time-only input", () => {
  const result = parseQuickAdd(
    "Comprar @vida personal a las 6:30pm",
    { ...current, due_date: "2026-12-25" },
    [],
    [],
    [
      {
        ...labels[0],
        id: "multi",
        name: "vida personal",
        color: "#000000",
        favorite: false,
      },
    ],
    "Europe/Madrid",
  );
  expect(result.input).toMatchObject({
    title: "Comprar",
    label_ids: ["multi"],
    due_date: "2026-12-25",
    due_time: "18:30",
  });
});

const current: TaskInput = {
  title: "",
  description: "",
  project_id: null,
  section_id: null,
  parent_task_id: null,
  priority: 4,
  due_date: null,
  due_time: null,
  label_ids: [],
};
const projects: Project[] = [
  {
    id: "p",
    name: "Personal",
    description: "",
    color: "#000000",
    icon: "",
    parent_project_id: null,
    favorite: false,
    archived: false,
    default_view: "list",
    position: 1,
  },
];
const sections: Section[] = [
  { id: "s", project_id: "p", name: "Esta semana", position: 1 },
];
const labels: Label[] = [
  { id: "l", name: "compras", color: "#000000", favorite: false },
];

test("parses project, section, label, priority, Spanish date and time", () => {
  const result = parseQuickAdd(
    "Comprar leche mañana a las 18:30 #Personal/Esta semana @compras p1",
    current,
    projects,
    sections,
    labels,
    "Europe/Madrid",
    new Date("2026-09-15T10:00:00Z"),
  );
  expect(result.input).toMatchObject({
    title: "Comprar leche",
    project_id: "p",
    section_id: "s",
    priority: 1,
    due_date: "2026-09-16",
    due_time: "18:30",
    label_ids: ["l"],
  });
});

test("leaves unknown markers in the title", () => {
  const result = parseQuickAdd(
    "Llamar a @desconocido #Proyecto mañana",
    current,
    projects,
    sections,
    labels,
    "Europe/Madrid",
    new Date("2026-09-15T10:00:00Z"),
  );
  expect(result.input.title).toBe("Llamar a @desconocido #Proyecto");
});

test("parses English relative dates and 12-hour times", () => {
  const result = parseQuickAdd(
    "Review report next week at 6pm",
    current,
    [],
    [],
    [],
    "Europe/Madrid",
    new Date("2026-09-15T10:00:00Z"),
  );
  expect(result.input).toMatchObject({
    title: "Review report",
    due_date: "2026-09-22",
    due_time: "18:00",
  });
});
