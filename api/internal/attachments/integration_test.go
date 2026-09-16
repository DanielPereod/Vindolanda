package attachments_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"net/url"
	"os"
	"personal-life/api/internal/attachments"
	"personal-life/api/internal/server"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pngBytes is a valid PNG signature long enough for content sniffing.
func pngBytes() []byte {
	return append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{0}, 64)...)
}

func multipartRequest(handler http.Handler, origin, field, filename, contentType string, data []byte) *httptest.ResponseRecorder {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	headers := textproto.MIMEHeader{}
	headers.Set("Content-Disposition", fmt.Sprintf(`form-data; name=%q; filename=%q`, field, filename))
	if contentType != "" {
		headers.Set("Content-Type", contentType)
	}
	part, failure := writer.CreatePart(headers)
	if failure != nil {
		panic(failure)
	}
	if _, failure := part.Write(data); failure != nil {
		panic(failure)
	}
	if failure := writer.Close(); failure != nil {
		panic(failure)
	}
	request := httptest.NewRequest("POST", "/api/v1/attachments", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func TestAttachmentsRoundTrip(testingContext *testing.T) {
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
	schema := fmt.Sprintf("attachments_%d", time.Now().UnixNano())
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
	router := chi.NewRouter()
	router.Route("/api/v1", func(api chi.Router) {
		attachments.Register(api, isolatedPool)
	})

	image := pngBytes()
	recorded := multipartRequest(router, "", "file", "pixel.png", "image/png", image)
	if recorded.Code != http.StatusCreated {
		testingContext.Fatalf("upload: got %d want 201: %s", recorded.Code, recorded.Body.String())
	}
	var stored attachments.Attachment
	if failure := json.Unmarshal(recorded.Body.Bytes(), &stored); failure != nil {
		testingContext.Fatal(failure)
	}
	if stored.ContentType != "image/png" || stored.Size != len(image) || stored.Filename != "pixel.png" {
		testingContext.Fatalf("unexpected metadata %#v", stored)
	}
	if !strings.HasPrefix(stored.URL, "/api/v1/attachments/"+stored.ID+"/") || !strings.HasSuffix(stored.URL, ".png") {
		testingContext.Fatalf("unexpected URL %q", stored.URL)
	}
	download := httptest.NewRecorder()
	router.ServeHTTP(download, httptest.NewRequest("GET", stored.URL, nil))
	if download.Code != http.StatusOK {
		testingContext.Fatalf("download: got %d want 200", download.Code)
	}
	if !bytes.Equal(download.Body.Bytes(), image) {
		testingContext.Fatal("download body differs from upload")
	}
	if download.Header().Get("Content-Type") != "image/png" || !strings.HasPrefix(download.Header().Get("Cache-Control"), "private") || !strings.HasPrefix(download.Header().Get("Content-Disposition"), "inline") {
		testingContext.Fatalf("unexpected headers %#v", download.Header())
	}

	if rejected := multipartRequest(router, "", "file", "notes.txt", "text/plain", []byte("not an image")); rejected.Code != http.StatusUnprocessableEntity {
		testingContext.Fatalf("text upload: got %d want 422", rejected.Code)
	}
	if rejected := multipartRequest(router, "", "file", "empty.png", "image/png", nil); rejected.Code != http.StatusUnprocessableEntity {
		testingContext.Fatalf("empty upload: got %d want 422", rejected.Code)
	}
	missing := httptest.NewRecorder()
	router.ServeHTTP(missing, httptest.NewRequest("GET", "/attachments/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.png", nil))
	if missing.Code != http.StatusNotFound {
		testingContext.Fatalf("missing attachment: got %d want 404", missing.Code)
	}

	// The protected composition enforces the session and trusted-origin policy.
	secured := server.New(isolatedPool, server.Config{Origin: "http://localhost:5173", SecureCookies: false})
	if code := multipartRequest(secured, "http://localhost:5173", "file", "pixel.png", "image/png", image).Code; code != http.StatusUnauthorized {
		testingContext.Fatalf("unauthenticated upload: got %d want 401", code)
	}
	if code := multipartRequest(secured, "http://evil.example", "file", "pixel.png", "image/png", image).Code; code != http.StatusForbidden {
		testingContext.Fatalf("untrusted origin upload: got %d want 403", code)
	}

	// Rename only changes the display name; the URL and bytes stay stable.
	renamed := jsonRequest(router, "PUT", "/api/v1/attachments/"+stored.ID, `{"filename":"renamed.png"}`)
	if renamed.Code != http.StatusOK {
		testingContext.Fatalf("rename: got %d want 200: %s", renamed.Code, renamed.Body.String())
	}
	var afterRename attachments.Attachment
	if failure := json.Unmarshal(renamed.Body.Bytes(), &afterRename); failure != nil {
		testingContext.Fatal(failure)
	}
	if afterRename.Filename != "renamed.png" || afterRename.URL != stored.URL {
		testingContext.Fatalf("rename changed identity: %#v", afterRename)
	}
	if rejected := jsonRequest(router, "PUT", "/api/v1/attachments/"+stored.ID, `{"filename":"../"}`); rejected.Code != http.StatusUnprocessableEntity {
		testingContext.Fatalf("invalid rename: got %d want 422", rejected.Code)
	}
	if !containsAttachment(listAttachments(testingContext, router, false), stored.ID) {
		testingContext.Fatal("active list is missing the upload")
	}

	// Trash hides the URL, restore brings it back and permanent delete removes it.
	if code := jsonRequest(router, "DELETE", "/api/v1/attachments/"+stored.ID, "").Code; code != http.StatusNoContent {
		testingContext.Fatalf("trash: got %d want 204", code)
	}
	if containsAttachment(listAttachments(testingContext, router, false), stored.ID) {
		testingContext.Fatal("trashed attachment is still active")
	}
	if !containsAttachment(listAttachments(testingContext, router, true), stored.ID) {
		testingContext.Fatal("trashed attachment is missing from the trash")
	}
	if blocked := get(router, stored.URL); blocked.Code != http.StatusNotFound {
		testingContext.Fatalf("trashed download: got %d want 404", blocked.Code)
	}
	if code := jsonRequest(router, "POST", "/api/v1/attachments/"+stored.ID+"/restore", "").Code; code != http.StatusNoContent {
		testingContext.Fatalf("restore: got %d want 204", code)
	}
	if restored := get(router, stored.URL); restored.Code != http.StatusOK || !bytes.Equal(restored.Body.Bytes(), image) {
		testingContext.Fatalf("restored download: got %d", restored.Code)
	}
	if code := jsonRequest(router, "POST", "/api/v1/attachments/"+stored.ID+"/restore", "").Code; code != http.StatusNotFound {
		testingContext.Fatalf("restore of active attachment: got %d want 404", code)
	}
	if code := jsonRequest(router, "DELETE", "/api/v1/attachments/"+stored.ID+"/permanent", "").Code; code != http.StatusNotFound {
		testingContext.Fatalf("purge of active attachment: got %d want 404", code)
	}
	if code := jsonRequest(router, "DELETE", "/api/v1/attachments/"+stored.ID, "").Code; code != http.StatusNoContent {
		testingContext.Fatalf("second trash: got %d want 204", code)
	}
	if code := jsonRequest(router, "DELETE", "/api/v1/attachments/"+stored.ID+"/permanent", "").Code; code != http.StatusNoContent {
		testingContext.Fatalf("permanent delete: got %d want 204", code)
	}
	if containsAttachment(listAttachments(testingContext, router, true), stored.ID) {
		testingContext.Fatal("permanently deleted attachment is still in the trash")
	}

	// Emptying the trash removes every remaining trashed row.
	for _, name := range []string{"one.png", "two.png"} {
		multipartRequest(router, "", "file", name, "image/png", image)
	}
	remaining := listAttachments(testingContext, router, false)
	if len(remaining) != 2 {
		testingContext.Fatalf("expected two active attachments, got %d", len(remaining))
	}
	for _, attachment := range remaining {
		if code := jsonRequest(router, "DELETE", "/api/v1/attachments/"+attachment.ID, "").Code; code != http.StatusNoContent {
			testingContext.Fatalf("trash before empty: got %d want 204", code)
		}
	}
	if code := jsonRequest(router, "DELETE", "/api/v1/attachments/trash", "").Code; code != http.StatusNoContent {
		testingContext.Fatalf("empty trash: got %d want 204", code)
	}
	if len(listAttachments(testingContext, router, true)) != 0 {
		testingContext.Fatal("trash was not emptied")
	}
}

func get(handler http.Handler, path string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("GET", path, nil))
	return recorder
}

func jsonRequest(handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func listAttachments(testingContext *testing.T, handler http.Handler, deleted bool) []attachments.Attachment {
	testingContext.Helper()
	path := "/api/v1/attachments"
	if deleted {
		path += "?deleted=true"
	}
	recorder := get(handler, path)
	if recorder.Code != http.StatusOK {
		testingContext.Fatalf("list attachments: got %d want 200: %s", recorder.Code, recorder.Body.String())
	}
	var values []attachments.Attachment
	if failure := json.Unmarshal(recorder.Body.Bytes(), &values); failure != nil {
		testingContext.Fatal(failure)
	}
	return values
}

func containsAttachment(values []attachments.Attachment, identifier string) bool {
	for _, value := range values {
		if value.ID == identifier {
			return true
		}
	}
	return false
}
