package labels

import (
	"context"
	"personal-life/api/internal/core"
)

// List returns all labels in their display order.
func List(requestContext context.Context, database core.Database) ([]Label, error) {
	return core.List[Label](requestContext, database, "SELECT to_jsonb(item) FROM labels item ORDER BY name")
}

// Get returns one label or a not-found error.
func Get(requestContext context.Context, database core.Database, identifier string) (Label, error) {
	return core.One[Label](requestContext, database, "SELECT to_jsonb(item) FROM labels item WHERE id=$1", identifier)
}
func create(requestContext context.Context, database core.Database, value Input) (Label, error) {
	return core.One[Label](requestContext, database, `INSERT INTO labels(name,color,favorite) VALUES($1,$2,$3) RETURNING to_jsonb(labels)`, value.Name, value.Color, value.Favorite)
}
func update(requestContext context.Context, database core.Database, identifier string, value Input) (Label, error) {
	return core.One[Label](requestContext, database, `UPDATE labels SET name=$2,color=$3,favorite=$4 WHERE id=$1 RETURNING to_jsonb(labels)`, identifier, value.Name, value.Color, value.Favorite)
}
