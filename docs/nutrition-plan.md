# Plan del módulo de Nutrición

## Objetivo

Añadir un tercer espacio de la aplicación, **Nutrición**, junto a Tareas y Notas. Permite fijar objetivos
calóricos y de macros, registrar lo que comes cada día, guardar recetas con ingredientes estructurados, montar
planes semanales de comidas y generar una lista de compras. El catálogo de alimentos es propio, con búsqueda en
Open Food Facts como apoyo cuando un producto no exista todavía.

## Alcance de esta versión (MVP)

- Perfil nutricional único y cálculo automático de objetivos (BMR/TDEE) con ajuste manual.
- Catálogo de alimentos con favoritos, búsqueda y entrada rápida por gramos, ml, unidades o porciones.
- Diario por fecha y comida (desayuno, comida, cena, snacks), con totales del día y barras de macros.
- Registro de hidratación diaria.
- Recetas internas del módulo (sin depender de Notas): ingredientes estructurados, macros calculadas y pasos
  en Markdown.
- Plan semanal con días × comidas, plantillas reutilizables y copia entre semanas.
- Lista de compras generada desde un plan o recetas, con marcado de comprado.
- Micronutrientes: set práctico (azúcar, grasas saturadas, sal/sodio, fibra) más un campo libre JSONB para
  vitaminas y minerales que se necesiten.
- Integración con Open Food Facts por búsqueda de texto y código de barras introducido a mano.
- Puente con Tareas: crear tareas desde la lista de compras.

## Fuera de alcance (fase 2)

- Progreso: peso, medidas corporales y gráficas de evolución.
- Varios perfiles o comensales (Milly). El MVP es de un único perfil.
- Escáner de cámara para códigos de barras.
- Recetas enlazadas con el módulo de Notas.
- Recordatorios y recurrencia.

## Decisiones

- Módulo Go `api/internal/nutrition` registrado en `server.go` junto a los demás, tras `notes.Register`.
- Migración Goose `00009_nutrition.sql`; sin tocar tablas existentes.
- Se reutilizan `core.Write/Decode/Mutate/Fail/ValidID` y el patrón handler → service → repository por dominio.
- El diario guarda una **copia congelada** de los valores nutricionales en el momento de registrar (más la
  referencia al alimento/receta de origen). Así, editar o borrar un alimento no reescribe el histórico.
- Las macros de una receta se calculan a partir de sus ingredientes y se devuelven calculadas; no se almacenan.
- El plan semanal es semi-automático: propone las comidas del día y el usuario las confirma para pasarlas al diario.
- Open Food Facts se consulta solo desde el servidor (proxy), con `User-Agent` propio configurable y sin llamadas
  externas en tests (interfaz + `httptest`). Lo importado se guarda en el catálogo local.
- Etiquetas de recetas en tabla propia del módulo para no acoplar con las etiquetas de Notas.
- Migración y API antes que UI; cada slice termina con `make verify` en verde.

## Modelo de datos (`00009_nutrition.sql`)

Singleton de perfil (una fila, como el resto de la instalación de un solo usuario):

- `nutrition_profiles`: `id`, `weight_kg`, `height_cm`, `age`, `sex`, `activity_level`, `goal`,
  `target_calories`, `target_protein_g`, `target_carbs_g`, `target_fat_g`, `target_fiber_g`, `target_water_ml`,
  `target_mode` (`auto` | `manual`), `updated_at`.

Catálogo:

- `foods`: `id`, `name`, `brand`, `barcode` (nullable, único), `source` (`manual` | `openfoodfacts`),
  `base_quantity`, `base_unit` (`g` | `ml` | `unit`), `calories_kcal`, `protein_g`, `carbs_g`, `fat_g`,
  `fiber_g`, `sugar_g`, `saturated_fat_g`, `salt_g`, `sodium_mg`, `micronutrients jsonb`, `favorite`,
  `created_at`, `updated_at`.

Diario:

- `diary_days`: `entry_date` (PK), `water_ml`, `updated_at`.
- `diary_entries`: `id`, `entry_date`, `meal` (`breakfast` | `lunch` | `dinner` | `snack`),
  `food_id` (nullable), `recipe_id` (nullable), `label`, `quantity`, `unit`, y la copia congelada
  (`calories_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`, `saturated_fat_g`, `salt_g`,
  `sodium_mg`, `micronutrients jsonb`), `created_at`. `CHECK` de que haya exactamente un `food_id` o `recipe_id`.

Recetas:

- `recipes`: `id`, `name`, `description`, `prep_minutes`, `servings`, `favorite`, `created_at`, `updated_at`.
- `recipe_ingredients`: `id`, `recipe_id`, `food_id`, `quantity`, `unit`, `note`, `position`.
- `recipe_tags` / `recipe_tag_links` para etiquetado simple.

Planes:

- `meal_plans`: `id`, `name`, `week_start date` (NULL en plantillas), `is_template`, `created_at`, `updated_at`.
- `meal_plan_items`: `id`, `plan_id`, `day_index smallint` (0–6) o `plan_date date`, `meal`,
  `recipe_id` (nullable), `food_id` (nullable), `quantity`, `unit`, `position`.

Compras:

- `shopping_items`: `id`, `label`, `quantity`, `unit`, `checked`, `source` (`manual` | `plan` | `recipe`),
  `created_at`.

## API (`/api/v1/nutrition/...`)

- Perfil: `GET` y `PUT /nutrition/profile`.
- Alimentos: `GET /nutrition/foods?q=&favorite=&limit=&offset=`, `POST /nutrition/foods`,
  `PATCH|DELETE /nutrition/foods/{id}`, toggle de favorito con `PATCH`.
