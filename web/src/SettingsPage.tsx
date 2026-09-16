import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "./api";
import type { Settings } from "./types";
import { ACCENT_OPTIONS } from "./appearance";
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
            <select value={value.language} disabled>
              <option value="es">Español</option>
            </select>
          </label>
          <label>
            Primer día de la semana
            <select
              value={value.week_start}
              onChange={(event) =>
                setValue({ ...value, week_start: Number(event.target.value) })
              }
            >
              <option value="1">Lunes</option>
              <option value="0">Domingo</option>
            </select>
          </label>
          <label>
            Formato horario
            <select
              value={value.hour_format}
              onChange={(event) =>
                setValue({
                  ...value,
                  hour_format: event.target.value === "12" ? "12" : "24",
                })
              }
            >
              <option value="24">24 horas</option>
              <option value="12">12 horas</option>
            </select>
          </label>
          <label>
            Formato de fecha
            <select
              value={value.date_format}
              onChange={(event) =>
                setValue({
                  ...value,
                  date_format:
                    event.target.value === "YYYY-MM-DD"
                      ? "YYYY-MM-DD"
                      : "DD/MM/YYYY",
                })
              }
            >
              <option>DD/MM/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </label>
          <label>
            Tema
            <select
              value={value.theme}
              onChange={(event) =>
                setValue({
                  ...value,
                  theme:
                    event.target.value === "dark"
                      ? "dark"
                      : event.target.value === "light"
                        ? "light"
                        : "system",
                })
              }
            >
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </label>
          <div className="accent-field">
            <span>Color de acento</span>
            <div className="accent-options" role="group" aria-label="Color de acento">
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
            <select
              value={value.default_sort}
              onChange={(event) =>
                setValue({ ...value, default_sort: event.target.value })
              }
            >
              <option value="manual">Manual</option>
              <option value="date">Fecha</option>
              <option value="priority">Prioridad</option>
              <option value="created">Fecha de creación</option>
              <option value="name">Nombre</option>
            </select>
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
