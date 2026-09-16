package projects

import (
	"context"
	"personal-life/api/internal/core"
)

// List returns all projects in their display order.
func List(requestContext context.Context, database core.Database) ([]Project, error) {
	return core.List[Project](requestContext, database, "SELECT to_jsonb(item) FROM projects item ORDER BY position,id")
}

// Get returns one project or a not-found error.
func Get(requestContext context.Context, database core.Database, identifier string) (Project, error) {
	return core.One[Project](requestContext, database, "SELECT to_jsonb(item) FROM projects item WHERE id=$1", identifier)
}
func create(requestContext context.Context, database core.Database, value Input) (Project, error) {
	return core.One[Project](requestContext, database, `INSERT INTO projects(name,description,color,icon,parent_project_id,favorite,archived,default_view,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE((SELECT max(position)+1024 FROM projects),1024)) RETURNING to_jsonb(projects)`, value.Name, value.Description, value.Color, value.Icon, value.ParentProjectID, value.Favorite, value.Archived, value.DefaultView)
}
func update(requestContext context.Context, database core.Database, identifier string, value Input) (Project, error) {
	return core.One[Project](requestContext, database, `UPDATE projects SET name=$2,description=$3,color=$4,icon=$5,parent_project_id=$6,favorite=$7,archived=$8,default_view=$9,updated_at=now() WHERE id=$1 RETURNING to_jsonb(projects)`, identifier, value.Name, value.Description, value.Color, value.Icon, value.ParentProjectID, value.Favorite, value.Archived, value.DefaultView)
}
