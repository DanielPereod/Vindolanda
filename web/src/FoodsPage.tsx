import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Star, Trash2, Globe } from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import type { Food, FoodInput } from "./types";
import { FoodForm } from "./FoodForm";
import { OpenFoodFactsSearch } from "./OpenFoodFactsSearch";
import { Modal } from "./Modal";
import { useDebounced } from "./useDebounced";

const UNIT_LABELS: Record<Food["base_unit"], string> = {
  g: "g",
  ml: "ml",
  unit: "ud",
};

/** Catálogo de alimentos: búsqueda, favoritos y edición. */
export function FoodsPage() {
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [editing, setEditing] = useState<Food | null>(null);
  const [creating, setCreating] = useState(false);
  const [offOpen, setOffOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Food | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const debounced = useDebounced(search);

  const params = new URLSearchParams();
  if (debounced) params.set("q", debounced);
  if (favoritesOnly) params.set("favorite", "true");
  const path = `/nutrition/foods${params.toString() ? `?${params}` : ""}`;
  const foods = useResource<Food[]>(path);
  const values = foods.data ?? [];

  async function run(operation: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await operation();
      await client.invalidateQueries();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setPending(false);
    }
  }

  function save(value: FoodInput) {
    void run(async () => {
      if (editing) await api(`/nutrition/foods/${editing.id}`, "PATCH", value);
      else await api("/nutrition/foods", "POST", value);
      setEditing(null);
      setCreating(false);
    });
  }

  function toggleFavorite(food: Food) {
    void run(() =>
      api(`/nutrition/foods/${food.id}`, "PATCH", {
        favorite: !food.favorite,
      }),
    );
  }

  const formOpen = creating || editing !== null;
  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  return (
    <>
      <div className="eyebrow">TU CATÁLOGO</div>
      <div className="page-heading">
        <h1>Alimentos</h1>
        <button className="primary add-main" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Nuevo alimento
        </button>
      </div>
      <p className="page-subtitle">
        Guarda lo que comes a menudo para registrarlo en un toque.
      </p>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Buscar alimentos"
            placeholder="Nombre, marca o código de barras…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={`text-button${favoritesOnly ? " active" : ""}`}
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly((value) => !value)}
        >
          <Star size={15} />
          Solo favoritos
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setOffOpen(true)}
        >
          <Globe size={15} />
          Open Food Facts
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {foods.isPending ? (
        <p className="muted loading">Cargando alimentos…</p>
      ) : foods.isError ? (
        <p role="alert" className="error">
          No se pudieron cargar los alimentos.{" "}
          <button onClick={() => void foods.refetch()}>Reintentar</button>
        </p>
      ) : values.length === 0 ? (
        <div className="empty-state">
          <h3>
            {search || favoritesOnly
              ? "Sin resultados"
              : "Tu catálogo está vacío"}
          </h3>
          <p>
            {search || favoritesOnly
              ? "Prueba con otro nombre o quita el filtro."
              : "Crea tu primer alimento para empezar a registrar."}
          </p>
          {!search && !favoritesOnly && (
            <button className="secondary" onClick={() => setOffOpen(true)}>
              <Globe size={15} />
              Buscar en Open Food Facts
            </button>
          )}
        </div>
      ) : (
        <div className="entity-grid">
          {values.map((food) => (
            <article className="entity-card" key={food.id}>
              <h2>
                {food.name}
                {food.brand && <small> · {food.brand}</small>}
              </h2>
              <p className="muted">
                {food.base_quantity} {UNIT_LABELS[food.base_unit]} ·{" "}
                {food.calories_kcal} kcal
              </p>
              <p className="muted">
                {food.protein_g} P · {food.carbs_g} C · {food.fat_g} G
                {food.source === "openfoodfacts" && " · Open Food Facts"}
              </p>
              <div>
                <button
                  className="icon-button"
                  aria-label={
                    food.favorite
                      ? `Quitar ${food.name} de favoritos`
                      : `Marcar ${food.name} como favorito`
                  }
                  aria-pressed={food.favorite}
                  onClick={() => toggleFavorite(food)}
                >
                  <Star
                    size={16}
                    fill={food.favorite ? "currentColor" : "none"}
                  />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Editar ${food.name}`}
                  onClick={() => setEditing(food)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Eliminar ${food.name}`}
                  onClick={() => setConfirmation(food)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {formOpen && (
        <Modal
          title={editing ? "Editar alimento" : "Nuevo alimento"}
          onClose={closeForm}
        >
          <FoodForm
            food={editing}
            pending={pending}
            onCancel={closeForm}
            onSubmit={save}
          />
        </Modal>
      )}
      {offOpen && (
        <Modal
          title="Añadir desde Open Food Facts"
          onClose={() => setOffOpen(false)}
        >
          <OpenFoodFactsSearch
            onImported={() => void client.invalidateQueries()}
          />
        </Modal>
      )}
      {confirmation && (
        <Modal title="Eliminar alimento" onClose={() => setConfirmation(null)}>
          <div className="editor">
            <p>
              Se eliminará «{confirmation.name}» del catálogo. Esta acción no se
              puede deshacer.
            </p>
            <footer className="form-footer">
              <button
                className="secondary"
                onClick={() => setConfirmation(null)}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={pending}
                onClick={() => {
                  void run(async () => {
                    await api(`/nutrition/foods/${confirmation.id}`, "DELETE");
                    setConfirmation(null);
                  });
                }}
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
