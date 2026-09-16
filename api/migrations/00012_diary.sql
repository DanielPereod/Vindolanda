-- +goose Up
CREATE TABLE diary_days (
 entry_date date PRIMARY KEY,
 water_ml integer NOT NULL DEFAULT 0 CHECK(water_ml >= 0 AND water_ml <= 100000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE diary_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entry_date date NOT NULL,
 meal text NOT NULL CHECK(meal IN('breakfast','lunch','dinner','snack')),
 food_id uuid REFERENCES foods(id) ON DELETE SET NULL,
 label text NOT NULL DEFAULT '' CHECK(length(label) <= 200),
 quantity numeric(8,2) NOT NULL CHECK(quantity > 0 AND quantity <= 100000),
 unit text NOT NULL CHECK(unit IN('g','ml','unit')),
 calories_kcal numeric(10,2) NOT NULL DEFAULT 0 CHECK(calories_kcal >= 0),
 protein_g numeric(10,2) NOT NULL DEFAULT 0 CHECK(protein_g >= 0),
 carbs_g numeric(10,2) NOT NULL DEFAULT 0 CHECK(carbs_g >= 0),
 fat_g numeric(10,2) NOT NULL DEFAULT 0 CHECK(fat_g >= 0),
 fiber_g numeric(10,2) NOT NULL DEFAULT 0 CHECK(fiber_g >= 0),
 sugar_g numeric(10,2) NOT NULL DEFAULT 0 CHECK(sugar_g >= 0),
 saturated_fat_g numeric(10,2) NOT NULL DEFAULT 0 CHECK(saturated_fat_g >= 0),
 salt_g numeric(10,2) NOT NULL DEFAULT 0 CHECK(salt_g >= 0),
 sodium_mg numeric(10,2) NOT NULL DEFAULT 0 CHECK(sodium_mg >= 0),
 micronutrients jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diary_entries_date ON diary_entries(entry_date, meal, created_at);
CREATE INDEX diary_entries_food ON diary_entries(food_id);

-- +goose Down
DROP TABLE diary_entries;
DROP TABLE diary_days;
