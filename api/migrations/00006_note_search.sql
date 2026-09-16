-- +goose Up
ALTER TABLE notes ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
 setweight(to_tsvector('simple', title), 'A') ||
 setweight(to_tsvector('simple', content), 'B') ||
 setweight(to_tsvector('simple', properties::text), 'C')
) STORED;
CREATE INDEX notes_search_gin ON notes USING gin(search_vector) WHERE deleted_at IS NULL;

-- +goose Down
ALTER TABLE notes DROP COLUMN search_vector;
