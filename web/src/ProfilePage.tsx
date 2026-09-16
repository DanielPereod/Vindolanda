import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, useResource } from "./api";
import type { NutritionProfile } from "./types";
import { previewTargets } from "./nutrition";
import { Dropdown } from "./Dropdown";

type ProfileDraft = Omit<NutritionProfile, "updated_at">;

const SEX_OPTIONS = [
  { value: "male", label: "Hombre" },
  { value: "female", label: "Mujer" },
  { value: "other", label: "Otro" },
];

const ACTIVITY_OPTIONS: {
  value: NutritionProfile["activity_level"];
  label: string;
  hint: string;
}[] = [
  { value: "sedentary", label: "Sedentaria", hint: "Poco o nada de ejercicio" },
  { value: "light", label: "Ligera", hint: "1–3 días por semana" },
  { value: "moderate", label: "Moderada", hint: "3–5 días por semana" },
  { value: "active", label: "Activa", hint: "6–7 días por semana" },
  {
    value: "very_active",
    label: "Muy activa",
    hint: "Trabajo físico o 2 sesiones",
  },
];

const GOAL_OPTIONS: {
  value: NutritionProfile["goal"];
  label: string;
  hint: string;
}[] = [
  { value: "lose", label: "Perder grasa", hint: "Déficit del 15%" },
  { value: "maintain", label: "Mantener", hint: "Calorías de mantenimiento" },
  { value: "gain", label: "Ganar músculo", hint: "Superávit del 10%" },
];

function toDraft(profile: NutritionProfile): ProfileDraft {
  return {
    weight_kg: profile.weight_kg,
    height_cm: profile.height_cm,
    age: profile.age,
    sex: profile.sex,
    activity_level: profile.activity_level,
    goal: profile.goal,
    target_calories: profile.target_calories,
    target_protein_g: profile.target_protein_g,
    target_carbs_g: profile.target_carbs_g,
    target_fat_g: profile.target_fat_g,
    target_fiber_g: profile.target_fiber_g,
    target_water_ml: profile.target_water_ml,
    target_mode: profile.target_mode,
  };
}

