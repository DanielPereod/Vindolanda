import { useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, errorMessage } from "./api";
import type { Settings } from "./types";
import { ACCENT_OPTIONS } from "./appearance";
import { Dropdown } from "./Dropdown";
import {
  CALENDAR_MODES,
  loadCalendarMode,
  loadNotesPreferences,
  loadNutritionPreferences,
  saveCalendarMode,
  saveNotesPreferences,
  saveNutritionPreferences,
} from "./preferences";
import type { CalendarMode, NutritionPreferences } from "./preferences";

/** Secciones del módulo global de configuración. */
export const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "tasks", label: "Tareas" },
  { id: "notes", label: "Notas" },
  { id: "nutrition", label: "Nutrición" },
  { id: "account", label: "Cuenta y seguridad" },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

const SECTION_META: Record<
  SettingsSection,
  { eyebrow: string; title: string; subtitle: string }
> = {
  general: {
    eyebrow: "TU ESPACIO, A TU MANERA",
    title: "General",
    subtitle: "Tema, idioma, zona horaria y formatos.",
  },
  tasks: {
    eyebrow: "ORGANIZA A TU RITMO",
    title: "Tareas",
    subtitle: "Cómo se ordenan, se avisan y se muestran tus tareas.",
  },
  notes: {
    eyebrow: "CONECTA LO QUE PIENSAS",
    title: "Notas",
    subtitle: "Preferencias del espacio de notas.",
  },
  nutrition: {
    eyebrow: "COME CON INTENCIÓN",
    title: "Nutrición",
    subtitle: "Unidades y objetivos del espacio de nutrición.",
  },
  account: {
    eyebrow: "SOLO TÚ",
    title: "Cuenta y seguridad",
    subtitle: "Contraseña y sesiones activas.",
  },
};

