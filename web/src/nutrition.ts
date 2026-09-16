import type { NutritionProfile } from "./types";

/** Datos mínimos necesarios para calcular objetivos. */
export type TargetBasis = Pick<
  NutritionProfile,
  "weight_kg" | "height_cm" | "age" | "sex" | "activity_level" | "goal"
>;

/** Objetivos diarios derivados del perfil. */
export interface TargetPreview {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
}

const ACTIVITY_FACTORS: Record<NutritionProfile["activity_level"], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const MACRO_SPLITS: Record<NutritionProfile["goal"], [number, number, number]> =
  {
    lose: [0.35, 0.35, 0.3],
    maintain: [0.3, 0.4, 0.3],
    gain: [0.3, 0.45, 0.25],
  };

/** Tasa metabólica basal (Mifflin-St Jeor) en kilocalorías. */
export function basalMetabolicRate(
  profile: Pick<NutritionProfile, "weight_kg" | "height_cm" | "age" | "sex">,
): number {
  const base =
    10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age;
  if (profile.sex === "male") return base + 5;
  if (profile.sex === "female") return base - 161;
  return base - 78;
}

/** Deriva los objetivos diarios, o null si faltan datos. Espeja la API. */
export function previewTargets(profile: TargetBasis): TargetPreview | null {
  if (profile.weight_kg <= 0 || profile.height_cm <= 0 || profile.age <= 0)
    return null;
  const basal = basalMetabolicRate(profile);
  if (basal <= 0) return null;
  let maintenance = basal * ACTIVITY_FACTORS[profile.activity_level];
  if (profile.goal === "lose") maintenance *= 0.85;
  if (profile.goal === "gain") maintenance *= 1.1;
  const calories = Math.round(maintenance);
  const [protein, carbs, fat] = MACRO_SPLITS[profile.goal];
  return {
    calories,
    protein_g: Math.round((calories * protein) / 4),
    carbs_g: Math.round((calories * carbs) / 4),
    fat_g: Math.round((calories * fat) / 9),
    fiber_g: Math.round((calories * 14) / 1000),
    water_ml: Math.round(profile.weight_kg * 35),
  };
}
