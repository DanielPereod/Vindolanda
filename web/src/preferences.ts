/**
 * Preferencia local de la vista de calendario. El resto de ajustes viven en
 * `/settings` para sincronizarse entre dispositivos.
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

/** Subconjunto de `Storage` suficiente para leer y guardar preferencias. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CALENDAR_KEY = "calendar-mode";

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
