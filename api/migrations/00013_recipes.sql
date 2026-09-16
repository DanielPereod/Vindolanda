-- +goose Up
CREATE TABLE recipes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 description text NOT NULL DEFAULT '',
 prep_minutes integer NOT NULL DEFAULT 0 CHECK(prep_minutes BETWEEN 0 AND 10000),
 servings numeric(6,2) NOT NULL DEFAULT 1 CHECK(servings > 0 AND servings <= 1000),
 tags text[] NOT NULL DEFAULT '{}',
 favorite boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE recipe_ingredients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
 food_id uuid NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
 quantity numeric(8,2) NOT NULL CHECK(quantity > 0 AND quantity <= 100000),
 unit text NOT NULL CHECK(unit IN('g','ml','unit')),
 note text NOT NULL DEFAULT '' CHECK(length(note) <= 200),
 position double precision NOT NULL DEFAULT 1024
);
CREATE INDEX recipe_ingredients_recipe ON recipe_ingredients(recipe_id, position);
CREATE INDEX recipe_ingredients_food ON recipe_ingredients(food_id);
CREATE INDEX recipes_name ON recipes(lower(name));

-- +goose Down
DROP TABLE recipe_ingredients;
DROP TABLE recipes;
