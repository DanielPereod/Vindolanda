-- +goose Up
CREATE TABLE meal_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 week_start date,
 is_template boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((is_template AND week_start IS NULL) OR (NOT is_template AND week_start IS NOT NULL))
);
CREATE UNIQUE INDEX meal_plans_week ON meal_plans(week_start) WHERE week_start IS NOT NULL;
CREATE TABLE meal_plan_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
 day_index smallint NOT NULL CHECK(day_index BETWEEN 0 AND 6),
 meal text NOT NULL CHECK(meal IN('breakfast','lunch','dinner','snack')),
 recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,
 food_id uuid REFERENCES foods(id) ON DELETE CASCADE,
 quantity numeric(8,2) NOT NULL DEFAULT 1 CHECK(quantity > 0 AND quantity <= 100000),
 unit text NOT NULL CHECK(unit IN('g','ml','unit')),
 position double precision NOT NULL DEFAULT 1024,
 CHECK((recipe_id IS NOT NULL) <> (food_id IS NOT NULL))
);
CREATE INDEX meal_plan_items_plan ON meal_plan_items(plan_id, day_index, meal, position);
ALTER TABLE diary_entries ADD COLUMN plan_item_id uuid REFERENCES meal_plan_items(id) ON DELETE SET NULL;
CREATE INDEX diary_entries_plan_item ON diary_entries(plan_item_id);

-- +goose Down
DROP INDEX diary_entries_plan_item;
ALTER TABLE diary_entries DROP COLUMN plan_item_id;
DROP TABLE meal_plan_items;
DROP TABLE meal_plans;
