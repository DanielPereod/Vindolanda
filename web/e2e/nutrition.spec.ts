import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type {
  BodyMeasurement,
  BodyMeasurementInput,
  DiaryDay,
  DiaryEntry,
  DiaryTotals,
  Food,
  FoodInput,
  MealPlan,
  NutritionProfile,
  OpenFoodFactsProduct,
  PlanItem,
  Recipe,
  RecipeInput,
  ShoppingItem,
} from "../src/types";

interface State {
  profile: NutritionProfile;
  foods: Food[];
  recipes: Recipe[];
  plan: MealPlan | null;
  templates: MealPlan[];
  diary: DiaryEntry[];
  water: number;
  shopping: ShoppingItem[];
  measurements: BodyMeasurement[];
  product: OpenFoodFactsProduct | null;
}

const now = () => new Date().toISOString();

function zeroTotals(): DiaryTotals {
  return {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    saturated_fat_g: 0,
    salt_g: 0,
    sodium_mg: 0,
    micronutrients: {},
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function scaleTotals(base: DiaryTotals, factor: number): DiaryTotals {
  const micronutrients: Record<string, number> = {};
  for (const [key, value] of Object.entries(base.micronutrients)) {
    micronutrients[key] = round2(value * factor);
  }
  return {
    calories_kcal: round2(base.calories_kcal * factor),
    protein_g: round2(base.protein_g * factor),
    carbs_g: round2(base.carbs_g * factor),
    fat_g: round2(base.fat_g * factor),
    fiber_g: round2(base.fiber_g * factor),
    sugar_g: round2(base.sugar_g * factor),
    saturated_fat_g: round2(base.saturated_fat_g * factor),
    salt_g: round2(base.salt_g * factor),
    sodium_mg: round2(base.sodium_mg * factor),
    micronutrients,
  };
}

function addTotals(target: DiaryTotals, source: DiaryTotals): void {
  target.calories_kcal = round2(target.calories_kcal + source.calories_kcal);
  target.protein_g = round2(target.protein_g + source.protein_g);
  target.carbs_g = round2(target.carbs_g + source.carbs_g);
  target.fat_g = round2(target.fat_g + source.fat_g);
  target.fiber_g = round2(target.fiber_g + source.fiber_g);
  target.sugar_g = round2(target.sugar_g + source.sugar_g);
  target.saturated_fat_g = round2(
    target.saturated_fat_g + source.saturated_fat_g,
  );
  target.salt_g = round2(target.salt_g + source.salt_g);
  target.sodium_mg = round2(target.sodium_mg + source.sodium_mg);
  for (const [key, value] of Object.entries(source.micronutrients)) {
    target.micronutrients[key] = round2(
      (target.micronutrients[key] ?? 0) + value,
    );
  }
}

function foodTotals(food: Food, quantity: number): DiaryTotals {
  const factor = food.base_quantity > 0 ? quantity / food.base_quantity : 0;
  return scaleTotals(
    {
      calories_kcal: food.calories_kcal,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      fiber_g: food.fiber_g,
      sugar_g: food.sugar_g,
      saturated_fat_g: food.saturated_fat_g,
      salt_g: food.salt_g,
      sodium_mg: food.sodium_mg,
      micronutrients: food.micronutrients,
    },
    factor,
  );
}

function makeFood(input: Partial<FoodInput> & { name: string }): Food {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    brand: input.brand ?? "",
    barcode: input.barcode ?? null,
    source: "manual",
    base_quantity: input.base_quantity ?? 100,
    base_unit: input.base_unit ?? "g",
    calories_kcal: input.calories_kcal ?? 0,
    protein_g: input.protein_g ?? 0,
    carbs_g: input.carbs_g ?? 0,
    fat_g: input.fat_g ?? 0,
    fiber_g: input.fiber_g ?? 0,
    sugar_g: input.sugar_g ?? 0,
    saturated_fat_g: input.saturated_fat_g ?? 0,
    salt_g: input.salt_g ?? 0,
    sodium_mg: input.sodium_mg ?? 0,
    micronutrients: input.micronutrients ?? {},
    favorite: input.favorite ?? false,
    created_at: now(),
    updated_at: now(),
  };
}

function buildRecipe(input: RecipeInput, foods: Food[]): Recipe {
  const ingredients: Recipe["ingredients"] = [];
  const totals = zeroTotals();
  for (const ingredient of input.ingredients) {
    const food = foods.find((candidate) => candidate.id === ingredient.food_id);
    if (!food) continue;
    const scaled = foodTotals(food, ingredient.quantity);
    ingredients.push({
      id: crypto.randomUUID(),
      food_id: food.id,
      food_name: food.name,
      quantity: ingredient.quantity,
      unit: food.base_unit,
      note: ingredient.note ?? "",
      ...scaled,
    });
    addTotals(totals, scaled);
  }
  const divisor = input.servings > 0 ? input.servings : 1;
  return {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
    prep_minutes: input.prep_minutes,
    servings: input.servings,
    tags: input.tags,
    favorite: input.favorite,
    ingredients,
    totals,
    per_serving: scaleTotals(totals, 1 / divisor),
    created_at: now(),
    updated_at: now(),
  };
}

function mondayISO(): string {
  const date = new Date();
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function makePlanWithItem(recipe: Recipe, dayIndex: number): MealPlan {
  const item: PlanItem = {
    id: crypto.randomUUID(),
    day_index: dayIndex,
    meal: "lunch",
    recipe_id: recipe.id,
    food_id: null,
    label: recipe.name,
    quantity: 1,
    unit: "unit",
    position: 1024,
    ...recipe.per_serving,
  };
  return {
    id: crypto.randomUUID(),
    name: "Semana tipo",
    week_start: mondayISO(),
    is_template: false,
    items: [item],
    created_at: now(),
    updated_at: now(),
  };
}

function defaultState(): State {
  return {
    profile: {
      weight_kg: 0,
      height_cm: 0,
      age: 0,
      sex: "other",
      activity_level: "moderate",
      goal: "maintain",
      target_calories: 0,
      target_protein_g: 0,
      target_carbs_g: 0,
      target_fat_g: 0,
      target_fiber_g: 0,
      target_water_ml: 0,
      target_mode: "auto",
      updated_at: now(),
    },
    foods: [],
    recipes: [],
    plan: null,
    templates: [],
    diary: [],
    water: 0,
    shopping: [],
    measurements: [],
    product: null,
  };
}

function makeMeasurement(
  measuredOn: string,
  weightKg: number,
): BodyMeasurement {
  return {
    id: crypto.randomUUID(),
    measured_on: measuredOn,
    weight_kg: weightKg,
    body_fat_pct: null,
    waist_cm: null,
    hip_cm: null,
    chest_cm: null,
    neck_cm: null,
    arm_cm: null,
    thigh_cm: null,
    notes: "",
    created_at: now(),
    updated_at: now(),
  };
}

async function installApi(page: Page, state: State): Promise<void> {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = request.method();
    const body = <T>() => request.postDataJSON() as T;

    if (path === "/auth/me") {
      await route.fulfill({ json: { id: "owner", username: "owner" } });
      return;
    }
    if (path === "/settings") {
      await route.fulfill({
        json: {
          timezone: "Europe/Madrid",
          date_format: "DD/MM/YYYY",
          theme: "light",
          accent_color: "#2563eb",
          default_sort: "manual",
        },
      });
      return;
    }
    if (path === "/nutrition/profile") {
      if (method === "PUT") Object.assign(state.profile, body());
      await route.fulfill({ json: state.profile });
      return;
    }
    if (path === "/nutrition/foods") {
      if (method === "POST") {
        const food = makeFood(body<Partial<FoodInput> & { name: string }>());
        state.foods.push(food);
        await route.fulfill({ status: 201, json: food });
        return;
      }
      const query = (url.searchParams.get("q") ?? "").toLocaleLowerCase();
      await route.fulfill({
        json: state.foods.filter((food) =>
          food.name.toLocaleLowerCase().includes(query),
        ),
      });
      return;
    }
    if (path === "/nutrition/foods/lookup") {
      await route.fulfill({ json: state.product });
      return;
    }
    if (path === "/nutrition/foods/import") {
      const product = state.product;
      const food = makeFood({
        name: product?.name ?? "Importado",
        calories_kcal: product?.calories_kcal ?? 0,
        protein_g: product?.protein_g ?? 0,
      });
      state.foods.push(food);
      await route.fulfill({ status: 201, json: food });
      return;
    }
    if (path === "/nutrition/recipes/import") {
      const matched = state.foods[0];
      await route.fulfill({
        json: {
          source_url: body<{ url: string }>().url,
          name: "Tortilla de la web",
          description: "Paso a paso",
          prep_minutes: 25,
          servings: 4,
          tags: ["española"],
          ingredients: [
            {
              raw: "4 huevos",
              name: "huevos",
              quantity: 4,
              unit: "",
              food_id: matched?.id ?? "",
              food_name: matched?.name ?? "",
              base_unit: matched?.base_unit ?? "g",
            },
            {
              raw: "1 pizca de sal",
              name: "sal",
              quantity: 1,
              unit: "pizca",
              food_id: "",
              food_name: "",
              base_unit: "",
            },
          ],
        },
      });
      return;
    }
    if (path === "/nutrition/recipes") {
      if (method === "POST") {
        const recipe = buildRecipe(body<RecipeInput>(), state.foods);
        state.recipes.push(recipe);
        await route.fulfill({ status: 201, json: recipe });
        return;
      }
      await route.fulfill({ json: state.recipes });
      return;
    }
    if (path === "/nutrition/plans") {
      if (method === "POST") {
        const input = body<{ name: string; week_start: string | null }>();
        state.plan = {
          id: crypto.randomUUID(),
          name: input.name,
          week_start: input.week_start,
          is_template: false,
          items: [],
          created_at: now(),
          updated_at: now(),
        };
        await route.fulfill({ status: 201, json: state.plan });
        return;
      }
      if (url.searchParams.get("template") === "true") {
        await route.fulfill({ json: state.templates });
        return;
      }
      await route.fulfill({ json: state.plan });
      return;
    }
    if (path.endsWith("/log")) {
      await route.fulfill({
        json: logPlan(state, body<{ day_index: number }>()),
      });
      return;
    }
    if (path === "/nutrition/diary" && method === "GET") {
      await route.fulfill({ json: diaryDay(state) });
      return;
    }
    if (path === "/nutrition/diary/water" && method === "PUT") {
      state.water = body<{ water_ml: number }>().water_ml;
      await route.fulfill({
        json: { entry_date: "", water_ml: state.water },
      });
      return;
    }
    if (path === "/nutrition/shopping/items" && method === "POST") {
      const input = body<{
        label: string;
        quantity: number;
        unit: ShoppingItem["unit"];
      }>();
      const item: ShoppingItem = {
        id: crypto.randomUUID(),
        label: input.label,
        quantity: input.quantity,
        unit: input.unit,
        checked: false,
        food_id: null,
        source: "manual",
        created_at: now(),
        updated_at: now(),
      };
      state.shopping.push(item);
      await route.fulfill({ status: 201, json: item });
      return;
    }
    if (path === "/nutrition/shopping/generate" && method === "POST") {
      state.shopping = generateShopping(state);
      await route.fulfill({ json: state.shopping });
      return;
    }
    if (path === "/nutrition/shopping" && method === "GET") {
      await route.fulfill({ json: state.shopping });
      return;
    }
    if (path === "/nutrition/measurements" && method === "GET") {
      await route.fulfill({
        json: [...state.measurements].sort((left, right) =>
          left.measured_on < right.measured_on ? 1 : -1,
        ),
      });
      return;
    }
    if (path === "/nutrition/measurements" && method === "POST") {
      const measurement: BodyMeasurement = {
        id: crypto.randomUUID(),
        ...body<BodyMeasurementInput>(),
        created_at: now(),
        updated_at: now(),
      };
      state.measurements.push(measurement);
      await route.fulfill({ status: 201, json: measurement });
      return;
    }
    if (path === "/tasks" && method === "POST") {
      await route.fulfill({
        status: 201,
        json: { id: crypto.randomUUID(), status: "pending", ...body() },
      });
      return;
    }
    if (method === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ json: [] });
  });
}

