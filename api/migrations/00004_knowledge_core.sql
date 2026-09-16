-- +goose Up
CREATE TABLE note_folders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
 parent_id uuid REFERENCES note_folders(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE UNIQUE INDEX note_folders_sibling_name ON note_folders (parent_id, lower(trim(name))) NULLS NOT DISTINCT;
CREATE INDEX note_folders_parent ON note_folders(parent_id);
ALTER TABLE notes ADD COLUMN folder_id uuid REFERENCES note_folders(id) ON DELETE RESTRICT;
ALTER TABLE notes ADD COLUMN deleted_at timestamptz;
ALTER TABLE notes ADD COLUMN metadata_version integer NOT NULL DEFAULT 0;
CREATE INDEX notes_folder ON notes(folder_id) WHERE deleted_at IS NULL;
CREATE INDEX notes_trash ON notes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TABLE note_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 target_note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
 target_title text NOT NULL,
 target_heading text NOT NULL DEFAULT '',
 target_block text NOT NULL DEFAULT '',
 display_text text NOT NULL DEFAULT '',
 position integer NOT NULL CHECK (position >= 0),
 embed boolean NOT NULL DEFAULT false,
 UNIQUE(source_note_id, position)
);
CREATE INDEX note_links_target ON note_links(target_note_id);
CREATE INDEX note_links_unresolved ON note_links(lower(target_title)) WHERE target_note_id IS NULL;

-- +goose Down
DROP TABLE note_links;
ALTER TABLE notes DROP COLUMN metadata_version, DROP COLUMN deleted_at, DROP COLUMN folder_id;
DROP TABLE note_folders;
