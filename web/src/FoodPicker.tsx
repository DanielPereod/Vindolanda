import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { api } from "./api";
import type { Food } from "./types";
import { useDebounced } from "./useDebounced";

/** Selector de alimento con búsqueda en servidor, sin tope de catálogo. */
export function FoodPicker({
  selected,
  onSelect,
  ariaLabel,
  placeholder = "Buscar alimento…",
}: {
  selected: { id: string; name: string } | null;
  onSelect: (food: Food) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const foods = useQuery({
    queryKey: ["food-picker", debounced],
    queryFn: () =>
      api<Food[]>(`/nutrition/foods?q=${encodeURIComponent(debounced)}`),
    enabled: open,
  });

  function close() {
    setOpen(false);
    setSearch("");
  }

  function choose(food: Food) {
    onSelect(food);
    close();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="food-picker-trigger"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {selected ? selected.name : placeholder}
      </button>
    );
  }

  return (
    <div className="food-picker">
      <div className="food-picker-search">
        <Search size={14} aria-hidden="true" />
        <input
          autoFocus
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar búsqueda"
          onClick={close}
        >
          <X size={14} />
        </button>
      </div>
      <div className="food-picker-results">
        {foods.isPending ? (
          <p className="muted">Buscando…</p>
        ) : (foods.data ?? []).length === 0 ? (
          <p className="muted">Sin resultados.</p>
        ) : (
          (foods.data ?? []).map((food) => (
            <button
              key={food.id}
              type="button"
              className="food-picker-option"
              onClick={() => choose(food)}
            >
              <span>
                {food.name}
                {food.brand && <small> · {food.brand}</small>}
              </span>
              <span className="muted">{food.calories_kcal} kcal</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
