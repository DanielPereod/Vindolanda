package notes_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/notes"
)

func testTypedMetadata(testingContext *testing.T, requestContext context.Context, pool *pgxpool.Pool, service notes.Service) {
	testingContext.Helper()
	note, failure := service.Save(requestContext, "", notes.Input{Title: "Typed metadata", Kind: "note", Content: "#programming/go `#ignored`", Properties: map[string]string{"Legacy status": "active"}})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	properties, failure := notes.ListNoteProperties(requestContext, pool, note.ID)
	if failure != nil || len(properties) != 1 || string(properties[0].Value) != `"active"` {
		testingContext.Fatal("legacy property did not migrate", failure)
	}
	priority, failure := service.SaveProperty(requestContext, "", notes.PropertyInput{Name: "Priority", Type: "number"})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.SetProperty(requestContext, note.ID, priority.ID, json.RawMessage(`3`), false); failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.SetProperty(requestContext, note.ID, priority.ID, json.RawMessage(`"wrong"`), false); failure == nil {
		testingContext.Fatal("invalid number accepted")
	}
	if _, failure = service.SaveProperty(requestContext, priority.ID, notes.PropertyInput{Name: "Urgency", Type: "number"}); failure != nil {
		testingContext.Fatal(failure)
	}
	renamed, failure := notes.Get(requestContext, pool, note.ID)
	if failure != nil || renamed.Properties["Urgency"] != "3" || renamed.Properties["Priority"] != "" {
		testingContext.Fatal("rename lost value or stale search projection", failure)
	}
	if _, failure = service.SaveProperty(requestContext, priority.ID, notes.PropertyInput{Name: "Must roll back", Type: "boolean"}); failure == nil {
		testingContext.Fatal("invalid type change accepted")
	}
	note.Properties = nil
	note.Content = "#programming/rust"
	if _, failure = service.Save(requestContext, note.ID, note.Input); failure != nil {
		testingContext.Fatal(failure)
	}
	retained, failure := notes.Get(requestContext, pool, note.ID)
	if failure != nil || retained.Properties["Urgency"] != "3" {
		testingContext.Fatal("content autosave erased typed properties", failure)
	}
	labels, failure := service.SaveProperty(requestContext, "", notes.PropertyInput{Name: "Topics", Type: "tag"})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.SetProperty(requestContext, note.ID, labels.ID, json.RawMessage(`["research/math"]`), false); failure != nil {
		testingContext.Fatal(failure)
	}
	tags, failure := notes.ListTags(requestContext, pool)
	if failure != nil {
		testingContext.Fatal(failure)
	}
	counts := make(map[string]int)
	for _, tag := range tags {
		counts[tag.Name] = tag.Count
	}
	if counts["programming"] != 1 || counts["programming/rust"] != 1 || counts["programming/go"] != 0 || counts["research/math"] != 1 || counts["research"] != 1 || counts["ignored"] != 0 {
		testingContext.Fatalf("wrong tag index: %#v", counts)
	}
	relation, failure := service.SaveProperty(requestContext, "", notes.PropertyInput{Name: "Related", Type: "relation"})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.SetProperty(requestContext, note.ID, relation.ID, json.RawMessage(`"00000000-0000-0000-0000-000000000000"`), false); failure == nil {
		testingContext.Fatal("dangling relation accepted")
	}
	if failure = service.DeleteProperty(requestContext, priority.ID); failure == nil {
		testingContext.Fatal("used definition deleted without removing assignments")
	}
	if failure = service.SetProperty(requestContext, note.ID, priority.ID, nil, true); failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.DeleteProperty(requestContext, priority.ID); failure != nil {
		testingContext.Fatal(failure)
	}
}
