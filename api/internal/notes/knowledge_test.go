package notes_test

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
	"net/url"
	"os"
	"personal-life/api/internal/notes"
	"personal-life/api/internal/server"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestKnowledgeTransactions(testingContext *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		testingContext.Skip("TEST_DATABASE_URL required; run migrations first")
	}
	parsed, failure := url.Parse(databaseURL)
	if failure != nil || !strings.HasSuffix(parsed.Path, "_test") {
		testingContext.Fatal("requires isolated _test database")
	}
	requestContext := context.Background()
	pool, failure := pgxpool.New(requestContext, databaseURL)
	if failure != nil {
		testingContext.Fatal(failure)
	}
	defer pool.Close()
	schema := fmt.Sprintf("knowledge_%d", time.Now().UnixNano())
	schemaSQL := pgx.Identifier{schema}.Sanitize()
	if _, failure = pool.Exec(requestContext, "CREATE SCHEMA "+schemaSQL); failure != nil {
		testingContext.Fatal(failure)
	}
	defer func() {
		if _, failure := pool.Exec(requestContext, "DROP SCHEMA "+schemaSQL+" CASCADE"); failure != nil {
			testingContext.Error(failure)
		}
	}()
	parameters := parsed.Query()
	parameters.Set("search_path", schema)
	parsed.RawQuery = parameters.Encode()
	if failure = server.Migrate(requestContext, parsed.String()); failure != nil {
		testingContext.Fatal(failure)
	}
	isolatedPool, failure := pgxpool.New(requestContext, parsed.String())
	if failure != nil {
		testingContext.Fatal(failure)
	}
	defer isolatedPool.Close()
	service := notes.Service{Pool: isolatedPool}
	testTypedMetadata(testingContext, requestContext, isolatedPool, service)
	var legacyID string
	if failure = isolatedPool.QueryRow(requestContext, "INSERT INTO notes(title,kind,content) VALUES('Legacy note','note','[[Legacy destination]]') RETURNING id").Scan(&legacyID); failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.BackfillLinks(requestContext); failure != nil {
		testingContext.Fatal(failure)
	}
	legacyLinks, failure := notes.ListLinks(requestContext, isolatedPool, legacyID, false)
	if failure != nil || len(legacyLinks) != 1 {
		testingContext.Fatal("legacy index was not backfilled", failure)
	}
	if failure = service.BackfillLinks(requestContext); failure != nil {
		testingContext.Fatal(failure)
	}
	repeatedLinks, failure := notes.ListLinks(requestContext, isolatedPool, legacyID, false)
	if failure != nil || len(repeatedLinks) != 1 || repeatedLinks[0].ID != legacyLinks[0].ID {
		testingContext.Fatal("backfill was not resumable/idempotent", failure)
	}
	root, failure := service.SaveFolder(requestContext, "", notes.FolderInput{Name: "Knowledge test root"})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	child, failure := service.SaveFolder(requestContext, "", notes.FolderInput{Name: "Child", ParentID: &root.ID})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	if _, failure = service.SaveFolder(requestContext, root.ID, notes.FolderInput{Name: root.Name, ParentID: &child.ID}); failure == nil {
		testingContext.Fatal("cycle accepted")
	}
	target, failure := service.Save(requestContext, "", notes.Input{Title: "Knowledge test target", Kind: "note", FolderID: &child.ID})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	source, failure := service.Save(requestContext, "", notes.Input{Title: "Knowledge test source", Kind: "note", Content: "[[Knowledge test target|alias]] [[Future test note]]"})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	target.Title = "Knowledge test renamed"
	if _, failure = service.Save(requestContext, target.ID, target.Input); failure != nil {
		testingContext.Fatal(failure)
	}
	source.Content += "\nMore text"
	if _, failure = service.Save(requestContext, source.ID, source.Input); failure != nil {
		testingContext.Fatal(failure)
	}
	links, failure := notes.ListLinks(requestContext, isolatedPool, source.ID, false)
	if failure != nil || len(links) != 2 || links[0].TargetNoteID == nil || *links[0].TargetNoteID != target.ID {
		testingContext.Fatalf("rename broke identity: %#v %v", links, failure)
	}
	if _, failure = service.Save(requestContext, "", notes.Input{Title: "Future test note", Kind: "note"}); failure != nil {
		testingContext.Fatal(failure)
	}
	links, failure = notes.ListLinks(requestContext, isolatedPool, source.ID, false)
	if failure != nil || links[1].TargetNoteID == nil {
		testingContext.Fatal("unresolved link was not resolved", failure)
	}
	if failure = service.Trash(requestContext, target.ID, false); failure != nil {
		testingContext.Fatal(failure)
	}
	if _, failure = notes.Get(requestContext, isolatedPool, target.ID); failure == nil {
		testingContext.Fatal("trashed note is still active")
	}
	replacement, failure := service.Save(requestContext, "", notes.Input{Title: target.Title, Kind: "note"})
	if failure != nil {
		testingContext.Fatal("trashed title prevented new note", failure)
	}
	if failure = service.Trash(requestContext, target.ID, true); failure == nil {
		testingContext.Fatal("restore overwrote a conflicting title")
	}
	replacement.Title = "Replacement note"
	if _, failure = service.Save(requestContext, replacement.ID, replacement.Input); failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.Trash(requestContext, target.ID, true); failure != nil {
		testingContext.Fatal(failure)
	}
	restored, failure := notes.Get(requestContext, isolatedPool, target.ID)
	if failure != nil || restored.ID != target.ID {
		testingContext.Fatal("restore changed identity", failure)
	}
	invalidFolder := "00000000-0000-0000-0000-000000000000"
	source.FolderID = &invalidFolder
	source.Content = "must roll back"
	if _, failure = service.Save(requestContext, source.ID, source.Input); failure == nil {
		testingContext.Fatal("invalid folder accepted")
	}
	unchanged, failure := notes.Get(requestContext, isolatedPool, source.ID)
	if failure != nil || unchanged.Content == source.Content {
		testingContext.Fatal("failed transaction changed content", failure)
	}
	if failure = service.DeleteFolder(requestContext, root.ID); failure == nil {
		testingContext.Fatal("nonempty folder deleted")
	}
	source.FolderID = nil
	source.Content = "Quantum orchard [[Knowledge test target]]"
	if _, failure = service.Save(requestContext, source.ID, source.Input); failure != nil {
		testingContext.Fatal(failure)
	}
	matches, failure := notes.Search(requestContext, isolatedPool, "quantum orchard")
	if failure != nil || len(matches) != 1 || matches[0].ID != source.ID {
		testingContext.Fatalf("indexed search failed: %#v %v", matches, failure)
	}
	if failure = service.Trash(requestContext, source.ID, false); failure != nil {
		testingContext.Fatal(failure)
	}
	matches, failure = notes.Search(requestContext, isolatedPool, "quantum")
	if failure != nil || len(matches) != 0 {
		testingContext.Fatal("search exposed trash", failure)
	}
	if failure = service.Purge(requestContext, &target.ID); failure == nil {
		testingContext.Fatal("permanent deletion accepted an active note")
	}
	canvas, failure := service.Save(requestContext, "", notes.Input{Title: "Deletion canvas", Kind: "canvas", Nodes: []notes.Node{{ID: "target", NoteID: target.ID, X: 1, Y: 1}}})
	if failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.Trash(requestContext, target.ID, false); failure != nil {
		testingContext.Fatal(failure)
	}
	if failure = service.Purge(requestContext, &target.ID); failure != nil {
		testingContext.Fatal(failure)
	}
	canvas, failure = notes.Get(requestContext, isolatedPool, canvas.ID)
	if failure != nil || len(canvas.Nodes) != 0 {
		testingContext.Fatal("permanent deletion left canvas references", failure)
	}
	if failure = service.Purge(requestContext, nil); failure != nil {
		testingContext.Fatal(failure)
	}
	trash, failure := notes.List(requestContext, isolatedPool, true)
	if failure != nil || len(trash) != 0 {
		testingContext.Fatal("empty trash failed", failure)
	}
}
