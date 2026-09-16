import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import type { BodyMeasurement, BodyMeasurementInput, Settings } from "./types";
import { localDate, formatDate } from "./dates";
import { sparklinePath, weightSeries } from "./progress";

type NumericMetric = Exclude<
  keyof BodyMeasurementInput,
  "measured_on" | "notes"
>;

const METRICS: { key: NumericMetric; label: string }[] = [
  { key: "weight_kg", label: "Peso (kg)" },
  { key: "body_fat_pct", label: "Grasa corporal (%)" },
  { key: "waist_cm", label: "Cintura (cm)" },
  { key: "hip_cm", label: "Cadera (cm)" },
  { key: "chest_cm", label: "Pecho (cm)" },
  { key: "neck_cm", label: "Cuello (cm)" },
  { key: "arm_cm", label: "Brazo (cm)" },
  { key: "thigh_cm", label: "Muslo (cm)" },
];

const EMPTY_METRICS: Record<NumericMetric, string> = {
  weight_kg: "",
  body_fat_pct: "",
  waist_cm: "",
  hip_cm: "",
  chest_cm: "",
  neck_cm: "",
  arm_cm: "",
  thigh_cm: "",
};

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Progreso corporal: peso, perímetros y evolución. */
export function ProgressPage() {
  const settings = useResource<Settings>("/settings");
  const measurements = useResource<BodyMeasurement[]>(
    "/nutrition/measurements",
  );
  const [measuredOn, setMeasuredOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [metrics, setMetrics] = useState<Record<NumericMetric, string>>({
    ...EMPTY_METRICS,
  });
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current && settings.data)
      setMeasuredOn(localDate(settings.data.timezone));
  }, [settings.data]);

  const values = measurements.data ?? [];
  const points = weightSeries(values);
  const chartWidth = 320;
  const chartHeight = 120;
  const path = sparklinePath(
    points.map((point) => point.weight),
    chartWidth,
    chartHeight,
  );
  const latest = points[points.length - 1];
  const first = points[0];

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const input: BodyMeasurementInput = {
      measured_on: measuredOn,
      notes,
      weight_kg: toNumber(metrics.weight_kg),
      body_fat_pct: toNumber(metrics.body_fat_pct),
      waist_cm: toNumber(metrics.waist_cm),
      hip_cm: toNumber(metrics.hip_cm),
      chest_cm: toNumber(metrics.chest_cm),
      neck_cm: toNumber(metrics.neck_cm),
      arm_cm: toNumber(metrics.arm_cm),
      thigh_cm: toNumber(metrics.thigh_cm),
    };
    try {
      await api("/nutrition/measurements", "POST", input);
      setMetrics({ ...EMPTY_METRICS });
      setNotes("");
      setMessage("Medida guardada");
      await client.invalidateQueries();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  async function remove(measurement: BodyMeasurement) {
    setPending(true);
    setError("");
    try {
      await api(`/nutrition/measurements/${measurement.id}`, "DELETE");
      await client.invalidateQueries();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="eyebrow">TU EVOLUCIÓN</div>
      <div className="page-heading">
        <h1>Progreso</h1>
      </div>
      <p className="page-subtitle">
        Registra tu peso y perímetros; verás cómo cambian con el tiempo.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="muted">{message}</p>}

      {points.length >= 2 && (
        <section className="weight-card" aria-label="Evolución del peso">
          <header>
            <TrendingUp size={18} />
            <span className="muted">
              {first?.weight} → {latest?.weight} kg
            </span>
            <span className="muted">
              {latest ? formatDate(latest.date) : ""}
            </span>
          </header>
          <svg
            className="weight-chart"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label="Gráfica de peso"
          >
            <path d={path} fill="none" strokeWidth={2} />
          </svg>
        </section>
      )}

      <form className="settings-card editor" onSubmit={save}>
        <h2>Nueva medida</h2>
        <div className="form-grid">
          <label>
            Fecha
            <input
              type="date"
              value={measuredOn}
              onChange={(event) => {
                touched.current = true;
                setMeasuredOn(event.target.value);
              }}
            />
          </label>
          {METRICS.map((metric) => (
            <label key={metric.key}>
              {metric.label}
              <input
                type="number"
                min={0}
                step="0.1"
                value={metrics[metric.key]}
                onChange={(event) =>
                  setMetrics((current) => ({
                    ...current,
                    [metric.key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <label>
          Notas
          <textarea
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <button className="primary" disabled={pending}>
          <Plus size={16} />
          Guardar medida
        </button>
      </form>

      {measurements.isError ? (
        <p role="alert" className="error">
          No se pudieron cargar las medidas.{" "}
          <button onClick={() => void measurements.refetch()}>
            Reintentar
          </button>
        </p>
      ) : values.length === 0 ? (
        <div className="empty-state">
          <h3>Aún no hay medidas</h3>
          <p>Registra la primera para empezar a ver tu evolución.</p>
        </div>
      ) : (
        <ul className="measurement-list">
          {values.map((measurement) => (
            <li key={measurement.id}>
              <span className="measurement-date">
                {formatDate(measurement.measured_on)}
              </span>
              <span className="muted">
                {measurement.weight_kg !== null &&
                  `${measurement.weight_kg} kg · `}
                {measurement.body_fat_pct !== null &&
                  `${measurement.body_fat_pct}% grasa · `}
                {measurement.waist_cm !== null &&
                  `cintura ${measurement.waist_cm} cm`}
              </span>
              {measurement.notes && (
                <span className="muted">{measurement.notes}</span>
              )}
              <button
                className="icon-button"
                aria-label={`Eliminar medida del ${formatDate(measurement.measured_on)}`}
                disabled={pending}
                onClick={() => void remove(measurement)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
