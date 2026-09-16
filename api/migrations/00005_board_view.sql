-- +goose Up
ALTER TABLE projects DROP CONSTRAINT projects_default_view_check;
ALTER TABLE projects ADD CONSTRAINT projects_default_view_check CHECK (default_view IN ('list', 'board'));

-- +goose Down
ALTER TABLE projects DROP CONSTRAINT projects_default_view_check;
ALTER TABLE projects ADD CONSTRAINT projects_default_view_check CHECK (default_view = 'list');
UPDATE projects SET default_view = 'list' WHERE default_view <> 'list';
