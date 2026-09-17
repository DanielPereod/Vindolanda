-- +goose Up
ALTER TABLE settings
 ADD COLUMN notes_confirm_discard boolean NOT NULL DEFAULT true,
 ADD COLUMN nutrition_base_unit text NOT NULL DEFAULT 'g' CHECK(nutrition_base_unit IN('g','ml','unit'));

-- +goose Down
ALTER TABLE settings
 DROP COLUMN notes_confirm_discard,
 DROP COLUMN nutrition_base_unit;
