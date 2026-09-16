-- +goose Up
ALTER TABLE settings
ADD COLUMN accent_color text NOT NULL DEFAULT '#2563eb'
CHECK (accent_color IN ('#2563eb', '#7c3aed', '#15803d', '#c2410c', '#be123c'));

-- +goose Down
ALTER TABLE settings DROP COLUMN accent_color;
