package projects

import (
	"context"
	"personal-life/api/internal/core"
	"strings"
)

func validate(requestContext context.Context, database core.Database, identifier string, value Input) error {
	if len(strings.TrimSpace(value.Name)) == 0 || len(value.Name) > 200 {
		return core.Invalid("Name is required and must fit the length limit")
	}
	if !core.ValidColor(value.Color) || (value.DefaultView != "list" && value.DefaultView != "board") {
		return core.Invalid("Invalid color or view")
	}
	if value.ParentProjectID == nil {
		return nil
	}
	var cycle bool
	if operationError := database.QueryRow(requestContext, `WITH RECURSIVE ancestors AS (SELECT id,parent_project_id FROM projects WHERE id=$1 UNION SELECT p.id,p.parent_project_id FROM projects p JOIN ancestors a ON p.id=a.parent_project_id) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id::text=$2)`, *value.ParentProjectID, identifier).Scan(&cycle); operationError != nil {
		return operationError
	}
	if cycle {
		return core.Invalid("Project hierarchy cannot contain a cycle")
	}
	return nil
}