function logPlan(
  state: State,
  input: { day_index: number },
): {
  logged: number;
  entry_date: string;
} {
  const plan = state.plan;
  if (!plan) return { logged: 0, entry_date: "" };
  const entryDate = addDays(plan.week_start ?? mondayISO(), input.day_index);
  const items = plan.items.filter((item) => item.day_index === input.day_index);
  state.diary = state.diary.filter(
    (entry) => !items.some((item) => item.id === entry.plan_item_id),
  );
  for (const item of items) {
    state.diary.push({
      id: crypto.randomUUID(),
      entry_date: entryDate,
      meal: item.meal,
      food_id: item.food_id,
      plan_item_id: item.id,
      label: item.label,
      quantity: item.quantity,
      unit: item.unit,
      calories_kcal: item.calories_kcal,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
      sugar_g: item.sugar_g,
      saturated_fat_g: item.saturated_fat_g,
      salt_g: item.salt_g,
      sodium_mg: item.sodium_mg,
      micronutrients: item.micronutrients,
      created_at: now(),
    });
  }
  return { logged: items.length, entry_date: entryDate };
}

function diaryDay(state: State): DiaryDay {
  const totals = zeroTotals();
  for (const entry of state.diary) addTotals(totals, entry);
  return {
    entry_date: new Date().toISOString().slice(0, 10),
    water_ml: state.water,
    entries: state.diary,
    totals,
    targets: {
      calories_kcal: state.profile.target_calories,
      protein_g: state.profile.target_protein_g,
      carbs_g: state.profile.target_carbs_g,
      fat_g: state.profile.target_fat_g,
      fiber_g: state.profile.target_fiber_g,
      water_ml: state.profile.target_water_ml,
    },
  };
}

