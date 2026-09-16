-- +goose Up
DROP INDEX notes_title_unique;
CREATE UNIQUE INDEX notes_title_unique ON notes(lower(trim(title))) WHERE deleted_at IS NULL;

-- +goose Down
DROP INDEX notes_title_unique;
CREATE UNIQUE INDEX notes_title_unique ON notes(lower(trim(title)));
