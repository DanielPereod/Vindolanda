package notes

import (
	"math"
	"net/url"
	"personal-life/api/internal/core"
	"strings"
)

// Canvas node types: note references a stored document, text is a canvas-only
// Markdown card and media embeds an image or video URL.
const (
	nodeTypeNote   = "note"
	nodeTypeText   = "text"
	nodeTypeMedia  = "media"
	maxCanvasText  = 20000
	maxCanvasURL   = 2000
	attachmentPath = "/api/v1/attachments/"
)

func normalizeNodeType(value string) string {
	if value == "" {
		return nodeTypeNote
	}
	return value
}

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
		if node.ID == "" || identifiers[node.ID] || !validCoordinate(node.X) || !validCoordinate(node.Y) || !validSize(node.Width) || !validSize(node.Height) {
			return core.Invalid("Invalid canvas node")
		}
		switch normalizeNodeType(node.Type) {
		case nodeTypeNote:
			if !core.ValidID(node.NoteID) {
				return core.Invalid("Invalid canvas node")
			}
		case nodeTypeText:
			if strings.TrimSpace(node.Text) == "" || len(node.Text) > maxCanvasText {
				return core.Invalid("Invalid canvas card")
			}
		case nodeTypeMedia:
			if !validMediaURL(node.URL) {
				return core.Invalid("Invalid canvas media")
			}
		default:
			return core.Invalid("Unknown canvas node type")
		}
		if node.Color != "" && !core.ValidColor(node.Color) {
			return core.Invalid("Invalid canvas color")
		}
		identifiers[node.ID] = true
	}
	for _, edge := range value.Edges {
		if !identifiers[edge.From] || !identifiers[edge.To] || edge.From == edge.To {
			return core.Invalid("Invalid canvas connection")
		}
		if !validCanvasSide(edge.FromSide) || !validCanvasSide(edge.ToSide) {
			return core.Invalid("Invalid canvas connection anchor")
		}
	}
	return nil
}

// validCanvasSide accepts an omitted anchor or one of the four card sides.
func validCanvasSide(value string) bool {
	switch value {
	case "", "top", "right", "bottom", "left":
		return true
	default:
		return false
	}
}

func validCoordinate(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= -100000 && value <= 100000
}

func validSize(value float64) bool {
	if value == 0 {
		return true
	}
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 40 && value <= 5000
}

func validMediaURL(value string) bool {
	if value == "" || len(value) > maxCanvasURL {
		return false
	}
	// Uploaded images are stored with a same-origin attachment path.
	if strings.HasPrefix(value, attachmentPath) {
		return len(value) > len(attachmentPath) && !strings.Contains(value, "..")
	}
	parsed, failure := url.Parse(value)
	if failure != nil {
		return false
	}
	return (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}
