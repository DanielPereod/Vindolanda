import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "./api";
import type { DiaryEntry, Food, Recipe } from "./types";
import { Dropdown } from "./Dropdown";
import { FoodPicker } from "./FoodPicker";

const MEALS: { value: DiaryEntry["meal"]; label: string }[] = [
  { value: "breakfast", label: "Desayuno" },
  { value: "lunch", label: "Comida" },
  { value: "dinner", label: "Cena" },
  { value: "snack", label: "Snacks" },
];

/** Añade una receta o un alimento a un día del plan. */
export function AddPlanItem({
  planId,
  dayIndex,
  meal,
  recipes,
  onClose,
  onSaved,
}: {
  planId: string;
  dayIndex: number;
  meal: DiaryEntry["meal"];
  recipes: Recipe[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"recipe" | "food">("recipe");
  const [recipeID, setRecipeID] = useState("");
  const [food, setFood] = useState<Food | null>(null);
  const [chosenMeal, setChosenMeal] = useState<DiaryEntry["meal"]>(meal);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const ready = kind === "recipe" ? recipeID !== "" : food !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    setError("");
    try {
      await api(`/nutrition/plans/${planId}/items`, "POST", {
        day_index: dayIndex,
        meal: chosenMeal,
        quantity,
        ...(kind === "recipe"
          ? { recipe_id: recipeID }
          : { food_id: food?.id }),
      });
      onSaved();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div
        className="view-toggle"
        role="group"
        aria-label="Tipo de comida planificada"
      >
        <button
          type="button"
          className={kind === "recipe" ? "active" : ""}
          aria-pressed={kind === "recipe"}
          onClick={() => setKind("recipe")}
        >
          Receta
        </button>
        <button
          type="button"
          className={kind === "food" ? "active" : ""}
          aria-pressed={kind === "food"}
          onClick={() => setKind("food")}
        >
          Alimento
        </button>
      </div>
      <label>
        Comida
        <Dropdown
          ariaLabel="Comida del día"
          value={chosenMeal}
          searchable={false}
          options={MEALS}
          onChange={(next) => setChosenMeal(next as DiaryEntry["meal"])}
        />
      </label>
      {kind === "recipe" ? (
        <label>
          Receta
          <Dropdown
            ariaLabel="Receta"
            value={recipeID}
            searchable
            placeholder="Buscar receta…"
            options={recipes.map((recipe) => ({
              value: recipe.id,
              label: recipe.name,
            }))}
            onChange={(next) => {
              setRecipeID(next);
              setQuantity(1);
            }}
          />
        </label>
      ) : (
        <div className="field">
          <span>Alimento</span>
          <FoodPicker
            ariaLabel="Alimento"
            selected={food ? { id: food.id, name: food.name } : null}
            onSelect={(next) => {
              setFood(next);
              setQuantity(next.base_quantity);
            }}
          />
        </div>
      )}
      <label>
        {kind === "recipe" ? "Raciones" : "Cantidad"}
        <input
          type="number"
          min={0.01}
          step="0.01"
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value) || 0)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer className="form-footer">
        <button type="button" className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={pending || !ready}>
          {pending ? "Añadiendo…" : "Añadir al plan"}
        </button>
      </footer>
    </form>
  );
}
