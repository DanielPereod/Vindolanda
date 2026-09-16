import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Droplet, Plus, Trash2 } from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import type { DiaryDay, DiaryEntry, Settings } from "./types";
import { localDate, shiftDate, formatDate } from "./dates";
import { Modal } from "./Modal";
import { AddDiaryEntry } from "./AddDiaryEntry";

const MEALS: { key: DiaryEntry["meal"]; label: string }[] = [
  { key: "breakfast", label: "Desayuno" },
  { key: "lunch", label: "Comida" },
  { key: "dinner", label: "Cena" },
  { key: "snack", label: "Snacks" },
];

const UNIT_LABELS: Record<DiaryEntry["unit"], string> = {
  g: "g",
  ml: "ml",
  unit: "ud",
};

function MacroBar({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const ratio = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div className="macro-bar">
      <div className="macro-bar-head">
        <span>{label}</span>
        <span className="muted">
          {Math.round(value)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="macro-bar-track">
        <div
          className="macro-bar-fill"
          style={{ width: `${ratio * 100}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/** Diario del día: comidas, totales frente a objetivos y agua. */
export function DiaryPage() {
  const settings = useResource<Settings>("/settings");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [addingMeal, setAddingMeal] = useState<DiaryEntry["meal"] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current && settings.data)
      setDate(localDate(settings.data.timezone));
  }, [settings.data]);

  const day = useResource<DiaryDay>(`/nutrition/diary?date=${date}`);
  const data = day.data;

  function move(days: number) {
    touched.current = true;
    setDate((current) => shiftDate(current, days));
  }

  async function run(operation: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await operation();
      await client.invalidateQueries();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  function adjustWater(delta: number) {
    const next = Math.max(0, (data?.water_ml ?? 0) + delta);
    void run(() =>
      api("/nutrition/diary/water", "PUT", {
        entry_date: date,
        water_ml: next,
      }),
    );
  }

  const consumed = data?.totals.calories_kcal ?? 0;
  const calorieTarget = data?.targets.calories_kcal ?? 0;
  const remaining = Math.round(calorieTarget - consumed);
  const addingMealLabel =
    MEALS.find((meal) => meal.key === addingMeal)?.label ?? "";

  return (
    <>
      <div className="eyebrow">TU DÍA</div>
      <div className="page-heading">
        <h1>Diario</h1>
        <div className="diary-date-nav">
          <button
            className="icon-button"
            aria-label="Día anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            aria-label="Fecha del diario"
            value={date}
            onChange={(event) => {
              touched.current = true;
              setDate(event.target.value);
            }}
          />
          <button
            className="icon-button"
            aria-label="Día siguiente"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <p className="page-subtitle">
        {formatDate(date, settings.data?.date_format ?? "DD/MM/YYYY")} ·
        registra lo que comes y mira cómo encaja con tu objetivo.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {day.isError ? (
        <p role="alert" className="error">
          No se pudo cargar el diario.{" "}
          <button onClick={() => void day.refetch()}>Reintentar</button>
        </p>
      ) : (
        <>
          <div className="diary-summary">
            <article className="entity-card diary-calories">
              <span className="muted">Calorías restantes</span>
              <strong>{remaining}</strong>
              <small className="muted">
                {Math.round(consumed)} / {calorieTarget} kcal
              </small>
            </article>
            <div className="diary-macros">
              <MacroBar
                label="Proteína"
                value={data?.totals.protein_g ?? 0}
                target={data?.targets.protein_g ?? 0}
                unit="g"
              />
              <MacroBar
                label="Carbohidratos"
                value={data?.totals.carbs_g ?? 0}
                target={data?.targets.carbs_g ?? 0}
                unit="g"
              />
              <MacroBar
                label="Grasa"
                value={data?.totals.fat_g ?? 0}
                target={data?.targets.fat_g ?? 0}
                unit="g"
              />
              <MacroBar
                label="Fibra"
                value={data?.totals.fiber_g ?? 0}
                target={data?.targets.fiber_g ?? 0}
                unit="g"
              />
            </div>
          </div>

          <div className="diary-water">
            <Droplet size={18} />
            <span>
              Agua: <strong>{data?.water_ml ?? 0}</strong> /{" "}
              {data?.targets.water_ml ?? 0} ml
            </span>
            <button
              className="icon-button"
              aria-label="Quitar 250 ml de agua"
              disabled={pending}
              onClick={() => adjustWater(-250)}
            >
              −
            </button>
            <button
              className="secondary"
              disabled={pending}
              onClick={() => adjustWater(250)}
            >
              +250 ml
            </button>
          </div>

          {MEALS.map((meal) => {
            const entries = (data?.entries ?? []).filter(
              (entry) => entry.meal === meal.key,
            );
            const mealCalories = entries.reduce(
              (total, entry) => total + entry.calories_kcal,
              0,
            );
            return (
              <section className="diary-meal" key={meal.key}>
                <header>
                  <h2>{meal.label}</h2>
                  <span className="muted">{Math.round(mealCalories)} kcal</span>
                </header>
                {entries.length === 0 ? (
                  <p className="muted">Nada registrado todavía.</p>
                ) : (
                  <ul className="diary-entries">
                    {entries.map((entry) => (
                      <li key={entry.id}>
                        <span>
                          <strong>{entry.label}</strong>
                          <small className="muted">
                            {" "}
                            · {entry.quantity} {UNIT_LABELS[entry.unit]}
                          </small>
                        </span>
                        <span className="muted">
                          {Math.round(entry.calories_kcal)} kcal
                        </span>
                        <button
                          className="icon-button"
                          aria-label={`Quitar ${entry.label}`}
                          disabled={pending}
                          onClick={() =>
                            void run(() =>
                              api(`/nutrition/diary/${entry.id}`, "DELETE"),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  className="text-button"
                  onClick={() => setAddingMeal(meal.key)}
                >
                  <Plus size={14} />
                  Añadir a {meal.label.toLowerCase()}
                </button>
              </section>
            );
          })}
        </>
      )}

      {addingMeal && (
        <Modal title="Añadir alimento" onClose={() => setAddingMeal(null)}>
          <AddDiaryEntry
            date={date}
            meal={addingMeal}
            label={addingMealLabel}
            onClose={() => setAddingMeal(null)}
            onSaved={() => void client.invalidateQueries()}
          />
        </Modal>
      )}
    </>
  );
}
