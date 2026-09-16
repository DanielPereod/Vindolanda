package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/server"
)

func TestMVP(testingContext *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		testingContext.Skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
	}
	parsedURL, operationError := url.Parse(databaseURL)
	if operationError != nil || !strings.HasSuffix(parsedURL.Path, "_test") {
		testingContext.Fatal("integration database name must end in _test")
	}
	pool, operationError := pgxpool.New(context.Background(), databaseURL)
	if operationError != nil {
		testingContext.Fatal(operationError)
	}
	defer pool.Close()
	if operationError := server.Migrate(context.Background(), databaseURL); operationError != nil {
		testingContext.Fatal(operationError)
	}
	if _, operationError := pool.Exec(context.Background(), "TRUNCATE users,projects,labels,notes CASCADE"); operationError != nil {
		testingContext.Fatal(operationError)
	}
	if operationError := server.Provision(context.Background(), pool, "owner", "a-long-test-password"); operationError != nil {
		testingContext.Fatal(operationError)
	}
	handler := server.New(pool, server.Config{Origin: "http://localhost:5173", SecureCookies: false})
	var cookie *http.Cookie
	request := func(method, path, body string, expected int) json.RawMessage {
		testingContext.Helper()
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Origin", "http://localhost:5173")
		req.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		result := httptest.NewRecorder()
		handler.ServeHTTP(result, req)
		if result.Code != expected {
			testingContext.Fatalf("%s %s: got %d want %d: %s", method, path, result.Code, expected, result.Body.String())
		}
		for _, received := range result.Result().Cookies() {
			cookie = received
		}
		return result.Body.Bytes()
	}
	idOf := func(body json.RawMessage) string {
		testingContext.Helper()
		var value struct {
			ID string `json:"id"`
		}
		if operationError := json.Unmarshal(body, &value); operationError != nil {
			testingContext.Fatal(operationError)
		}
		return value.ID
	}
	request("GET", "/api/v1/tasks", "", 401)
	request("GET", "/api/v1/notes", "", 401)
	request("POST", "/api/v1/auth/login", `{"username":"owner","password":"wrong"}`, 401)
	request("POST", "/api/v1/auth/login", `{"username":"owner","password":"a-long-test-password"}`, 200)
	if cookie == nil || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		testingContext.Fatal("session cookie must be HttpOnly and SameSite=Strict")
	}
	request("GET", "/api/v1/auth/me", "", 200)
	noteID := idOf(request("POST", "/api/v1/notes", `{"title":"Reference","kind":"note","content":"## Hello","properties":{"Status":"Active"}}`, 201))
	request("POST", "/api/v1/notes", `{"title":"reference","kind":"note"}`, 409)
	request("POST", "/api/v1/notes", `{"title":"Bad","kind":"unknown"}`, 422)
	request("PUT", "/api/v1/notes/"+noteID, `{"title":"Reference","kind":"note","content":"## Updated","properties":{"Status":"Active"}}`, 200)
	baseID := idOf(request("POST", "/api/v1/notes", `{"title":"Active notes","kind":"base","filter":"Active","sort":"title"}`, 201))
	request("POST", "/api/v1/notes", `{"title":"Broken map","kind":"canvas","nodes":[{"id":"missing","note_id":"00000000-0000-0000-0000-000000000000","x":0,"y":0}]}`, 422)
	canvasID := idOf(request("POST", "/api/v1/notes", `{"title":"Map","kind":"canvas","nodes":[{"id":"first","note_id":"`+noteID+`","x":40,"y":60},{"id":"second","note_id":"`+noteID+`","x":400,"y":60}],"edges":[{"from":"first","to":"second"}]}`, 201))
	documents := request("GET", "/api/v1/notes", "", 200)
	for _, identifier := range []string{noteID, baseID, canvasID} {
		if !bytes.Contains(documents, []byte(identifier)) {
			testingContext.Fatal("document did not persist")
		}
	}
	linkedTaskID := idOf(request("POST", "/api/v1/tasks", `{"title":"Read reference","note_ids":["`+noteID+`"]}`, 201))
	request("PATCH", "/api/v1/tasks/"+linkedTaskID, `{"title":"Read reference again"}`, 200)
	if !bytes.Contains(request("GET", "/api/v1/tasks/"+linkedTaskID, "", 200), []byte(noteID)) {
		testingContext.Fatal("partial task edit lost note association")
	}
	duplicate := request("POST", "/api/v1/tasks/"+linkedTaskID+"/duplicate", `{}`, 201)
	if !bytes.Contains(duplicate, []byte(noteID)) {
		testingContext.Fatal("duplicate lost note association")
	}
	request("PATCH", "/api/v1/tasks/"+linkedTaskID, `{"note_ids":["00000000-0000-0000-0000-000000000000"]}`, 422)
	if !bytes.Contains(request("GET", "/api/v1/tasks/"+linkedTaskID, "", 200), []byte(noteID)) {
		testingContext.Fatal("failed link edit was not rolled back")
	}
	request("PATCH", "/api/v1/tasks/"+linkedTaskID, `{"note_ids":[]}`, 200)
	if bytes.Contains(request("GET", "/api/v1/tasks/"+linkedTaskID, "", 200), []byte(noteID)) {
		testingContext.Fatal("unlink did not persist")
	}
	projectID := idOf(request("POST", "/api/v1/projects", `{"name":"Home","color":"#15836b"}`, 201))
	sectionID := idOf(request("POST", "/api/v1/sections", `{"name":"Next","project_id":"`+projectID+`"}`, 201))
	labelID := idOf(request("POST", "/api/v1/labels", `{"name":"errands","color":"#15836b"}`, 201))
	taskID := idOf(request("POST", "/api/v1/tasks", `{"title":"Buy milk","project_id":"`+projectID+`","section_id":"`+sectionID+`","priority":1,"due_date":"2026-09-15","due_time":"18:30","label_ids":["`+labelID+`"]}`, 201))
	childID := idOf(request("POST", "/api/v1/tasks", `{"title":"Check fridge","parent_task_id":"`+taskID+`","project_id":"`+projectID+`","section_id":"`+sectionID+`"}`, 201))
	request("PATCH", "/api/v1/tasks/"+taskID, `{"parent_task_id":"`+childID+`"}`, 422)
	request("POST", "/api/v1/tasks/"+childID+"/complete", `{}`, 200)
	var parent struct {
		Status string `json:"status"`
	}
	if operationError := json.Unmarshal(request("GET", "/api/v1/tasks/"+taskID, "", 200), &parent); operationError != nil {
		testingContext.Fatal(operationError)
	}
	if parent.Status != "pending" {
		testingContext.Fatal("child completion completed parent")
	}
	request("POST", "/api/v1/tasks/"+childID+"/uncomplete", `{}`, 200)
	request("PATCH", "/api/v1/tasks/"+taskID, `{"priority":5}`, 422)
	request("PATCH", "/api/v1/tasks/"+taskID, `{"due_date":"2026-02-30"}`, 422)
	request("PATCH", "/api/v1/tasks/"+taskID, `{"due_date":null}`, 422)
	request("PATCH", "/api/v1/tasks/"+taskID, `{"title":"Milk and bread"}`, 200)
	searchResult := request("GET", "/api/v1/search?q=bread", "", 200)
	if !bytes.Contains(searchResult, []byte(taskID)) {
		testingContext.Fatal("search did not match task title")
	}
	noMatches := request("GET", "/api/v1/search?q=nonexistent-search-phrase", "", 200)
	if string(bytes.TrimSpace(noMatches)) != "[]" {
		testingContext.Fatal("search returned unrelated tasks")
	}
	otherProjectID := idOf(request("POST", "/api/v1/projects", `{"name":"Other"}`, 201))
	request("PATCH", "/api/v1/projects/"+projectID, `{"parent_project_id":"`+otherProjectID+`"}`, 200)
	request("PATCH", "/api/v1/projects/"+otherProjectID, `{"parent_project_id":"`+projectID+`"}`, 422)
	request("POST", "/api/v1/tasks", `{"title":"Wrong section","project_id":"`+otherProjectID+`","section_id":"`+sectionID+`"}`, 422)
	request("POST", "/api/v1/tasks", `{"title":"Must roll back","label_ids":["00000000-0000-0000-0000-000000000000"]}`, 422)
	if string(bytes.TrimSpace(request("GET", "/api/v1/search?q=Must%20roll%20back", "", 200))) != "[]" {
		testingContext.Fatal("failed label creation persisted task")
	}
	request("DELETE", "/api/v1/projects/"+otherProjectID, "", 204)

	request("GET", "/api/v1/tasks?label="+labelID, "", 200)
	request("GET", "/api/v1/views/inbox", "", 200)
	request("GET", "/api/v1/views/today", "", 200)
	request("GET", "/api/v1/views/upcoming?days=14", "", 200)
	request("GET", "/api/v1/views/completed", "", 200)
	request("PATCH", "/api/v1/tasks/"+taskID+"/move", `{"project_id":null,"section_id":null}`, 200)
	var child struct {
		ProjectID *string `json:"project_id"`
	}
	if operationError := json.Unmarshal(request("GET", "/api/v1/tasks/"+childID, "", 200), &child); operationError != nil {
		testingContext.Fatal(operationError)
	}
	if child.ProjectID != nil {
		testingContext.Fatal("moving parent must move subtree")
	}
	request("POST", "/api/v1/tasks/"+taskID+"/complete", `{}`, 200)
	request("POST", "/api/v1/tasks/"+taskID+"/complete", `{}`, 409)
	request("GET", "/api/v1/tasks/"+taskID+"/history", "", 200)
	request("POST", "/api/v1/tasks/"+taskID+"/uncomplete", `{}`, 200)
	request("POST", "/api/v1/tasks/"+taskID+"/duplicate", `{}`, 201)
	request("PATCH", "/api/v1/tasks/"+taskID+"/reorder", `{"before_id":"`+childID+`"}`, 422)
	request("PATCH", "/api/v1/projects/"+projectID+"/reorder", `{}`, 200)
	request("PATCH", "/api/v1/sections/"+sectionID+"/reorder", `{}`, 200)
	request("DELETE", "/api/v1/sections/"+sectionID, "", 204)
	request("DELETE", "/api/v1/projects/"+projectID, "", 204)
	request("DELETE", "/api/v1/labels/"+labelID, "", 204)
	request("PUT", "/api/v1/settings", `{"accent_color":"#ffff00"}`, 422)
	accentSettings := request("PUT", "/api/v1/settings", `{"accent_color":"#7c3aed"}`, 200)
	if !bytes.Contains(accentSettings, []byte(`"accent_color":"#7c3aed"`)) {
		testingContext.Fatal("accent color did not persist")
	}
	request("PUT", "/api/v1/settings", `{"timezone":"Invalid/Timezone"}`, 422)
	request("PUT", "/api/v1/settings", `{"timezone":"Pacific/Kiritimati"}`, 200)
	var localToday string
	if operationError := pool.QueryRow(context.Background(), "SELECT ((now() AT TIME ZONE 'Pacific/Kiritimati')::date)::text").Scan(&localToday); operationError != nil {
		testingContext.Fatal(operationError)
	}
	todayID := idOf(request("POST", "/api/v1/tasks", `{"title":"Timezone today","due_date":"`+localToday+`"}`, 201))
	if !bytes.Contains(request("GET", "/api/v1/views/today", "", 200), []byte(todayID)) {
		testingContext.Fatal("today ignored account timezone")
	}
	if !bytes.Contains(request("GET", "/api/v1/views/upcoming?days=7", "", 200), []byte(todayID)) {
		testingContext.Fatal("upcoming missed today")
	}
	request("GET", "/api/v1/views/upcoming?days=6", "", 422)
	siblingID := idOf(request("POST", "/api/v1/tasks", `{"title":"Sibling"}`, 201))
	request("PATCH", "/api/v1/tasks/"+siblingID+"/reorder", `{"before_id":"`+todayID+`"}`, 200)
	inbox := request("GET", "/api/v1/views/inbox", "", 200)
	if bytes.Index(inbox, []byte(siblingID)) > bytes.Index(inbox, []byte(todayID)) {
		testingContext.Fatal("manual reorder did not persist")
	}
	request("DELETE", "/api/v1/tasks/"+taskID, "", 204)
	request("GET", "/api/v1/tasks/"+childID, "", 404)

	req := httptest.NewRequest("POST", "/api/v1/tasks", bytes.NewBufferString(`{"title":"CSRF"}`))
	req.Header.Set("Origin", "https://attacker.example")
	req.AddCookie(cookie)
	result := httptest.NewRecorder()
	handler.ServeHTTP(result, req)
	if result.Code != 403 {
		testingContext.Fatal("cross-origin mutation accepted")
	}
	request("PUT", "/api/v1/auth/password", `{"current_password":"a-long-test-password","new_password":"a-new-long-password"}`, 204)
	request("GET", "/api/v1/auth/me", "", 401)
	request("POST", "/api/v1/auth/login", `{"username":"owner","password":"a-new-long-password"}`, 200)
	request("DELETE", "/api/v1/auth/sessions", "", 204)
	request("GET", "/api/v1/auth/me", "", 401)
	request("POST", "/api/v1/auth/login", `{"username":"owner","password":"a-new-long-password"}`, 200)
	request("POST", "/api/v1/auth/logout", `{}`, 204)
	request("GET", "/api/v1/auth/me", "", 401)
}
