-- +goose Up
CREATE TABLE attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 filename text NOT NULL CHECK(length(trim(filename)) BETWEEN 1 AND 200),
 content_type text NOT NULL CHECK(content_type IN('image/png','image/jpeg','image/gif','image/webp','image/bmp','image/avif')),
 size_bytes integer NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 15728640),
 data bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_created_at ON attachments(created_at DESC,id);

-- +goose Down
DROP TABLE attachments;
