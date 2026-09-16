package labels

import (
	"context"
	"personal-life/api/internal/core"
	"strings"
)

func validate(requestContext context.Context, database core.Database, identifier string, value Input) error {
	if len(strings.TrimSpace(value.Name)) == 0 || len(value.Name) > 100 {
		return core.Invalid("Name is required and must fit the length limit")
	}
	if !core.ValidColor(value.Color) {
		return core.Invalid("Invalid color")
	}
	return nil
}
