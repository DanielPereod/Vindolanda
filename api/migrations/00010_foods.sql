-- +goose Up
CREATE TABLE foods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 brand text NOT NULL DEFAULT '' CHECK(length(brand) <= 200),
 barcode text CHECK(barcode IS NULL OR barcode ~ '^[0-9]{4,32}$'),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN('manual','openfoodfacts')),
 base_quantity numeric(8,2) NOT NULL DEFAULT 100 CHECK(base_quantity > 0 AND base_quantity <= 100000),
 base_unit text NOT NULL DEFAULT 'g' CHECK(base_unit IN('g','ml','unit')),
 calories_kcal numeric(8,2) NOT NULL DEFAULT 0 CHECK(calories_kcal >= 0 AND calories_kcal <= 100000),
 protein_g numeric(8,2) NOT NULL DEFAULT 0 CHECK(protein_g >= 0 AND protein_g <= 100000),
 carbs_g numeric(8,2) NOT NULL DEFAULT 0 CHECK(carbs_g >= 0 AND carbs_g <= 100000),
 fat_g numeric(8,2) NOT NULL DEFAULT 0 CHECK(fat_g >= 0 AND fat_g <= 100000),
 fiber_g numeric(8,2) NOT NULL DEFAULT 0 CHECK(fiber_g >= 0 AND fiber_g <= 100000),
 sugar_g numeric(8,2) NOT NULL DEFAULT 0 CHECK(sugar_g >= 0 AND sugar_g <= 100000),
 saturated_fat_g numeric(8,2) NOT NULL DEFAULT 0 CHECK(saturated_fat_g >= 0 AND saturated_fat_g <= 100000),
 salt_g numeric(8,2) NOT NULL DEFAULT 0 CHECK(salt_g >= 0 AND salt_g <= 100000),
 sodium_mg numeric(8,2) NOT NULL DEFAULT 0 CHECK(sodium_mg >= 0 AND sodium_mg <= 100000),
 micronutrients jsonb NOT NULL DEFAULT '{}',
 favorite boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX foods_name ON foods(lower(name));
CREATE UNIQUE INDEX foods_barcode ON foods(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX foods_identity ON foods(lower(trim(name)), lower(trim(brand)), base_unit);

-- +goose Down
DROP TABLE foods;
