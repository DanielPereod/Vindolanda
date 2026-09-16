import { useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Food, FoodInput } from "./types";
import { Dropdown } from "./Dropdown";
import { loadNutritionPreferences } from "./preferences";

type NumericNutrient =
  | "calories_kcal"
  | "protein_g"
  | "carbs_g"
  | "fat_g"
  | "fiber_g"
  | "sugar_g"
  | "saturated_fat_g"
  | "salt_g"
  | "sodium_mg";

type FoodDraft = Omit<FoodInput, "barcode" | "micronutrients"> & {
  barcode: string;
};

interface MicroRow {
  key: string;
  value: string;
}

const NUTRIENT_FIELDS: {
  key: NumericNutrient;
  label: string;
  step?: string;
}[] = [
  { key: "calories_kcal", label: "Calorías (kcal)" },
  { key: "protein_g", label: "Proteína (g)", step: "0.1" },
  { key: "carbs_g", label: "Carbohidratos (g)", step: "0.1" },
  { key: "fat_g", label: "Grasa (g)", step: "0.1" },
  { key: "fiber_g", label: "Fibra (g)", step: "0.1" },
  { key: "sugar_g", label: "Azúcar (g)", step: "0.1" },
  { key: "saturated_fat_g", label: "Saturadas (g)", step: "0.1" },
  { key: "salt_g", label: "Sal (g)", step: "0.01" },
  { key: "sodium_mg", label: "Sodio (mg)", step: "0.1" },
];

function draftFrom(food: Food | null): FoodDraft {
  return {
    name: food?.name ?? "",
    brand: food?.brand ?? "",
    barcode: food?.barcode ?? "",
    base_quantity: food?.base_quantity ?? 100,
    base_unit: food?.base_unit ?? loadNutritionPreferences().defaultBaseUnit,
    calories_kcal: food?.calories_kcal ?? 0,
    protein_g: food?.protein_g ?? 0,
    carbs_g: food?.carbs_g ?? 0,
    fat_g: food?.fat_g ?? 0,
    fiber_g: food?.fiber_g ?? 0,
    sugar_g: food?.sugar_g ?? 0,
    saturated_fat_g: food?.saturated_fat_g ?? 0,
    salt_g: food?.salt_g ?? 0,
    sodium_mg: food?.sodium_mg ?? 0,
    favorite: food?.favorite ?? false,
  };
}

function microRowsFrom(food: Food | null): MicroRow[] {
  return Object.entries(food?.micronutrients ?? {}).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

function numeric(event: { target: { value: string } }): number {
  const parsed = Number(event.target.value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Alta y edición de un alimento del catálogo. */
export function FoodForm({
  food,
  pending,
  onCancel,
  onSubmit,
}: {
  food: Food | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (value: FoodInput) => void;
}) {
  const [draft, setDraft] = useState<FoodDraft>(() => draftFrom(food));
  const [microRows, setMicroRows] = useState<MicroRow[]>(() =>
    microRowsFrom(food),
  );

  function update<Key extends keyof FoodDraft>(
    key: Key,
    value: FoodDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateMicro(index: number, patch: Partial<MicroRow>) {
    setMicroRows((rows) =>
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const micronutrients: Record<string, number> = {};
    for (const row of microRows) {
      const key = row.key.trim();
      if (!key) continue;
      const amount = Number(row.value);
      micronutrients[key] = Number.isFinite(amount) ? amount : 0;
    }
    onSubmit({
      ...draft,
      barcode: draft.barcode.trim() === "" ? null : draft.barcode.trim(),
      micronutrients,
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
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </label>
        <label>
          Marca
          <input
            maxLength={200}
            value={draft.brand}
            onChange={(event) => update("brand", event.target.value)}
          />
        </label>
        <label>
          Código de barras
          <input
            inputMode="numeric"
            value={draft.barcode}
            onChange={(event) => update("barcode", event.target.value)}
          />
        </label>
        <label>
          Porción base
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={draft.base_quantity}
            onChange={(event) => update("base_quantity", numeric(event))}
          />
        </label>
        <label>
          Unidad
          <Dropdown
            ariaLabel="Unidad de la porción"
            value={draft.base_unit}
            searchable={false}
            options={[
              { value: "g", label: "Gramos" },
              { value: "ml", label: "Mililitros" },
              { value: "unit", label: "Unidades" },
            ]}
            onChange={(next) =>
              update("base_unit", next as FoodInput["base_unit"])
            }
          />
        </label>
      </div>

      <h2>Nutrientes por porción base</h2>
      <div className="form-grid">
        {NUTRIENT_FIELDS.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              type="number"
              min={0}
              step={field.step ?? "0.1"}
              value={draft[field.key]}
              onChange={(event) => update(field.key, numeric(event))}
            />
          </label>
        ))}
      </div>

      <h2>Micronutrientes</h2>
      <p className="muted">
        Añade los que te importen, por ejemplo «calcium_mg».
      </p>
      {microRows.map((row, index) => (
        <div className="micro-row" key={index}>
          <input
            aria-label={`Nombre del micronutriente ${index + 1}`}
            placeholder="nombre"
            value={row.key}
            onChange={(event) =>
              updateMicro(index, { key: event.target.value })
            }
          />
          <input
            aria-label={`Valor del micronutriente ${index + 1}`}
            type="number"
            min={0}
            step="0.1"
            placeholder="0"
            value={row.value}
            onChange={(event) =>
              updateMicro(index, { value: event.target.value })
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Quitar micronutriente ${index + 1}`}
            onClick={() =>
              setMicroRows((rows) =>
                rows.filter((_, position) => position !== index),
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
          setMicroRows((rows) => [...rows, { key: "", value: "" }])
        }
      >
        <Plus size={14} />
        Añadir micronutriente
      </button>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={draft.favorite}
          onChange={(event) => update("favorite", event.target.checked)}
        />
        Marcar como favorito
      </label>

      <footer className="form-footer">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" disabled={pending}>
          {pending ? "Guardando…" : food ? "Guardar cambios" : "Crear alimento"}
        </button>
      </footer>
    </form>
  );
}
