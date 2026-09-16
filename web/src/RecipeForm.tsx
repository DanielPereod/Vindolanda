import { useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  DraftIngredient,
  Recipe,
  RecipeDraft,
  RecipeInput,
} from "./types";
import { FoodPicker } from "./FoodPicker";

interface IngredientRow {
  food_id: string;
  food_name: string;
  quantity: number;
  note: string;
}

function rowsFrom(recipe: Recipe | null): IngredientRow[] {
  if (!recipe || recipe.ingredients.length === 0)
    return [{ food_id: "", food_name: "", quantity: 100, note: "" }];
  return recipe.ingredients.map((ingredient) => ({
    food_id: ingredient.food_id,
    food_name: ingredient.food_name,
    quantity: ingredient.quantity,
    note: ingredient.note,
  }));
}

function rowsFromDraft(draft: RecipeDraft): IngredientRow[] {
  if (draft.ingredients.length === 0) return rowsFrom(null);
  return draft.ingredients.map((ingredient) => ({
    food_id: ingredient.food_id,
    food_name: ingredient.food_name,
    quantity: draftQuantity(ingredient),
    note: ingredient.raw,
  }));
}

/** Solo se usa la cantidad leída si su unidad encaja con la del alimento. */
function draftQuantity(ingredient: DraftIngredient): number {
  if (!ingredient.food_id || ingredient.quantity <= 0) return 100;
  if (ingredient.unit === "" || ingredient.unit === ingredient.base_unit)
    return ingredient.quantity;
  return 100;
}

/** Alta y edición de una receta con sus ingredientes. */
export function RecipeForm({
  recipe,
  draft,
  pending,
  onCancel,
  onSubmit,
}: {
  recipe: Recipe | null;
  draft?: RecipeDraft | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (value: RecipeInput) => void;
}) {
  const source = recipe ?? draft ?? null;
  const [name, setName] = useState(source?.name ?? "");
  const [description, setDescription] = useState(source?.description ?? "");
  const [prepMinutes, setPrepMinutes] = useState(source?.prep_minutes ?? 0);
  const [servings, setServings] = useState(source?.servings ?? 1);
  const [tagsText, setTagsText] = useState((source?.tags ?? []).join(", "));
  const [favorite, setFavorite] = useState(recipe?.favorite ?? false);
  const [rows, setRows] = useState<IngredientRow[]>(() =>
    recipe ? rowsFrom(recipe) : draft ? rowsFromDraft(draft) : rowsFrom(null),
  );
  const unmatched = draft
    ? draft.ingredients.filter((ingredient) => !ingredient.food_id)
    : [];

  function updateRow(index: number, patch: Partial<IngredientRow>) {
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const tags = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    onSubmit({
      name,
      description,
      prep_minutes: prepMinutes,
      servings,
      tags,
      favorite,
      ingredients: rows
        .filter((row) => row.food_id)
        .map((row) => ({
          food_id: row.food_id,
          quantity: row.quantity,
          note: row.note,
        })),
    });
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div className="form-grid">
        <label>
          Nombre
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Tiempo (min)
          <input
            type="number"
            min={0}
            max={10000}
            value={prepMinutes}
            onChange={(event) =>
              setPrepMinutes(Number(event.target.value) || 0)
            }
          />
        </label>
        <label>
          Raciones
          <input
            type="number"
            min={0.25}
            step="0.25"
            value={servings}
            onChange={(event) => setServings(Number(event.target.value) || 1)}
          />
        </label>
        <label>
          Etiquetas (separadas por comas)
          <input
            value={tagsText}
            onChange={(event) => setTagsText(event.target.value)}
          />
        </label>
      </div>
      <label>
        Descripción y pasos (Markdown)
        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      {draft && (
        <p className="muted">
          Importada de{" "}
          <a href={draft.source_url} target="_blank" rel="noreferrer">
            la receta original
          </a>
          . Revisa los ingredientes: asigna un alimento a los que falten.
        </p>
      )}
      <h2>Ingredientes</h2>
      {unmatched.length > 0 && (
        <p className="muted" role="status">
          Sin alimento asignado:{" "}
          {unmatched.map((ingredient) => ingredient.raw).join(" · ")}
        </p>
      )}
      {rows.map((row, index) => (
        <div className="recipe-ingredient" key={index}>
          <FoodPicker
            ariaLabel={`Alimento del ingrediente ${index + 1}`}
            selected={
              row.food_id ? { id: row.food_id, name: row.food_name } : null
            }
            onSelect={(food) =>
              updateRow(index, { food_id: food.id, food_name: food.name })
            }
          />
          <input
            aria-label={`Cantidad del ingrediente ${index + 1}`}
            type="number"
            min={0.01}
            step="0.01"
            value={row.quantity}
            onChange={(event) =>
              updateRow(index, { quantity: Number(event.target.value) || 0 })
            }
          />
          <input
            aria-label={`Nota del ingrediente ${index + 1}`}
            placeholder="nota"
            value={row.note}
            onChange={(event) => updateRow(index, { note: event.target.value })}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Quitar ingrediente ${index + 1}`}
            onClick={() =>
              setRows((current) =>
                current.filter((_, position) => position !== index),
              )
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() =>
          setRows((current) => [
            ...current,
            { food_id: "", food_name: "", quantity: 100, note: "" },
          ])
        }
      >
        <Plus size={14} />
        Añadir ingrediente
      </button>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={favorite}
          onChange={(event) => setFavorite(event.target.checked)}
        />
        Marcar como favorita
      </label>

      <footer className="form-footer">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" disabled={pending}>
          {pending ? "Guardando…" : recipe ? "Guardar cambios" : "Crear receta"}
        </button>
      </footer>
    </form>
  );
}
