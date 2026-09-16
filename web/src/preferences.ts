/**
 * Preferencias locales por módulo. No se sincronizan con el servidor: cada
 * navegador conserva sus propios valores y el resto vive en `/settings`.
 */

/** Vistas soportadas por el calendario de tareas. */
export type CalendarMode =
  | "day"
  | "week"
  | "month"
  | "year"
  | "agenda"
  | "multiday"
  | "multiweek";

export const CALENDAR_MODES: { value: CalendarMode; label: string }[] = [
  { value: "month", label: "Mes" },
  { value: "week", label: "Semana" },
  { value: "day", label: "Día" },
  { value: "agenda", label: "Agenda" },
  { value: "year", label: "Año" },
  { value: "multiday", label: "Varios días" },
  { value: "multiweek", label: "Varias semanas" },
];

export interface NotesPreferences {
  confirmDiscard: boolean;
}

export interface NutritionPreferences {
  defaultBaseUnit: "g" | "ml" | "unit";
}

export const DEFAULT_NOTES_PREFERENCES: NotesPreferences = {
  confirmDiscard: true,
};

export const DEFAULT_NUTRITION_PREFERENCES: NutritionPreferences = {
  defaultBaseUnit: "g",
};

/** Subconjunto de `Storage` suficiente para leer y guardar preferencias. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CALENDAR_KEY = "calendar-mode";
const NOTES_KEY = "notes-preferences";
const NUTRITION_KEY = "nutrition-preferences";

function resolveStorage(
  storage: PreferenceStorage | null | undefined,
): PreferenceStorage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readObject(
  storage: PreferenceStorage | null,
  key: string,
): Record<string, unknown> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function writeObject(
  storage: PreferenceStorage | null,
  key: string,
  value: unknown,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible: la preferencia sigue en memoria */
  }
}

export function isCalendarMode(value: unknown): value is CalendarMode {
  return CALENDAR_MODES.some((mode) => mode.value === value);
}

export function loadCalendarMode(
  storage?: PreferenceStorage | null,
): CalendarMode {
  const resolved = resolveStorage(storage);
  if (!resolved) return "month";
  try {
    const saved = resolved.getItem(CALENDAR_KEY);
    if (saved === "3day") return "multiday";
    return isCalendarMode(saved) ? saved : "month";
  } catch {
    return "month";
  }
}

export function saveCalendarMode(
  mode: CalendarMode,
  storage?: PreferenceStorage | null,
): void {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  try {
    resolved.setItem(CALENDAR_KEY, mode);
  } catch {
    /* sin persistencia: la vista sigue funcionando en memoria */
  }
}

export function loadNotesPreferences(
  storage?: PreferenceStorage | null,
): NotesPreferences {
  const value = readObject(resolveStorage(storage), NOTES_KEY);
  return {
    confirmDiscard:
      typeof value.confirmDiscard === "boolean"
        ? value.confirmDiscard
        : DEFAULT_NOTES_PREFERENCES.confirmDiscard,
  };
}

export function saveNotesPreferences(
  preferences: NotesPreferences,
  storage?: PreferenceStorage | null,
): void {
  writeObject(resolveStorage(storage), NOTES_KEY, preferences);
}

export function loadNutritionPreferences(
  storage?: PreferenceStorage | null,
): NutritionPreferences {
  const value = readObject(resolveStorage(storage), NUTRITION_KEY);
  const unit = value.defaultBaseUnit;
  return {
    defaultBaseUnit:
      unit === "g" || unit === "ml" || unit === "unit"
        ? unit
        : DEFAULT_NUTRITION_PREFERENCES.defaultBaseUnit,
  };
}

export function saveNutritionPreferences(
  preferences: NutritionPreferences,
  storage?: PreferenceStorage | null,
): void {
  writeObject(resolveStorage(storage), NUTRITION_KEY, preferences);
}
