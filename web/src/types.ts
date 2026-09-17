/** The provisioned account. Password data never leaves the API. */
export interface User {
  id: string;
  username: string;
}
/** Perfil nutricional único y objetivos diarios. */
export interface NutritionProfile {
  weight_kg: number;
  height_cm: number;
  age: number;
  sex: "male" | "female" | "other";
  activity_level: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal: "lose" | "maintain" | "gain";
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  target_fiber_g: number;
  target_water_ml: number;
  target_mode: "auto" | "manual";
  updated_at: string;
}
/** Alimento del catálogo local, con base de porción y nutrientes. */
export interface Food {
  id: string;
  name: string;
  brand: string;
  barcode: string | null;
  source: "manual" | "openfoodfacts";
  base_quantity: number;
  base_unit: "g" | "ml" | "unit";
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  saturated_fat_g: number;
  salt_g: number;
  sodium_mg: number;
  micronutrients: Record<string, number>;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}
export type FoodInput = Omit<
  Food,
  "id" | "source" | "created_at" | "updated_at"
>;
/** Producto normalizado de Open Food Facts, listo para importar. */
export type OpenFoodFactsProduct = Omit<FoodInput, "barcode" | "favorite"> & {
  barcode: string;
};
/** Entrada del diario con la nutrición congelada al registrarla. */
export interface DiaryEntry {
  id: string;
  entry_date: string;
  meal: "breakfast" | "lunch" | "dinner" | "snack";
  food_id: string | null;
  plan_item_id: string | null;
  label: string;
  quantity: number;
  unit: "g" | "ml" | "unit";
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  saturated_fat_g: number;
  salt_g: number;
  sodium_mg: number;
  micronutrients: Record<string, number>;
  created_at: string;
}
export interface DiaryTotals {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  saturated_fat_g: number;
  salt_g: number;
  sodium_mg: number;
  micronutrients: Record<string, number>;
}
export interface DiaryTargets {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
}
export interface DiaryDay {
  entry_date: string;
  water_ml: number;
  entries: DiaryEntry[];
  totals: DiaryTotals;
  targets: DiaryTargets;
}
/** Ingrediente de una receta con su nutrición escalada. */
export interface RecipeIngredient {
  id: string;
  food_id: string;
  food_name: string;
  quantity: number;
  unit: "g" | "ml" | "unit";
  note: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  saturated_fat_g: number;
  salt_g: number;
  sodium_mg: number;
  micronutrients: Record<string, number>;
}
export interface Recipe {
  id: string;
  name: string;
  description: string;
  prep_minutes: number;
  servings: number;
  tags: string[];
  favorite: boolean;
  ingredients: RecipeIngredient[];
  totals: DiaryTotals;
  per_serving: DiaryTotals;
  created_at: string;
  updated_at: string;
}
export interface RecipeIngredientInput {
  food_id: string;
  quantity: number;
  unit?: string;
  note?: string;
}
export interface RecipeInput {
  name: string;
  description: string;
  prep_minutes: number;
  servings: number;
  tags: string[];
  favorite: boolean;
  ingredients: RecipeIngredientInput[];
}
/** Ingrediente leído de una web, con su alimento de catálogo si se encontró. */
export interface DraftIngredient {
  raw: string;
  name: string;
  quantity: number;
  unit: string;
  food_id: string;
  food_name: string;
  base_unit: string;
}
/** Receta importada desde una URL, lista para revisar en el formulario. */
export interface RecipeDraft {
  source_url: string;
  name: string;
  description: string;
  prep_minutes: number;
  servings: number;
  tags: string[];
  ingredients: DraftIngredient[];
}
/** Comida planificada dentro de una semana o plantilla. */
export interface PlanItem {
  id: string;
  day_index: number;
  meal: DiaryEntry["meal"];
  recipe_id: string | null;
  food_id: string | null;
  label: string;
  quantity: number;
  unit: "g" | "ml" | "unit";
  position: number;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  saturated_fat_g: number;
  salt_g: number;
  sodium_mg: number;
  micronutrients: Record<string, number>;
}
export interface MealPlan {
  id: string;
  name: string;
  week_start: string | null;
  is_template: boolean;
  items: PlanItem[];
  created_at: string;
  updated_at: string;
}
export interface PlanItemInput {
  day_index: number;
  meal: DiaryEntry["meal"];
  recipe_id?: string | null;
  food_id?: string | null;
  quantity: number;
}
/** Línea de la lista de la compra. */
export interface ShoppingInput {
  label: string;
  quantity: number;
  unit: "g" | "ml" | "unit";
  checked: boolean;
  food_id: string | null;
}
export interface ShoppingItem extends ShoppingInput {
  id: string;
  source: "manual" | "plan" | "recipe";
  created_at: string;
  updated_at: string;
}
/** Medida corporal de un día; los campos ausentes llegan como null. */
export interface BodyMeasurementInput {
  measured_on: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  neck_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  notes: string;
}
export interface BodyMeasurement extends BodyMeasurementInput {
  id: string;
  created_at: string;
  updated_at: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  parent_project_id: string | null;
  favorite: boolean;
  archived: boolean;
  default_view: "list" | "board";
  position: number;
}
export interface Section {
  id: string;
  project_id: string;
  name: string;
  position: number;
}
export interface Label {
  id: string;
  name: string;
  color: string;
  favorite: boolean;
}
/** Local wall-clock scheduling fields interpreted in the account timezone. */
export interface TaskInput {
  title: string;
  description: string;
  project_id: string | null;
  section_id: string | null;
  parent_task_id: string | null;
  priority: number;
  due_date: string | null;
  due_time: string | null;
  label_ids: string[];
  note_ids?: string[];
}
export interface Task extends TaskInput {
  id: string;
  position: number;
  status: "pending" | "completed";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
export interface Completion {
  id: string;
  task_id: string;
  scheduled_for: string | null;
  completed_at: string;
}
export interface Settings {
  timezone: string;
  language: "es";
  week_start: number;
  hour_format: "12" | "24";
  date_format: "DD/MM/YYYY" | "YYYY-MM-DD";
  theme: "light" | "dark" | "system";
  accent_color: import("./appearance").AccentColor;
  default_sort: string;
  browser_notifications: boolean;
  notes_confirm_discard: boolean;
  nutrition_base_unit: "g" | "ml" | "unit";
}
