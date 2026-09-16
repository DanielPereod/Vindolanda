package notes

import (
	"math"
	"personal-life/api/internal/core"
	"strings"
)

func validate(value Input) error {
	if strings.TrimSpace(value.Title) == "" || len(value.Title) > 500 || len(value.Content) > 500000 {
		return core.Invalid("Title is required; title or content exceeds its limit")
	}
	if value.Kind != "note" && value.Kind != "base" && value.Kind != "canvas" {
		return core.Invalid("Unknown document kind")
	}
	if value.Sort != "" && value.Sort != "title" && value.Sort != "updated_at" {
		return core.Invalid("Unknown base sort")
	}
	if len(value.Nodes) > 500 || len(value.Edges) > 1000 || len(value.Properties) > 100 {
		return core.Invalid("Document exceeds collection limits")
	}
	identifiers := map[string]bool{}
	for _, node := range value.Nodes {
		if node.ID == "" || identifiers[node.ID] || !core.ValidID(node.NoteID) || math.IsNaN(node.X) || math.IsNaN(node.Y) || math.IsInf(node.X, 0) || math.IsInf(node.Y, 0) || node.X < 0 || node.Y < 0 || node.X > 10000 || node.Y > 10000 {
			return core.Invalid("Invalid canvas node")
		}
		identifiers[node.ID] = true
	}
	for _, edge := range value.Edges {
		if !identifiers[edge.From] || !identifiers[edge.To] || edge.From == edge.To {
			return core.Invalid("Invalid canvas connection")
		}
	}
	return nil
}
