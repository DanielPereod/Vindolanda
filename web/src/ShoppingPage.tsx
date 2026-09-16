import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import type { MealPlan, Recipe, Settings, ShoppingItem } from "./types";
import { localDate, mondayOf } from "./dates";
import { Dropdown } from "./Dropdown";

const UNIT_LABELS: Record<ShoppingItem["unit"], string> = {
  g: "g",
  ml: "ml",
  unit: "ud",
};

/** Lista de la compra: generada desde el plan o las recetas, editable. */
export function ShoppingPage() {
  const settings = useResource<Settings>("/settings");
  const items = useResource<ShoppingItem[]>("/nutrition/shopping");
  const recipes = useResource<Recipe[]>("/nutrition/recipes");
  const [weekStart, setWeekStart] = useState(() =>
    mondayOf(new Date().toISOString().slice(0, 10)),
  );
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<ShoppingItem["unit"]>("unit");
  const [recipePick, setRecipePick] = useState("");
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
  const list = items.data ?? [];
  const pendingItems = list.filter((item) => !item.checked);
  const checkedItems = list.filter((item) => item.checked);

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

  function addItem() {
    const trimmed = label.trim();
    if (!trimmed) return;
    void run(async () => {
      await api("/nutrition/shopping/items", "POST", {
        label: trimmed,
        quantity,
        unit,
      });
      setLabel("");
      setQuantity(1);
    });
  }

  function generateFromPlan() {
    if (!plan.data) return;
    void run(async () => {
      await api("/nutrition/shopping/generate", "POST", {
        plan_id: plan.data?.id,
      });
      setMessage("Lista generada desde el plan");
    });
  }

  function generateFromRecipe() {
    if (!recipePick) return;
    void run(async () => {
      await api("/nutrition/shopping/generate", "POST", {
        recipe_ids: [recipePick],
      });
      setMessage("Lista generada desde la receta");
    });
  }

  function pushToTasks() {
    if (pendingItems.length === 0) return;
    const description = pendingItems
      .map(
        (item) => `- ${item.label}: ${item.quantity} ${UNIT_LABELS[item.unit]}`,
      )
      .join("\n");
    void run(async () => {
      await api("/tasks", "POST", {
        title: "Lista de la compra",
        description,
      });
      setMessage("Tarea creada con la lista");
    });
  }

  function toggle(item: ShoppingItem) {
    void run(async () => {
      await api(`/nutrition/shopping/${item.id}`, "PATCH", {
        checked: !item.checked,
      });
    });
  }

  return (
    <>
      <div className="eyebrow">TU COMPRA</div>
      <div className="page-heading">
        <h1>Lista de la compra</h1>
        <div className="plan-actions">
          <button
            className="text-button"
            disabled={pending || !plan.data}
            onClick={generateFromPlan}
          >
            <ShoppingCart size={15} />
            Generar del plan
          </button>
        </div>
      </div>
      <p className="page-subtitle">
        Se genera desde el plan de la semana o desde una receta. Lo manual no se
        borra al regenerar.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="muted">{message}</p>}

      <div className="shopping-add">
        <input
          aria-label="Nuevo artículo"
          placeholder="Añadir artículo…"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addItem();
          }}
        />
        <input
          aria-label="Cantidad"
          type="number"
          min={0}
          step="0.01"
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value) || 0)}
        />
        <Dropdown
          ariaLabel="Unidad"
          variant="inline"
          value={unit}
          searchable={false}
          options={[
            { value: "unit", label: "ud" },
            { value: "g", label: "g" },
            { value: "ml", label: "ml" },
          ]}
          onChange={(next) => setUnit(next as ShoppingItem["unit"])}
        />
        <button
          className="primary"
          disabled={pending || !label.trim()}
          onClick={addItem}
        >
          <Plus size={16} />
          Añadir
        </button>
      </div>

      {(recipes.data ?? []).length > 0 && (
        <div className="shopping-recipe">
          <Dropdown
            ariaLabel="Generar desde receta"
            variant="inline"
            value={recipePick}
            placeholder="Generar desde receta…"
            searchable
            options={(recipes.data ?? []).map((recipe) => ({
              value: recipe.id,
              label: recipe.name,
            }))}
            onChange={setRecipePick}
          />
          <button
            className="secondary"
            disabled={pending || !recipePick}
            onClick={generateFromRecipe}
          >
            Generar
          </button>
        </div>
      )}

      {items.isError ? (
        <p role="alert" className="error">
          No se pudo cargar la lista.{" "}
          <button onClick={() => void items.refetch()}>Reintentar</button>
        </p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <h3>La lista está vacía</h3>
          <p>Añade artículos a mano o genera desde tu plan semanal.</p>
        </div>
      ) : (
        <>
          <ul className="shopping-list">
            {pendingItems.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggle(item)}
                  />
                  <span>{item.label}</span>
                </label>
                <span className="muted">
                  {item.quantity} {UNIT_LABELS[item.unit]}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Eliminar ${item.label}`}
                  disabled={pending}
                  onClick={() =>
                    void run(() =>
                      api(`/nutrition/shopping/${item.id}`, "DELETE"),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
            {checkedItems.length > 0 && (
              <li className="shopping-checked-head">
                <span className="muted">{checkedItems.length} comprado(s)</span>
                <button
                  className="text-button"
                  disabled={pending}
                  onClick={() =>
                    void run(() => api("/nutrition/shopping/checked", "DELETE"))
                  }
                >
                  Limpiar comprados
                </button>
              </li>
            )}
            {checkedItems.map((item) => (
              <li key={item.id} className="shopping-checked">
                <label>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggle(item)}
                  />
                  <span>{item.label}</span>
                </label>
                <span className="muted">
                  {item.quantity} {UNIT_LABELS[item.unit]}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Eliminar ${item.label}`}
                  disabled={pending}
                  onClick={() =>
                    void run(() =>
                      api(`/nutrition/shopping/${item.id}`, "DELETE"),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <button
            className="primary"
            disabled={pending || pendingItems.length === 0}
            onClick={pushToTasks}
          >
            Crear tarea con lo pendiente
          </button>
        </>
      )}
    </>
  );
}
