package sections

import (
	"context"
	"personal-life/api/internal/core"
)

// List returns all sections in their display order.
func List(requestContext context.Context, database core.Database) ([]Section, error) {
	return core.List[Section](requestContext, database, "SELECT to_jsonb(item) FROM sections item ORDER BY position,id")
}

// Get returns one section or a not-found error.
func Get(requestContext context.Context, database core.Database, identifier string) (Section, error) {
	return core.One[Section](requestContext, database, "SELECT to_jsonb(item) FROM sections item WHERE id=$1", identifier)
}
func create(requestContext context.Context, database core.Database, value Input) (Section, error) {
	return core.One[Section](requestContext, database, `INSERT INTO sections(name,project_id,position) VALUES($1,$2,COALESCE((SELECT max(position)+1024 FROM sections),1024)) RETURNING to_jsonb(sections)`, value.Name, value.ProjectID)
}
func update(requestContext context.Context, database core.Database, identifier string, value Input) (Section, error) {
	return core.One[Section](requestContext, database, `UPDATE sections SET name=$2,project_id=$3,updated_at=now() WHERE id=$1 RETURNING to_jsonb(sections)`, identifier, value.Name, value.ProjectID)
}
