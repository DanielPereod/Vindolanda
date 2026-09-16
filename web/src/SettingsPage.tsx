import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "./api";
import type { Settings } from "./types";
import { ACCENT_OPTIONS } from "./appearance";
import { Dropdown } from "./Dropdown";
export function SettingsPage({ settings }: { settings: Settings }) {
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
  return (
    <div className="settings-page">
      <div className="eyebrow">TU ESPACIO, A TU MANERA</div>
      <h1>Configuración</h1>
      <p className="page-subtitle">
        Los pequeños detalles que hacen que todo encaje.
      </p>
      <form className="settings-card editor" onSubmit={save}>
        <h2>General y apariencia</h2>
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
        </div>
        <button className="primary" disabled={pending}>
          Guardar preferencias
        </button>
      </form>
      <form
        className="settings-card editor"
        onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            await api("/auth/password", "PUT", {
              current_password: currentPassword,
              new_password: newPassword,
            });
            await client.invalidateQueries({ queryKey: ["/auth/me"] });
            client.clear();
          }, "Contraseña cambiada");
        }}
      >
        <h2>Cuenta y seguridad</h2>
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
            onClick={() => {
              void perform(async () => {
                await api("/auth/sessions", "DELETE");
                await client.invalidateQueries({ queryKey: ["/auth/me"] });
                client.clear();
              }, "Sesiones cerradas");
            }}
          >
            Cerrar todas las sesiones
          </button>
          <button className="primary" disabled={pending}>
            Cambiar contraseña
          </button>
        </div>
      </form>
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
