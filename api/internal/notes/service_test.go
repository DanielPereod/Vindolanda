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
		{"dangling edge", Input{Title: "Map", Kind: "canvas", Edges: []Edge{{From: "missing", To: "other"}}}, false},
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