function numeric(event: { target: { value: string } }): number {
  const parsed = Number(event.target.value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Perfil nutricional y objetivos diarios. */
export function ProfilePage() {
  const profile = useResource<NutritionProfile>("/nutrition/profile");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const client = useQueryClient();

  useEffect(() => {
    if (profile.data) setDraft(toDraft(profile.data));
  }, [profile.data]);

  const preview = draft ? previewTargets(draft) : null;

  function update<Key extends keyof ProfileDraft>(
    key: Key,
    value: ProfileDraft[Key],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await api("/nutrition/profile", "PUT", draft);
      await client.invalidateQueries({ queryKey: ["/nutrition/profile"] });
      setMessage("Perfil y objetivos guardados");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="eyebrow">TU OBJETIVO DIARIO</div>
      <div className="page-heading">
        <h1>Perfil y objetivos</h1>
      </div>
      <p className="page-subtitle">
        Ajusta tus datos y deja que calculemos tus objetivos, o fíjalos tú
        mismo. Todo lo demás se construye sobre esto.
      </p>
      {profile.isPending ? (
        <p className="muted loading">Cargando tu perfil…</p>
      ) : profile.isError ? (
        <p role="alert" className="error">
          No se pudo cargar tu perfil nutricional.{" "}
          <button onClick={() => void profile.refetch()}>Reintentar</button>
        </p>
      ) : draft ? (
        <form className="settings-card editor" onSubmit={save}>
          <h2>Tus datos</h2>
          <div className="form-grid">
            <label>
              Peso (kg)
              <input
                type="number"
                min={0}
                max={1000}
                step="0.1"
                value={draft.weight_kg}
                onChange={(event) => update("weight_kg", numeric(event))}
              />
            </label>
            <label>
              Altura (cm)
              <input
                type="number"
                min={0}
                max={300}
                step="0.1"
                value={draft.height_cm}
                onChange={(event) => update("height_cm", numeric(event))}
              />
            </label>
            <label>
              Edad
              <input
                type="number"
                min={0}
                max={130}
                value={draft.age}
                onChange={(event) => update("age", numeric(event))}
              />
            </label>
            <label>
              Sexo
              <Dropdown
                ariaLabel="Sexo"
                value={draft.sex}
                searchable={false}
                options={SEX_OPTIONS}
                onChange={(next) =>
                  update("sex", next as NutritionProfile["sex"])
                }
              />
            </label>
            <label>
              Actividad
              <Dropdown
                ariaLabel="Nivel de actividad"
                value={draft.activity_level}
                searchable={false}
                options={ACTIVITY_OPTIONS}
                onChange={(next) =>
                  update(
                    "activity_level",
                    next as NutritionProfile["activity_level"],
                  )
                }
              />
            </label>
            <label>
              Objetivo
              <Dropdown
                ariaLabel="Objetivo"
                value={draft.goal}
                searchable={false}
                options={GOAL_OPTIONS}
                onChange={(next) =>
                  update("goal", next as NutritionProfile["goal"])
                }
              />
            </label>
          </div>

          <h2>Objetivos diarios</h2>
          <div
            className="view-toggle"
            role="group"
            aria-label="Modo de objetivos"
          >
            <button
              type="button"
              className={draft.target_mode === "auto" ? "active" : ""}
              aria-pressed={draft.target_mode === "auto"}
              onClick={() => update("target_mode", "auto")}
            >
              Calculado
            </button>
            <button
              type="button"
              className={draft.target_mode === "manual" ? "active" : ""}
              aria-pressed={draft.target_mode === "manual"}
              onClick={() => update("target_mode", "manual")}
            >
              Manual
            </button>
          </div>

          {draft.target_mode === "auto" ? (
            <div className="macro-summary" aria-live="polite">
              {preview ? (
                <>
                  <p className="muted">
                    Calculado con Mifflin-St Jeor y tu nivel de actividad.
                  </p>
                  <div className="entity-grid">
                    <article className="entity-card">
                      <strong>{preview.calories} kcal / día</strong>
                      <p className="muted">
                        {preview.protein_g} g proteína · {preview.carbs_g} g
                        carbohidratos · {preview.fat_g} g grasa
                      </p>
                      <p className="muted">
                        {preview.fiber_g} g fibra · {preview.water_ml} ml agua
                      </p>
                    </article>
                  </div>
                </>
              ) : (
                <p className="muted">
                  Completa peso, altura y edad para calcular tus objetivos.
                </p>
              )}
            </div>
          ) : (
            <div className="form-grid">
              <label>
                Calorías (kcal)
                <input
                  type="number"
                  min={0}
                  value={draft.target_calories}
                  onChange={(event) =>
                    update("target_calories", numeric(event))
                  }
                />
              </label>
              <label>
                Proteína (g)
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={draft.target_protein_g}
                  onChange={(event) =>
                    update("target_protein_g", numeric(event))
                  }
                />
              </label>
              <label>
                Carbohidratos (g)
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={draft.target_carbs_g}
                  onChange={(event) => update("target_carbs_g", numeric(event))}
                />
              </label>
              <label>
                Grasa (g)
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={draft.target_fat_g}
                  onChange={(event) => update("target_fat_g", numeric(event))}
                />
              </label>
              <label>
                Fibra (g)
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={draft.target_fiber_g}
                  onChange={(event) => update("target_fiber_g", numeric(event))}
                />
              </label>
              <label>
                Agua (ml)
                <input
                  type="number"
                  min={0}
                  value={draft.target_water_ml}
                  onChange={(event) =>
                    update("target_water_ml", numeric(event))
                  }
                />
              </label>
            </div>
          )}

          {message && <p className="muted">{message}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar objetivos"}
          </button>
        </form>
      ) : null}
    </>
  );
}