function generateShopping(state: State): ShoppingItem[] {
  const merged = new Map<string, ShoppingItem>();
  const plan = state.plan;
  if (!plan) return [];
  for (const item of plan.items) {
    const recipe = state.recipes.find(
      (candidate) => candidate.id === item.recipe_id,
    );
    if (!recipe) continue;
    const factor = recipe.servings > 0 ? item.quantity / recipe.servings : 1;
    for (const ingredient of recipe.ingredients) {
      const key = `${ingredient.food_id}/${ingredient.unit}`;
      const existing = merged.get(key);
      const amount = round2(ingredient.quantity * factor);
      if (existing) {
        existing.quantity = round2(existing.quantity + amount);
        continue;
      }
      merged.set(key, {
        id: crypto.randomUUID(),
        label: ingredient.food_name,
        quantity: amount,
        unit: ingredient.unit,
        checked: false,
        food_id: ingredient.food_id,
        source: "recipe",
        created_at: now(),
        updated_at: now(),
      });
    }
  }
  return [...merged.values()];
}

let state: State = defaultState();

test.beforeEach(async ({ page }) => {
  state = defaultState();
  await installApi(page, state);
});

test("crear un alimento lo añade al catálogo", async ({ page }) => {
  await page.goto("/nutrition/foods");
  await page.getByRole("button", { name: "Nuevo alimento" }).click();
  await page.getByLabel("Nombre").fill("Yogur griego");
  await page.getByLabel("Calorías (kcal)").fill("59");
  await page.getByRole("button", { name: "Crear alimento" }).click();
  await expect(
    page.getByRole("heading", { name: "Yogur griego" }),
  ).toBeVisible();
  await expect(page.getByText("59 kcal")).toBeVisible();
});

