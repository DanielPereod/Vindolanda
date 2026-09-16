import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import type { DiaryEntry, MealPlan, Recipe, Settings } from "./types";
import { localDate, mondayOf, shiftDate, formatDate } from "./dates";
import { Dropdown } from "./Dropdown";
import { Modal } from "./Modal";
import { AddPlanItem } from "./AddPlanItem";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const MEALS: { key: DiaryEntry["meal"]; label: string }[] = [
  { key: "breakfast", label: "Desayuno" },
  { key: "lunch", label: "Comida" },
  { key: "dinner", label: "Cena" },
  { key: "snack", label: "Snacks" },
];

/** Plan semanal: días por comida, plantillas y paso al diario. */
export function PlanPage() {
  const settings = useResource<Settings>("/settings");
  const [weekStart, setWeekStart] = useState(() =>
    mondayOf(new Date().toISOString().slice(0, 10)),
  );
  const [selectedDay, setSelectedDay] = useState(0);
  const [addingMeal, setAddingMeal] = useState<DiaryEntry["meal"] | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current && settings.data)
      setWeekStart(mondayOf(localDate(settings.data.timezone)));
  }, [settings.data]);

  const plan = useResource<MealPlan | null>(
    `/nutrition/plans?week=${weekStart}`,
  );
  const templates = useResource<MealPlan[]>("/nutrition/plans?template=true");
  const recipes = useResource<Recipe[]>("/nutrition/recipes");
  const data = plan.data;

  function moveWeek(days: number) {
    touched.current = true;
    setSelectedDay(0);
    setWeekStart((current) => mondayOf(shiftDate(current, days)));
  }

  async function run(operation: () => Promise<void>) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      await operation();
      await client.invalidateQueries();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  function createWeek() {
    void run(async () => {
      await api("/nutrition/plans", "POST", {
        name: `Semana del ${formatDate(weekStart)}`,
        week_start: weekStart,
        is_template: false,
      });
    });
  }

  function applyTemplate(templateID: string) {
    if (!templateID) return;
    void run(async () => {
      await api(`/nutrition/plans/${templateID}/copy`, "POST", {
        week_start: weekStart,
      });
    });
  }

  const selectedDate = shiftDate(weekStart, selectedDay);
  const dayItems = (data?.items ?? []).filter(
    (item) => item.day_index === selectedDay,
  );
  const dayCalories = dayItems.reduce(
    (total, item) => total + item.calories_kcal,
    0,
  );

  return (
    <>
      <div className="eyebrow">TU SEMANA</div>
      <div className="page-heading">
        <h1>Plan semanal</h1>
        <div className="diary-date-nav">
          <button
            className="icon-button"
            aria-label="Semana anterior"
            onClick={() => moveWeek(-7)}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            aria-label="Semana"
            value={weekStart}
            onChange={(event) => {
              touched.current = true;
              if (event.target.value)
                setWeekStart(mondayOf(event.target.value));
            }}
          />
          <button
            className="icon-button"
            aria-label="Semana siguiente"
            onClick={() => moveWeek(7)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <p className="page-subtitle">
        Semana del {formatDate(weekStart)} · planifica y pasa el día al diario
        cuando toque.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="muted">{message}</p>}
      {plan.isPending ? (
        <p className="muted loading">Cargando el plan…</p>
      ) : plan.isError ? (
        <p role="alert" className="error">
          No se pudo cargar el plan.{" "}
          <button onClick={() => void plan.refetch()}>Reintentar</button>
        </p>
      ) : !data ? (
        <div className="empty-state">
          <h3>Esta semana no tiene plan</h3>
          <p>Crea un plan y empieza a colocar comidas.</p>
          <button className="primary" disabled={pending} onClick={createWeek}>
            <Plus size={16} />
            Crear plan semanal
          </button>
        </div>
      ) : (
        <>
          <div className="list-toolbar">
            <div className="list-title">{data.name}</div>
            <div className="plan-actions">
              {(templates.data ?? []).length > 0 && (
                <Dropdown
                  ariaLabel="Usar plantilla"
                  variant="inline"
                  value=""
                  placeholder="Usar plantilla…"
                  searchable={false}
                  options={(templates.data ?? []).map((template) => ({
                    value: template.id,
                    label: template.name,
                  }))}
                  onChange={applyTemplate}
                />
              )}
              <button
                className="text-button"
                disabled={pending}
                onClick={() => {
                  setTemplateName(`${data.name} (plantilla)`);
                  setTemplateOpen(true);
                }}
              >
                Guardar como plantilla
              </button>
              <button
                className="text-button danger"
                onClick={() => setConfirmation(true)}
              >
                Eliminar plan
              </button>
            </div>
          </div>

          <div
            className="plan-days"
            role="tablist"
            aria-label="Días de la semana"
          >
            {DAY_LABELS.map((label, index) => (
              <button
                key={label}
                role="tab"
                aria-selected={selectedDay === index}
                className={selectedDay === index ? "active" : ""}
                onClick={() => setSelectedDay(index)}
              >
                <span>{label}</span>
                <small>{shiftDate(weekStart, index).slice(8, 10)}</small>
              </button>
            ))}
          </div>

          <div className="plan-day">
            <header className="plan-day-head">
              <h2>
                {DAY_LABELS[selectedDay]} · {formatDate(selectedDate)}
              </h2>
              <div>
                <span className="muted">{Math.round(dayCalories)} kcal</span>
                <button
                  className="primary"
                  disabled={pending || dayItems.length === 0}
                  onClick={() =>
                    void run(async () => {
                      await api(`/nutrition/plans/${data.id}/log`, "POST", {
                        day_index: selectedDay,
                      });
                      setMessage("Día pasado al diario");
                    })
                  }
                >
                  Pasar el día al diario
                </button>
              </div>
            </header>
            {MEALS.map((meal) => {
              const items = dayItems.filter((item) => item.meal === meal.key);
              return (
                <section className="diary-meal" key={meal.key}>
                  <header>
                    <h3>{meal.label}</h3>
                  </header>
                  {items.length === 0 ? (
                    <p className="muted">Sin planificar.</p>
                  ) : (
                    <ul className="diary-entries">
                      {items.map((item) => (
                        <li key={item.id}>
                          <span>
                            <strong>{item.label}</strong>
                            <small className="muted">
                              {" "}
                              · {item.quantity}{" "}
                              {item.unit === "unit" ? "ración(es)" : item.unit}
                            </small>
                          </span>
                          <span className="muted">
                            {Math.round(item.calories_kcal)} kcal
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`Quitar ${item.label}`}
                            disabled={pending}
                            onClick={() =>
                              void run(() =>
                                api(
                                  `/nutrition/plans/${data.id}/items/${item.id}`,
                                  "DELETE",
                                ),
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
          </div>
        </>
      )}

      {addingMeal && data && (
        <Modal title="Añadir al plan" onClose={() => setAddingMeal(null)}>
          <AddPlanItem
            planId={data.id}
            dayIndex={selectedDay}
            meal={addingMeal}
            recipes={recipes.data ?? []}
            onClose={() => setAddingMeal(null)}
            onSaved={() => void client.invalidateQueries()}
          />
        </Modal>
      )}
      {templateOpen && data && (
        <Modal
          title="Guardar como plantilla"
          onClose={() => setTemplateOpen(false)}
        >
          <div className="editor">
            <label>
              Nombre de la plantilla
              <input
                autoFocus
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
              />
            </label>
            <footer className="form-footer">
              <button
                className="secondary"
                onClick={() => setTemplateOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={pending || !templateName.trim()}
                onClick={() =>
                  void run(async () => {
                    await api(`/nutrition/plans/${data.id}/copy`, "POST", {
                      is_template: true,
                      name: templateName.trim(),
                    });
                    setTemplateOpen(false);
                    setMessage("Plantilla guardada");
                  })
                }
              >
                Guardar
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {confirmation && data && (
        <Modal title="Eliminar plan" onClose={() => setConfirmation(false)}>
          <div className="editor">
            <p>Se eliminará «{data.name}» y sus comidas planificadas.</p>
            <footer className="form-footer">
              <button
                className="secondary"
                onClick={() => setConfirmation(false)}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await api(`/nutrition/plans/${data.id}`, "DELETE");
                    setConfirmation(false);
                  })
                }
              >
                Eliminar
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
