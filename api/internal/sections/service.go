package sections

import (
	"context"
	"personal-life/api/internal/core"
	"strings"
)

func validate(requestContext context.Context, database core.Database, identifier string, value Input) error {
	if len(strings.TrimSpace(value.Name)) == 0 || len(value.Name) > 200 {
		return core.Invalid("Name is required and must fit the length limit")
	}
	if !core.ValidID(value.ProjectID) {
		return core.Invalid("Project is required")
	}
	if identifier == "" {
		return nil
	}
	current, operationError := Get(requestContext, database, identifier)
	if operationError != nil {
		return operationError
	}
	if current.ProjectID != value.ProjectID {
		return core.Invalid("A section cannot change projects; move its tasks instead")
	}
	return nil
}
