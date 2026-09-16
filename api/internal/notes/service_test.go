package notes

import "testing"

func TestValidate(testingContext *testing.T) {
	cases := []struct {
		name  string
		input Input
		valid bool
	}{
		{"note", Input{Title: "Idea", Kind: "note"}, true},
		{"empty", Input{Kind: "note"}, false},
		{"unknown", Input{Title: "Idea", Kind: "other"}, false},
		{"invalid node", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", NoteID: "bad"}}}, false},
		{"text card", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", Type: "text", Text: "Idea suelta", X: -20, Y: 40}}}, true},
		{"empty text card", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", Type: "text", Text: "  "}}}, false},
		{"media card", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", Type: "media", URL: "https://youtu.be/dQw4w9WgXcQ"}}}, true},
		{"media without scheme", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", Type: "media", URL: "youtu.be/dQw4w9WgXcQ"}}}, false},
		{"stored attachment card", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", Type: "media", URL: "/api/v1/attachments/11111111-1111-1111-1111-111111111111/11111111-1111-1111-1111-111111111111.png"}}}, true},
		{"protocol relative card", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", Type: "media", URL: "//example.com/cat.png"}}}, false},
		{"traversal card", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", Type: "media", URL: "/api/v1/attachments/../secret"}}}, false},
		{"unknown node type", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "card", Type: "group"}}}, false},
		{"dangling edge", Input{Title: "Map", Kind: "canvas", Edges: []Edge{{From: "missing", To: "other"}}}, false},
		{"anchored edge", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "a", Type: "text", Text: "A"}, {ID: "b", Type: "text", Text: "B"}}, Edges: []Edge{{From: "a", To: "b", FromSide: "right", ToSide: "left"}}}, true},
		{"unknown edge anchor", Input{Title: "Map", Kind: "canvas", Nodes: []Node{{ID: "a", Type: "text", Text: "A"}, {ID: "b", Type: "text", Text: "B"}}, Edges: []Edge{{From: "a", To: "b", FromSide: "center"}}}, false},
		{"invalid sort", Input{Title: "Base", Kind: "base", Sort: "sql"}, false},
	}
	for _, scenario := range cases {
		testingContext.Run(scenario.name, func(testingContext *testing.T) {
			if (validate(scenario.input) == nil) != scenario.valid {
				testingContext.Fatal("unexpected validation result")
			}
		})
	}
}