test("el perfil calcula el objetivo al instante y lo guarda", async ({
  page,
}) => {
  await page.goto("/nutrition/profile");
  await page.getByLabel("Peso (kg)").fill("80");
  await page.getByLabel("Altura (cm)").fill("180");
  await page.getByLabel("Edad").fill("30");
  await page.getByRole("button", { name: "Sexo" }).click();
  await page.getByRole("option", { name: "Hombre" }).click();
  await page.getByRole("button", { name: "Nivel de actividad" }).click();
  await page.getByRole("option", { name: "Moderada" }).click();
  await page.getByRole("button", { name: "Objetivo", exact: true }).click();
  await page.getByRole("option", { name: "Perder grasa" }).click();
  await expect(page.getByText("2345 kcal / día")).toBeVisible();
  await page.getByRole("button", { name: "Guardar objetivos" }).click();
  await expect(page.getByText("Perfil y objetivos guardados")).toBeVisible();
});

test("crear una receta calcula las macros por ración", async ({ page }) => {
  state.foods.push(
    makeFood({ name: "Yogur griego", calories_kcal: 59, protein_g: 10 }),
  );
  await page.goto("/nutrition/recipes");
  await page.getByRole("button", { name: "Nueva receta" }).click();
  await page.getByLabel("Nombre").fill("Bol");
  await page
    .getByRole("button", { name: "Alimento del ingrediente 1" })
    .click();
  await page.getByLabel("Alimento del ingrediente 1").fill("Yogur");
  await page.getByRole("button", { name: /Yogur griego/ }).click();
  await page.getByLabel("Raciones").fill("2");
  await page.getByRole("button", { name: "Crear receta" }).click();
  await expect(page.getByRole("heading", { name: "Bol" })).toBeVisible();
  await expect(page.getByText("29.5 kcal / ración")).toBeVisible();
});

