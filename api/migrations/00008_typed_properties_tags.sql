-- +goose Up
CREATE TABLE property_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE,
 type text NOT NULL CHECK (type IN ('text','list','number','boolean','date','datetime','tag','relation'))
);
CREATE TABLE note_properties (
 note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 property_id uuid NOT NULL REFERENCES property_definitions(id) ON DELETE CASCADE,
 value jsonb NOT NULL DEFAULT 'null',
 related_note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
 PRIMARY KEY(note_id,property_id),
 CHECK (related_note_id IS NULL OR value='null'::jsonb)
);
CREATE INDEX note_properties_definition ON note_properties(property_id,note_id);
CREATE INDEX note_properties_relation ON note_properties(related_note_id) WHERE related_note_id IS NOT NULL;
INSERT INTO property_definitions(name,type) SELECT DISTINCT entry.key,'text' FROM notes CROSS JOIN LATERAL jsonb_each(properties) entry;
INSERT INTO note_properties(note_id,property_id,value)
 SELECT notes.id,definition.id,entry.value FROM notes CROSS JOIN LATERAL jsonb_each(properties) entry JOIN property_definitions definition ON definition.name=entry.key;

-- The legacy map is a derived projection for existing Base views and full-text search.
-- +goose StatementBegin
CREATE FUNCTION refresh_note_property_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identifier uuid;
BEGIN
 identifier := CASE WHEN TG_OP='DELETE' THEN OLD.note_id ELSE NEW.note_id END;
 UPDATE notes SET updated_at=now(),properties=COALESCE((SELECT jsonb_object_agg(definition.name,
  CASE WHEN value.related_note_id IS NOT NULL THEN value.related_note_id::text
       WHEN jsonb_typeof(value.value)='string' THEN value.value#>>'{}'
       ELSE value.value::text END)
  FROM note_properties value JOIN property_definitions definition ON definition.id=value.property_id WHERE value.note_id=identifier),'{}'::jsonb)
 WHERE id=identifier;
 RETURN NULL;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER note_property_projection AFTER INSERT OR UPDATE OR DELETE ON note_properties FOR EACH ROW EXECUTE FUNCTION refresh_note_property_projection();

CREATE TABLE tags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE,
 parent_id uuid REFERENCES tags(id) ON DELETE RESTRICT
);
CREATE INDEX tags_parent ON tags(parent_id);
CREATE TABLE note_tags (
 note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
 PRIMARY KEY(note_id,tag_id)
);
CREATE INDEX note_tags_tag ON note_tags(tag_id,note_id);
DROP INDEX IF EXISTS notes_metadata_pending;
CREATE INDEX notes_metadata_pending ON notes(id) WHERE metadata_version<2;

-- +goose Down
DROP TABLE note_tags, tags;
DROP TRIGGER note_property_projection ON note_properties;
DROP FUNCTION refresh_note_property_projection();
DROP TABLE note_properties, property_definitions;
DROP INDEX notes_metadata_pending;
CREATE INDEX notes_metadata_pending ON notes(id) WHERE metadata_version=0;
