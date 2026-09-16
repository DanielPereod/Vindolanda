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
}
