-- +goose Up
CREATE TABLE shopping_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 200),
 quantity numeric(10,2) NOT NULL DEFAULT 0 CHECK(quantity >= 0 AND quantity <= 1000000),
 unit text NOT NULL CHECK(unit IN('g','ml','unit')),
 checked boolean NOT NULL DEFAULT false,
 source text NOT NULL DEFAULT 'manual' CHECK(source IN('manual','plan','recipe')),
 food_id uuid REFERENCES foods(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shopping_items_order ON shopping_items(checked, lower(label));

-- +goose Down
DROP TABLE shopping_items;