export function SettingsPage({
  settings,
  section,
}: {
  settings: Settings;
  section: SettingsSection;
}) {
  const [value, setValue] = useState(settings);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const client = useQueryClient();
  async function perform(operation: () => Promise<unknown>, done: string) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      await operation();
      await client.invalidateQueries();
      setMessage(done);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void perform(
      () => api("/settings", "PUT", value),
      "Preferencias guardadas",
    );
  }
  function password(event: FormEvent) {
    event.preventDefault();
    void perform(async () => {
      await api("/auth/password", "PUT", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      await client.invalidateQueries({ queryKey: ["/auth/me"] });
      client.clear();
    }, "Contraseña cambiada");
  }
  function closeSessions() {
    void perform(async () => {
      await api("/auth/sessions", "DELETE");
      await client.invalidateQueries({ queryKey: ["/auth/me"] });
      client.clear();
    }, "Sesiones cerradas");
  }
  const meta = SECTION_META[section];
  return (
    <div className="settings-page">
      <div className="eyebrow">{meta.eyebrow}</div>
      <h1>{meta.title}</h1>
      <p className="page-subtitle">{meta.subtitle}</p>
      {section === "general" && (
        <SettingsCard onSubmit={save} pending={pending} title="General y apariencia">
          <div className="form-grid">
            <label>
              Zona horaria
              <input
                required
                value={value.timezone}
                onChange={(event) =>
                  setValue({ ...value, timezone: event.target.value })
                }
              />
            </label>
            <label>
              Idioma
              <Dropdown
                ariaLabel="Idioma"
                value={value.language}
                disabled
                searchable={false}
                options={[{ value: "es", label: "Español" }]}
                onChange={() => undefined}
              />
            </label>
            <label>
              Primer día de la semana
              <Dropdown
                ariaLabel="Primer día de la semana"
                value={String(value.week_start)}
                searchable={false}
                onChange={(next) =>
                  setValue({ ...value, week_start: Number(next) })
                }
                options={[
                  { value: "1", label: "Lunes" },
                  { value: "0", label: "Domingo" },
                ]}
              />
            </label>
            <label>
              Formato horario
              <Dropdown
                ariaLabel="Formato horario"
                value={value.hour_format}
                searchable={false}
                onChange={(next) =>
                  setValue({
                    ...value,
                    hour_format: next === "12" ? "12" : "24",
                  })
                }
                options={[
                  { value: "24", label: "24 horas" },
                  { value: "12", label: "12 horas" },
                ]}
              />
            </label>
            <label>
              Formato de fecha
              <Dropdown
                ariaLabel="Formato de fecha"
                value={value.date_format}
                searchable={false}
                onChange={(next) =>
                  setValue({
                    ...value,
                    date_format:
                      next === "YYYY-MM-DD" ? "YYYY-MM-DD" : "DD/MM/YYYY",
                  })
                }
                options={[
                  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
                  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
                ]}
              />
            </label>
            <label>
              Tema
              <Dropdown
                ariaLabel="Tema"
                value={value.theme}
                searchable={false}
                onChange={(next) =>
                  setValue({
                    ...value,
                    theme:
                      next === "dark"
                        ? "dark"
                        : next === "light"
                          ? "light"
                          : "system",
                  })
                }
                options={[
                  { value: "system", label: "Sistema" },
                  { value: "light", label: "Claro" },
                  { value: "dark", label: "Oscuro" },
                ]}
              />
            </label>
            <div className="accent-field">
              <span>Color de acento</span>
              <div
                className="accent-options"
                role="group"
                aria-label="Color de acento"
              >
                {ACCENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="accent-option"
                    style={{ "--swatch": option.value } as CSSProperties}
                    aria-label={`Acento ${option.name}`}
                    aria-pressed={value.accent_color === option.value}
                    onClick={() =>
                      setValue({ ...value, accent_color: option.value })
                    }
                  >
                    <span aria-hidden="true" />
                    {option.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button className="primary" disabled={pending}>
            Guardar preferencias
          </button>
        </SettingsCard>
      )}
      {section === "tasks" && (
        <TasksSettings
          value={value}
          setValue={setValue}
          onSubmit={save}
          pending={pending}
        />
      )}
      {section === "notes" && <NotesSettings />}
      {section === "nutrition" && <NutritionSettings />}
      {section === "account" && (
        <SettingsCard
          onSubmit={password}
          pending={pending}
          title="Contraseña"
        >
          <p className="muted">
            Cambiar la contraseña cierra todas las sesiones.
          </p>
          <label>
            Contraseña actual
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={72}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <div className="form-footer">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={closeSessions}
            >
              Cerrar todas las sesiones
            </button>
            <button className="primary" disabled={pending}>
              Cambiar contraseña
            </button>
          </div>
        </SettingsCard>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

function SettingsCard({
  title,
  onSubmit,
  pending = false,
  children,
}: {
  title: string;
  onSubmit: (event: FormEvent) => void;
  pending?: boolean;
  children: ReactNode;
}) {
  return (
    <form
      className="settings-card editor"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(event);
      }}
    >
      <h2>{title}</h2>
      {children}
    </form>
  );
}

function TasksSettings({
  value,
  setValue,
  onSubmit,
  pending,
}: {
  value: Settings;
  setValue: (next: Settings) => void;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
}) {
  const [calendarMode, setCalendarMode] = useState<CalendarMode>(() =>
    loadCalendarMode(),
  );
  function chooseCalendarMode(next: CalendarMode) {
    setCalendarMode(next);
    saveCalendarMode(next);
  }
  return (
    <SettingsCard
      title="Tareas"
      onSubmit={onSubmit}
      pending={pending}
    >
      <div className="form-grid">
        <label>
          Orden predeterminado
          <Dropdown
            ariaLabel="Orden predeterminado"
            value={value.default_sort}
            searchable={false}
            onChange={(next) => setValue({ ...value, default_sort: next })}
            options={[
              { value: "manual", label: "Manual" },
              { value: "date", label: "Fecha" },
              { value: "priority", label: "Prioridad" },
              { value: "created", label: "Fecha de creación" },
              { value: "name", label: "Nombre" },
            ]}
          />
        </label>
        <label>
          Vista de calendario por defecto
          <Dropdown
            ariaLabel="Vista de calendario por defecto"
            value={calendarMode}
            searchable={false}
            onChange={(next) => chooseCalendarMode(next as CalendarMode)}
            options={CALENDAR_MODES.map((mode) => ({
              value: mode.value,
              label: mode.label,
            }))}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={value.browser_notifications}
            onChange={(event) =>
              setValue({
                ...value,
                browser_notifications: event.target.checked,
              })
            }
          />
          Notificaciones del navegador
        </label>
      </div>
      <button className="primary" disabled={pending}>
        Guardar preferencias
      </button>
    </SettingsCard>
  );
}

function NotesSettings() {
  const [preferences, setPreferences] = useState(() =>
    loadNotesPreferences(),
  );
  function update(confirmDiscard: boolean) {
    const next = { ...preferences, confirmDiscard };
    setPreferences(next);
    saveNotesPreferences(next);
  }
  return (
    <SettingsCard title="Notas" onSubmit={() => undefined} pending={false}>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={preferences.confirmDiscard}
          onChange={(event) => update(event.target.checked)}
        />
        Confirmar antes de descartar cambios sin guardar
      </label>
      <p className="muted">
        Se guarda en este navegador. Los documentos se guardan automáticamente
        mientras escribes.
      </p>
    </SettingsCard>
  );
}

function NutritionSettings() {
  const [preferences, setPreferences] = useState(() =>
    loadNutritionPreferences(),
  );
  function updateUnit(unit: NutritionPreferences["defaultBaseUnit"]) {
    const next = { ...preferences, defaultBaseUnit: unit };
    setPreferences(next);
    saveNutritionPreferences(next);
  }
  return (
    <>
      <SettingsCard title="Nutrición" onSubmit={() => undefined} pending={false}>
        <label>
          Unidad base predeterminada al crear alimentos
          <Dropdown
            ariaLabel="Unidad base predeterminada"
            value={preferences.defaultBaseUnit}
            searchable={false}
            onChange={(next) =>
              updateUnit(next as NutritionPreferences["defaultBaseUnit"])
            }
            options={[
              { value: "g", label: "Gramos (g)" },
              { value: "ml", label: "Mililitros (ml)" },
              { value: "unit", label: "Unidades (ud)" },
            ]}
          />
        </label>
        <p className="muted">Se guarda en este navegador.</p>
      </SettingsCard>
      <SettingsCard
        title="Objetivos diarios"
        onSubmit={() => undefined}
        pending={false}
      >
        <p className="muted">
          Peso, actividad, calorías y macros se editan en el perfil nutricional.
        </p>
        <Link className="secondary settings-link" to="/nutrition/profile">
          Abrir perfil y objetivos
        </Link>
      </SettingsCard>
    </>
  );
}
