-- +goose Up
CREATE TABLE notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
 kind text NOT NULL CHECK (kind IN ('note','base','canvas')),
 content text NOT NULL DEFAULT '',
 properties jsonb NOT NULL DEFAULT '{}',
 nodes jsonb NOT NULL DEFAULT '[]',
 edges jsonb NOT NULL DEFAULT '[]',
 filter text NOT NULL DEFAULT '',
 sort text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notes_title_unique ON notes(lower(trim(title)));
CREATE TABLE task_notes (
 task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 PRIMARY KEY(task_id,note_id)
);
CREATE INDEX task_notes_note ON task_notes(note_id);
-- +goose Down
DROP TABLE task_notes;
DROP TABLE notes;
