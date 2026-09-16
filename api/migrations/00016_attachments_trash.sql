-- +goose Up
ALTER TABLE attachments ADD COLUMN deleted_at timestamptz;
CREATE INDEX attachments_active ON attachments(created_at DESC,id) WHERE deleted_at IS NULL;

-- +goose Down
DROP INDEX attachments_active;
ALTER TABLE attachments DROP COLUMN deleted_at;