- Open Food Facts: `GET /nutrition/foods/lookup?barcode=` (candidato sin guardar) y
  `POST /nutrition/foods/import` (guarda el candidato en local con `source=openfoodfacts`); búsqueda por texto
  mediante `?q=` sobre el catálogo y `POST /nutrition/foods/search-openfoodfacts` si no hay resultados locales.
- Diario: `GET /nutrition/diary?date=YYYY-MM-DD` (entradas, totales y objetivos), `POST /nutrition/diary`,
  `PATCH|DELETE /nutrition/diary/{id}`, `PUT /nutrition/diary/water`.
- Recetas: `GET /nutrition/recipes?q=&tag=`, `POST /nutrition/recipes`,
  `GET|PATCH|DELETE /nutrition/recipes/{id}` (con `ingredients` anidados), `POST /nutrition/recipes/{id}/log`.
- Planes: `GET /nutrition/plans?week=|template=`, `POST /nutrition/plans`, `PATCH|DELETE /nutrition/plans/{id}`,
  `POST|PATCH|DELETE /nutrition/plans/{id}/items`, `POST /nutrition/plans/{id}/apply`,
  `POST /nutrition/plans/{id}/copy`, `POST /nutrition/plans/{id}/log`.
- Compras: `GET /nutrition/shopping`, `POST /nutrition/shopping/generate`, `POST /nutrition/shopping/items`,
  `PATCH|DELETE /nutrition/shopping/{id}`, `POST /nutrition/shopping/push-to-tasks`.

## Frontend

- `web/src/NutritionApp.tsx` cargado con `lazy` desde `App.tsx`, prefijo de ruta `/nutrition`.
- Tercer entry en `AppSwitcher.tsx` (icono `Salad`), con `match` por `path.startsWith("/nutrition")`.
- Subrutas: `/nutrition` (día de hoy), `/nutrition/foods`, `/nutrition/recipes`, `/nutrition/recipes/:id`,
  `/nutrition/plan`, `/nutrition/shopping`, `/nutrition/profile`.
- Componentes: `NutriSidebar`, `DiaryDay`, `AddFoodDialog`, `FoodForm`, `MacroBar`, `MicroPanel`,
  `RecipeList`, `RecipeEditor`, `WeeklyPlanGrid` (dnd-kit), `ShoppingList`, `ProfileForm`.
- Reutiliza `Modal`, `Dropdown`, `api/useResource`, `dates` y las clases de `styles.css`. Textos en español.

## Slices de entrega (verticales y ordenados)

1. **Fundación.** Migración `00009` con perfil singleton, módulo `nutrition` registrado, `GET/PUT profile`,
   ruta lazy y entry en `AppSwitcher`. Aceptación: `GET /health` intacto, `GET /nutrition/profile` responde
   por defecto y la app cambia a Nutrición sin romper Tareas ni Notas.
2. **Perfil y objetivos.** Formulario, cálculo BMR/TDEE (Mifflin-St Jeor) y modo manual. Aceptación: tests de
   cálculo y validación de rangos; el objetivo se persiste y se refleja en el diario.
3. **Alimentos.** CRUD, búsqueda, favoritos y formulario con macros y micros. Aceptación: unicidad por
   nombre/marca/unidad, validaciones y `make verify`.
4. **Open Food Facts.** Cliente servidor con interfaz inyectable, `lookup` por código de barras, import y
   búsqueda remota. Aceptación: `httptest` cubre aciertos, 404, fallo de red y campos ausentes; sin red en tests.
5. **Diario.** Registro por fecha/comida, alta de alimento con cantidad, agregados del día, barras de macros y
   agua. Aceptación: totales correctos con copia congelada y edición/borrado que recalcula.
6. **Recetas.** CRUD con ingredientes, macros calculadas, pasos Markdown, etiquetas y `log` al diario. Aceptación:
   escalado por porciones y recálculo al cambiar ingredientes.
7. **Plan semanal.** Semana días × comidas con arrastrar y soltar, plantillas, copia de semana y paso al diario.
   Aceptación: persistencia de posiciones y “pasar al diario” idempotente por comida.
8. **Lista de compras.** Generación desde plan/recetas, agrupación de ingredientes, marcado de comprado y
   `push-to-tasks`. Aceptación: suma de cantidades compatibles y creación de tarea desde la lista.
9. **Progreso (fase 2).** Peso, medidas y gráficas.

## Verificación

- Tests unitarios Go por slice (`service_test.go`) y de integración con `TEST_DATABASE_URL`.
- Tests de frontend con Vitest para cálculo/escalado y Playwright para el flujo clave (registrar comida,
  crear receta, montar plan, generar compras).
- `make verify` (gofmt, vet, race tests, ESLint, TypeScript, build) antes de cerrar cada slice.
- La suite de integración trunca solo las tablas de test; nunca datos reales.

## Riesgos y decisiones abiertas

- **Open Food Facts:** respetar el `User-Agent` propio y la licencia ODbL (mostrar atribución en la UI);
  posible rate limiting fuera de alcance.
- **Regenerar compras:** definir si la generación reemplaza o fusiona la lista existente (propuesta: fusionar
  marcando el origen y conservar lo ya marcado).
- **Unidades:** conversión entre g/ml/unit solo cuando el alimento defina una equivalencia; si no, se registran
  cantidades del mismo tipo.
- **Etiquetas de recetas:** tabla propia del módulo; valorar migrar a etiquetas globales si se unifican dominios.
