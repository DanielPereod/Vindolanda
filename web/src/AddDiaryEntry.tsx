import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import type { DiaryEntry, Food } from "./types";
import { useDebounced } from "./useDebounced";

const UNIT_LABELS: Record<Food["base_unit"], string> = {
  g: "g",
  ml: "ml",
  unit: "ud",
};

/** Busca un alimento y lo registra en el diario con una cantidad. */
export function AddDiaryEntry({
  date,
  meal,
  label,
  onClose,
  onSaved,
}: {
  date: string;
  meal: DiaryEntry["meal"];
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [selected, setSelected] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const foods = useResource<Food[]>(
    `/nutrition/foods?q=${encodeURIComponent(debounced)}`,
  );

  function choose(food: Food) {
    setSelected(food);
    setQuantity(food.base_quantity);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      await api("/nutrition/diary", "POST", {
        entry_date: date,
        meal,
        food_id: selected.id,
        quantity,
        unit: selected.base_unit,
      });
      onSaved();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  const preview =
    selected && selected.base_quantity > 0
      ? Math.round(
          ((selected.calories_kcal * quantity) / selected.base_quantity) * 10,
        ) / 10
      : 0;

  return (
    <form className="editor" onSubmit={submit}>
      <p className="muted">
        Añadir a {label} · {date}
      </p>
      {selected ? (
        <>
          <button
            type="button"
            className="text-button"
            onClick={() => setSelected(null)}
          >
            <ArrowLeft size={14} />
            Cambiar alimento
          </button>
          <h2>{selected.name}</h2>
          <p className="muted">
            Base: {selected.base_quantity} {UNIT_LABELS[selected.base_unit]} ·{" "}
            {selected.calories_kcal} kcal
          </p>
          <label>
            Cantidad ({UNIT_LABELS[selected.base_unit]})
            <input
              autoFocus
              type="number"
              min={0.01}
              step="0.01"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value) || 0)}
            />
          </label>
          <p className="muted">≈ {preview} kcal</p>
        </>
      ) : (
        <>
          <label>
            Buscar alimento
            <input
              autoFocus
              placeholder="Nombre, marca o código…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {foods.isPending ? (
            <p className="muted">Buscando…</p>
          ) : (foods.data ?? []).length === 0 ? (
            <p className="muted">
              Sin resultados. Crea el alimento en el catálogo.
            </p>
          ) : (
            <div className="diary-food-results">
              {(foods.data ?? []).map((food) => (
                <button
                  key={food.id}
                  type="button"
                  className="diary-food-option"
                  onClick={() => choose(food)}
                >
                  <span>
                    <strong>{food.name}</strong>
                    {food.brand && <small> · {food.brand}</small>}
                  </span>
                  <span className="muted">
                    {food.base_quantity} {UNIT_LABELS[food.base_unit]} ·{" "}
                    {food.calories_kcal} kcal
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer className="form-footer">
        <button type="button" className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={pending || !selected}>
          {pending ? "Añadiendo…" : "Añadir al diario"}
        </button>
      </footer>
    </form>
  );
}
