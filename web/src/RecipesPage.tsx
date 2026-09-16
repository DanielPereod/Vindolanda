import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChefHat,
  Link2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { api, errorMessage, useResource } from "./api";
import type { DiaryEntry, Recipe, RecipeDraft, RecipeInput } from "./types";
import { localDate } from "./dates";
import { Dropdown } from "./Dropdown";
import { Modal } from "./Modal";
import { RecipeForm } from "./RecipeForm";
import { useDebounced } from "./useDebounced";

const MEALS: { value: DiaryEntry["meal"]; label: string }[] = [
  { value: "breakfast", label: "Desayuno" },
  { value: "lunch", label: "Comida" },
  { value: "dinner", label: "Cena" },
  { value: "snack", label: "Snacks" },
];

/** Recetario: lista, edición, favoritos y cocinar al diario. */
export function RecipesPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const [cookDate, setCookDate] = useState("");
  const [cookMeal, setCookMeal] = useState<DiaryEntry["meal"]>("lunch");
  const [cookServings, setCookServings] = useState(1);
  const [confirmation, setConfirmation] = useState<Recipe | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const client = useQueryClient();

  const recipes = useResource<Recipe[]>(
    `/nutrition/recipes?q=${encodeURIComponent(debounced)}`,
  );
  const values = recipes.data ?? [];

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

  function save(value: RecipeInput) {
    void run(async () => {
      if (editing)
        await api(`/nutrition/recipes/${editing.id}`, "PATCH", value);
      else await api("/nutrition/recipes", "POST", value);
      setEditing(null);
      setCreating(false);
      setDraft(null);
    });
  }

  /** Lee una URL y abre el formulario con lo que se haya podido extraer. */
  function importRecipe() {
    void run(async () => {
      const value = await api<RecipeDraft>(
        "/nutrition/recipes/import",
        "POST",
        { url: importUrl.trim() },
      );
      setImportOpen(false);
      setImportUrl("");
      setEditing(null);
      setDraft(value);
      setCreating(true);
      setMessage(
        `Receta importada: «${value.name}». Revisa los ingredientes antes de guardar.`,
      );
    });
  }

  function openCook(recipe: Recipe) {
    setCooking(recipe);
    setCookDate(localDate("Europe/Madrid"));
    setCookMeal("lunch");
    setCookServings(1);
  }

  function cook() {
    if (!cooking) return;
    void run(async () => {
      await api(`/nutrition/recipes/${cooking.id}/cook`, "POST", {
        entry_date: cookDate,
        meal: cookMeal,
        servings: cookServings,
      });
      setMessage(`«${cooking.name}» añadida al diario`);
      setCooking(null);
    });
  }

  const formOpen = creating || editing !== null;

  return (
    <>
      <div className="eyebrow">TU RECETARIO</div>
      <div className="page-heading">
        <h1>Recetas</h1>
        <div className="heading-actions">
          <button
            className="secondary"
            onClick={() => {
              setDraft(null);
              setImportOpen(true);
            }}
          >
            <Link2 size={16} />
            Importar desde URL
          </button>
          <button
            className="primary add-main"
            onClick={() => {
              setDraft(null);
              setCreating(true);
            }}
          >
            <Plus size={16} />
            Nueva receta
          </button>
        </div>
      </div>
      <p className="page-subtitle">
        Guarda tus recetas con ingredientes y macros calculadas solas.
      </p>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Buscar recetas"
            placeholder="Buscar receta…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="muted">{message}</p>}
      {recipes.isPending ? (
        <p className="muted loading">Cargando recetas…</p>
      ) : recipes.isError ? (
        <p role="alert" className="error">
          No se pudieron cargar las recetas.{" "}
          <button onClick={() => void recipes.refetch()}>Reintentar</button>
        </p>
      ) : values.length === 0 ? (
        <div className="empty-state">
          <h3>{search ? "Sin resultados" : "Aún no tienes recetas"}</h3>
          <p>
            {search
              ? "Prueba con otro nombre."
              : "Crea tu primera receta y cocínala al diario en un clic."}
          </p>
        </div>
      ) : (
        <div className="entity-grid">
          {values.map((recipe) => (
            <article className="entity-card" key={recipe.id}>
              <h2>{recipe.name}</h2>
              <p className="muted">
                {recipe.servings} raciones · {recipe.prep_minutes} min
              </p>
              <strong>{recipe.per_serving.calories_kcal} kcal / ración</strong>
              <p className="muted">
                {recipe.per_serving.protein_g} P · {recipe.per_serving.carbs_g}{" "}
                C · {recipe.per_serving.fat_g} G
              </p>
              {recipe.tags.length > 0 && (
                <p className="muted">{recipe.tags.join(" · ")}</p>
              )}
              <div>
                <button
                  className="icon-button"
                  aria-label={
                    recipe.favorite
                      ? `Quitar ${recipe.name} de favoritas`
                      : `Marcar ${recipe.name} como favorita`
                  }
                  aria-pressed={recipe.favorite}
                  onClick={() =>
                    void run(async () => {
                      await api(`/nutrition/recipes/${recipe.id}`, "PATCH", {
                        favorite: !recipe.favorite,
                      });
                    })
                  }
                >
                  <Star
                    size={16}
                    fill={recipe.favorite ? "currentColor" : "none"}
                  />
                </button>
                <button
                  className="text-button"
                  onClick={() => openCook(recipe)}
                >
                  <ChefHat size={15} />
                  Cocinar
                </button>
                <button
                  className="icon-button"
                  aria-label={`Editar ${recipe.name}`}
                  onClick={() => setEditing(recipe)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Eliminar ${recipe.name}`}
                  onClick={() => setConfirmation(recipe)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {importOpen && (
        <Modal
          title="Importar receta desde URL"
          onClose={() => {
            setImportOpen(false);
            setImportUrl("");
          }}
        >
          <div className="editor">
            <label>
              URL de la receta
              <input
                autoFocus
                type="url"
                required
                maxLength={2048}
                placeholder="https://…"
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
              />
            </label>
            <p className="muted">
              Leeremos los datos de la página y abriremos el formulario para que
              revises los ingredientes.
            </p>
            <footer className="form-footer">
              <button
                className="secondary"
                onClick={() => {
                  setImportOpen(false);
                  setImportUrl("");
                }}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={pending || importUrl.trim() === ""}
                onClick={importRecipe}
              >
                {pending ? "Importando…" : "Importar"}
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {formOpen && (
        <Modal
          title={
            editing
              ? "Editar receta"
              : draft
                ? "Revisar receta importada"
                : "Nueva receta"
          }
          onClose={() => {
            setEditing(null);
            setCreating(false);
            setDraft(null);
          }}
        >
          <RecipeForm
            recipe={editing}
            draft={draft}
            pending={pending}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
              setDraft(null);
            }}
            onSubmit={save}
          />
        </Modal>
      )}
      {cooking && (
        <Modal title="Cocinar receta" onClose={() => setCooking(null)}>
          <div className="editor">
            <h2>{cooking.name}</h2>
            <label>
              Fecha
              <input
                type="date"
                value={cookDate}
                onChange={(event) => setCookDate(event.target.value)}
              />
            </label>
            <label>
              Comida
              <Dropdown
                ariaLabel="Comida"
                value={cookMeal}
                searchable={false}
                options={MEALS}
                onChange={(next) => setCookMeal(next as DiaryEntry["meal"])}
              />
            </label>
            <label>
              Raciones
              <input
                type="number"
                min={0.25}
                step="0.25"
                value={cookServings}
                onChange={(event) =>
                  setCookServings(Number(event.target.value) || 1)
                }
              />
            </label>
            <footer className="form-footer">
              <button className="secondary" onClick={() => setCooking(null)}>
                Cancelar
              </button>
              <button className="primary" disabled={pending} onClick={cook}>
                {pending ? "Añadiendo…" : "Añadir al diario"}
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal title="Eliminar receta" onClose={() => setConfirmation(null)}>
          <div className="editor">
            <p>
              Se eliminará «{confirmation.name}». Esta acción no se puede
              deshacer.
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
                onClick={() =>
                  void run(async () => {
                    await api(
                      `/nutrition/recipes/${confirmation.id}`,
                      "DELETE",
                    );
                    setConfirmation(null);
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