test("importar una receta desde URL abre el formulario pre-rellenado", async ({
  page,
}) => {
  state.foods.push(
    makeFood({ name: "Yogur griego", calories_kcal: 59, protein_g: 10 }),
  );
  await page.goto("/nutrition/recipes");
  await page.getByRole("button", { name: "Importar desde URL" }).click();
  await page
    .getByLabel("URL de la receta")
    .fill("https://example.com/tortilla");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revisar receta importada" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveValue("Tortilla de la web");
  await expect(page.getByLabel("Raciones")).toHaveValue("4");
  await expect(
    page.getByText("Sin alimento asignado: 1 pizca de sal"),
  ).toBeVisible();
  await expect(page.getByLabel("Nota del ingrediente 1")).toHaveValue(
    "4 huevos",
  );
  await page.getByRole("button", { name: "Crear receta" }).click();
  await expect(
    page.getByRole("heading", { name: "Tortilla de la web" }),
  ).toBeVisible();
});

test("el plan semanal pasa el día al diario", async ({ page }) => {
  const food = makeFood({ name: "Yogur griego", calories_kcal: 59 });
  state.foods.push(food);
  const recipe = buildRecipe(
    {
      name: "Bol",
      description: "",
      prep_minutes: 5,
      servings: 1,
      tags: [],
      favorite: false,
      ingredients: [{ food_id: food.id, quantity: 100 }],
    },
    state.foods,
  );
  state.recipes.push(recipe);
  state.plan = makePlanWithItem(recipe, 0);
  await page.goto("/nutrition/plan");
  await expect(page.getByText("Bol", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pasar el día al diario" }).click();
  await expect(page.getByText("Día pasado al diario")).toBeVisible();
  await page.getByRole("link", { name: "Diario" }).click();
  await expect(page.getByText("Bol", { exact: true })).toBeVisible();
});

test("la lista de la compra se genera desde el plan y crea una tarea", async ({
  page,
}) => {
  const food = makeFood({ name: "Yogur griego", calories_kcal: 59 });
  state.foods.push(food);
  const recipe = buildRecipe(
    {
      name: "Bol",
      description: "",
      prep_minutes: 5,
      servings: 1,
      tags: [],
      favorite: false,
      ingredients: [{ food_id: food.id, quantity: 200 }],
    },
    state.foods,
  );
  state.recipes.push(recipe);
  state.plan = makePlanWithItem(recipe, 0);
  await page.goto("/nutrition/shopping");
  await page.getByRole("button", { name: "Generar del plan" }).click();
  await expect(page.getByText("Yogur griego")).toBeVisible();
  await page.getByLabel("Nuevo artículo").fill("Pan");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await expect(page.getByText("Pan", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Crear tarea con lo pendiente" })
    .click();
  await expect(page.getByText("Tarea creada con la lista")).toBeVisible();
});

test("el progreso registra el peso y dibuja la evolución", async ({ page }) => {
  state.measurements.push(
    makeMeasurement("2026-09-01", 80),
    makeMeasurement("2026-09-08", 79),
  );
  await page.goto("/nutrition/progress");
  await expect(
    page.getByRole("img", { name: "Gráfica de peso" }),
  ).toBeVisible();
  await expect(page.getByText("80 → 79 kg")).toBeVisible();
  await page.getByLabel("Peso (kg)").fill("78.5");
  await page.getByRole("button", { name: "Guardar medida" }).click();
  await expect(page.getByText("Medida guardada")).toBeVisible();
});
