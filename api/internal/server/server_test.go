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
	"personal-life/api/internal/nutrition"
	"personal-life/api/internal/server"
)

type stubFoods struct{}

func (stubFoods) Product(_ context.Context, barcode string) (nutrition.Product, error) {
	if barcode != "8412345678902" {
		return nutrition.Product{}, nutrition.ErrProductNotFound
	}
	return nutrition.Product{
		Barcode:        "8412345678902",
		Name:           "Yogur importado",
		Brand:          "Marca OFF",
		BaseQuantity:   100,
		BaseUnit:       "g",
		CaloriesKcal:   59,
		ProteinG:       10,
		Micronutrients: map[string]float64{"calcium_mg": 110},
	}, nil
}

func (stubFoods) Search(context.Context, string) ([]nutrition.Product, error) {
	return []nutrition.Product{{
		Barcode:      "8412345678902",
		Name:         "Yogur importado",
		BaseQuantity: 100,
		BaseUnit:     "g",
		CaloriesKcal: 59,
	}}, nil
}

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
	if _, operationError := pool.Exec(context.Background(), "TRUNCATE users,projects,labels,notes,foods,recipes,meal_plans,shopping_items CASCADE"); operationError != nil {
		testingContext.Fatal(operationError)
	}
	if operationError := server.Provision(context.Background(), pool, "owner", "a-long-test-password"); operationError != nil {
		testingContext.Fatal(operationError)
	}
	handler := server.New(pool, server.Config{Origin: "http://localhost:5173", SecureCookies: false, OpenFoodFactsClient: stubFoods{}})
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
	firstPlanItemID := func(body json.RawMessage) string {
		testingContext.Helper()
		var value struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
		}
		if operationError := json.Unmarshal(body, &value); operationError != nil {
			testingContext.Fatal(operationError)
		}
		if len(value.Items) == 0 {
			testingContext.Fatal("plan returned no items")
		}
		return value.Items[0].ID
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
	request("GET", "/api/v1/nutrition/profile", "", 200)
	profile := request("PUT", "/api/v1/nutrition/profile", `{"weight_kg":72.5,"height_cm":178,"age":34,"sex":"male","activity_level":"light","goal":"lose","target_calories":2100,"target_protein_g":150,"target_carbs_g":200,"target_fat_g":70,"target_fiber_g":30,"target_water_ml":2500,"target_mode":"manual"}`, 200)
	if !bytes.Contains(profile, []byte(`"target_calories":2100`)) {
		testingContext.Fatal("nutrition profile did not persist")
	}
	request("PUT", "/api/v1/nutrition/profile", `{"sex":"unknown"}`, 422)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/profile", "", 200), []byte(`"sex":"male"`)) {
		testingContext.Fatal("invalid nutrition profile edit was not rolled back")
	}
	autoProfile := request("PUT", "/api/v1/nutrition/profile", `{"weight_kg":80,"height_cm":180,"age":30,"sex":"male","activity_level":"moderate","goal":"lose","target_mode":"auto"}`, 200)
	if !bytes.Contains(autoProfile, []byte(`"target_calories":2345`)) {
		testingContext.Fatal("auto nutrition targets were not calculated")
	}
	foodID := idOf(request("POST", "/api/v1/nutrition/foods", `{"name":"Greek yogurt","brand":"Example","barcode":"8412345678901","base_quantity":100,"base_unit":"g","calories_kcal":59,"protein_g":10,"carbs_g":3.6,"fat_g":0.4,"fiber_g":0,"sugar_g":3.6,"saturated_fat_g":0.1,"salt_g":0.1,"sodium_mg":40,"micronutrients":{"calcium_mg":110},"favorite":true}`, 201))
	request("POST", "/api/v1/nutrition/foods", `{"name":"greek YOGURT","brand":"example","base_unit":"g"}`, 409)
	request("POST", "/api/v1/nutrition/foods", `{"name":"Bad unit","base_unit":"kg"}`, 422)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/foods?q=yogurt", "", 200), []byte(foodID)) {
		testingContext.Fatal("food name search did not match")
	}
	if !bytes.Contains(request("GET", "/api/v1/nutrition/foods?q=8412345678901", "", 200), []byte(foodID)) {
		testingContext.Fatal("food barcode search did not match")
	}
	if !bytes.Contains(request("GET", "/api/v1/nutrition/foods?favorite=true", "", 200), []byte(foodID)) {
		testingContext.Fatal("favorite filter did not include food")
	}
	request("PATCH", "/api/v1/nutrition/foods/"+foodID, `{"favorite":false}`, 200)
	if bytes.Contains(request("GET", "/api/v1/nutrition/foods?favorite=true", "", 200), []byte(foodID)) {
		testingContext.Fatal("favorite filter did not honor removal")
	}
	request("PATCH", "/api/v1/nutrition/foods/"+foodID, `{"sodium_mg":-1}`, 422)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/foods/"+foodID, "", 200), []byte(`"sodium_mg":40`)) {
		testingContext.Fatal("invalid food edit was not rolled back")
	}
	request("DELETE", "/api/v1/nutrition/foods/"+foodID, "", 204)
	request("GET", "/api/v1/nutrition/foods/"+foodID, "", 404)
	lookup := request("GET", "/api/v1/nutrition/foods/lookup?barcode=8412345678902", "", 200)
	if !bytes.Contains(lookup, []byte(`"name":"Yogur importado"`)) {
		testingContext.Fatal("product lookup did not normalize the product")
	}
	request("GET", "/api/v1/nutrition/foods/lookup?barcode=0000000000000", "", 404)
	request("GET", "/api/v1/nutrition/foods/lookup", "", 422)
	remote := request("GET", "/api/v1/nutrition/foods/openfoodfacts?q=yogur", "", 200)
	if !bytes.Contains(remote, []byte(`"barcode":"8412345678902"`)) {
		testingContext.Fatal("remote search did not return the product")
	}
	imported := request("POST", "/api/v1/nutrition/foods/import", `{"barcode":"8412345678902"}`, 201)
	if !bytes.Contains(imported, []byte(`"source":"openfoodfacts"`)) {
		testingContext.Fatal("imported food did not record its source")
	}
	request("POST", "/api/v1/nutrition/foods/import", `{"barcode":"8412345678902"}`, 409)
	request("POST", "/api/v1/nutrition/foods/import", `{"barcode":"abc"}`, 422)
	importedID := idOf(imported)
	request("GET", "/api/v1/nutrition/diary?date=2026-09-16", "", 200)
	diary := request("POST", "/api/v1/nutrition/diary", `{"entry_date":"2026-09-16","meal":"lunch","food_id":"`+importedID+`","quantity":150,"unit":"g"}`, 201)
	entryID := idOf(diary)
	if !bytes.Contains(diary, []byte(`"calories_kcal":88.5`)) {
		testingContext.Fatal("diary entry did not freeze the scaled snapshot")
	}
	if !bytes.Contains(request("GET", "/api/v1/nutrition/diary?date=2026-09-16", "", 200), []byte(`"calories_kcal":88.5`)) {
		testingContext.Fatal("diary day did not aggregate the entry")
	}
	request("PATCH", "/api/v1/nutrition/diary/"+entryID, `{"quantity":100}`, 200)
	request("PATCH", "/api/v1/nutrition/diary/"+entryID, `{"meal":"brunch"}`, 422)
	request("PUT", "/api/v1/nutrition/diary/water", `{"entry_date":"2026-09-16","water_ml":1500}`, 200)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/diary?date=2026-09-16", "", 200), []byte(`"water_ml":1500`)) {
		testingContext.Fatal("water intake did not persist")
	}
	request("GET", "/api/v1/nutrition/diary?date=16/09/2026", "", 422)
	request("POST", "/api/v1/nutrition/diary", `{"entry_date":"2026-09-16","meal":"lunch","food_id":"`+importedID+`","quantity":0}`, 422)
	request("DELETE", "/api/v1/nutrition/diary/"+entryID, "", 204)
	request("DELETE", "/api/v1/nutrition/diary/"+entryID, "", 404)
	recipe := request("POST", "/api/v1/nutrition/recipes", `{"name":"Bol de yogur","description":"Mezclar","prep_minutes":5,"servings":2,"tags":["desayuno"],"ingredients":[{"food_id":"`+importedID+`","quantity":200}]}`, 201)
	recipeID := idOf(recipe)
	if !bytes.Contains(recipe, []byte(`"calories_kcal":118`)) {
		testingContext.Fatal("recipe totals were not computed from ingredients")
	}
	if !bytes.Contains(request("GET", "/api/v1/nutrition/recipes?q=bol", "", 200), []byte(recipeID)) {
		testingContext.Fatal("recipe search did not match")
	}
	request("POST", "/api/v1/nutrition/recipes", `{"name":"Sin comida","servings":1,"ingredients":[{"food_id":"00000000-0000-0000-0000-000000000000","quantity":10}]}`, 422)
	request("POST", "/api/v1/nutrition/recipes", `{"name":"Mal","servings":0}`, 422)
	cooked := request("POST", "/api/v1/nutrition/recipes/"+recipeID+"/cook", `{"entry_date":"2026-09-17","meal":"breakfast","servings":2}`, 201)
	if !bytes.Contains(cooked, []byte(`"label":"Bol de yogur"`)) || !bytes.Contains(cooked, []byte(`"calories_kcal":118`)) {
		testingContext.Fatal("cooking a recipe did not log its nutrition")
	}
	request("POST", "/api/v1/nutrition/recipes/"+recipeID+"/cook", `{"entry_date":"2026-09-17","meal":"brunch"}`, 422)
	request("PATCH", "/api/v1/nutrition/recipes/"+recipeID, `{"servings":1}`, 200)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/recipes/"+recipeID, "", 200), []byte(`"servings":1`)) {
		testingContext.Fatal("recipe edit did not persist")
	}
	plan := request("POST", "/api/v1/nutrition/plans", `{"name":"Semana tipo","week_start":"2026-09-16","is_template":false}`, 201)
	planID := idOf(plan)
	if !bytes.Contains(plan, []byte(`"week_start":"2026-09-14"`)) {
		testingContext.Fatal("plan week was not normalized to Monday")
	}
	request("POST", "/api/v1/nutrition/plans", `{"name":"Duplicada","week_start":"2026-09-14","is_template":false}`, 409)
	request("POST", "/api/v1/nutrition/plans", `{"name":"Mala","week_start":"2026-09-14","is_template":true}`, 422)
	planWithItem := request("POST", "/api/v1/nutrition/plans/"+planID+"/items", `{"day_index":0,"meal":"lunch","recipe_id":"`+recipeID+`","quantity":1}`, 201)
	if !bytes.Contains(planWithItem, []byte(`"label":"Bol de yogur"`)) {
		testingContext.Fatal("plan item did not resolve the recipe")
	}
	itemID := firstPlanItemID(planWithItem)
	request("PATCH", "/api/v1/nutrition/plans/"+planID+"/items/"+itemID, `{"quantity":2}`, 200)
	logged := request("POST", "/api/v1/nutrition/plans/"+planID+"/log", `{"day_index":0,"meal":"lunch"}`, 200)
	if !bytes.Contains(logged, []byte(`"logged":1`)) || !bytes.Contains(logged, []byte(`"entry_date":"2026-09-14"`)) {
		testingContext.Fatal("plan day was not logged to the expected date")
	}
	request("POST", "/api/v1/nutrition/plans/"+planID+"/log", `{"day_index":0,"meal":"lunch"}`, 200)
	day := request("GET", "/api/v1/nutrition/diary?date=2026-09-14", "", 200)
	if bytes.Count(day, []byte(`"plan_item_id":"`+itemID+`"`)) != 1 {
		testingContext.Fatal("logging the same plan meal twice was not idempotent")
	}
	request("PATCH", "/api/v1/nutrition/plans/"+planID+"/items/"+itemID, `{"day_index":1}`, 200)
	if bytes.Contains(request("GET", "/api/v1/nutrition/diary?date=2026-09-14", "", 200), []byte(`"plan_item_id":"`+itemID+`"`)) {
		testingContext.Fatal("moving a planned item left its previous diary entry behind")
	}
	request("POST", "/api/v1/nutrition/plans/"+planID+"/log", `{"day_index":1,"meal":"lunch"}`, 200)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/diary?date=2026-09-15", "", 200), []byte(`"plan_item_id":"`+itemID+`"`)) {
		testingContext.Fatal("moved planned item was not logged on the new day")
	}
	target := request("POST", "/api/v1/nutrition/plans/"+planID+"/copy", `{"week_start":"2026-09-21"}`, 200)
	if !bytes.Contains(target, []byte(`"week_start":"2026-09-21"`)) {
		testingContext.Fatal("plan copy did not create the target week")
	}
	targetID := idOf(target)
	targetItemID := firstPlanItemID(target)
	request("POST", "/api/v1/nutrition/plans/"+targetID+"/log", `{"day_index":1,"meal":"lunch"}`, 200)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/diary?date=2026-09-22", "", 200), []byte(`"plan_item_id":"`+targetItemID+`"`)) {
		testingContext.Fatal("copied plan item was not logged")
	}
	request("POST", "/api/v1/nutrition/plans/"+planID+"/copy", `{"week_start":"2026-09-21"}`, 200)
	if bytes.Contains(request("GET", "/api/v1/nutrition/diary?date=2026-09-22", "", 200), []byte(`"plan_item_id":"`+targetItemID+`"`)) {
		testingContext.Fatal("copying over a week left stale diary entries")
	}
	if !bytes.Contains(request("POST", "/api/v1/nutrition/plans/"+planID+"/copy", `{"is_template":true,"name":"Copia plantilla"}`, 200), []byte(`"is_template":true`)) {
		testingContext.Fatal("saving a week as template failed")
	}
	request("POST", "/api/v1/nutrition/plans/"+planID+"/copy", `{"is_template":true}`, 422)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/plans?week=2026-09-14", "", 200), []byte(planID)) {
		testingContext.Fatal("plan for the week was not retrievable")
	}
	template := request("POST", "/api/v1/nutrition/plans", `{"name":"Plantilla base","is_template":true}`, 201)
	templateID := idOf(template)
	request("POST", "/api/v1/nutrition/plans/"+templateID+"/items", `{"day_index":5,"meal":"dinner","food_id":"`+importedID+`","quantity":150}`, 201)
	if !bytes.Contains(request("GET", "/api/v1/nutrition/plans?template=true", "", 200), []byte(templateID)) {
		testingContext.Fatal("template list did not include the template")
	}
	request("POST", "/api/v1/nutrition/plans/"+templateID+"/log", `{"day_index":5,"meal":"dinner"}`, 422)
	request("POST", "/api/v1/nutrition/plans/"+templateID+"/log", `{"day_index":5,"meal":"dinner","date":"2026-09-19"}`, 200)
	request("POST", "/api/v1/nutrition/plans/"+templateID+"/copy", `{"week_start":"2026-09-28"}`, 200)
	generated := request("POST", "/api/v1/nutrition/shopping/generate", `{"plan_id":"`+planID+`"}`, 200)
	if !bytes.Contains(generated, []byte(`"label":"Yogur importado"`)) || !bytes.Contains(generated, []byte(`"quantity":400`)) {
		testingContext.Fatal("shopping generation did not aggregate plan ingredients")
	}
	shoppingItem := request("POST", "/api/v1/nutrition/shopping/items", `{"label":"Pan","quantity":1,"unit":"unit"}`, 201)
	shoppingID := idOf(shoppingItem)
	request("PATCH", "/api/v1/nutrition/shopping/"+shoppingID, `{"checked":true}`, 200)
	request("DELETE", "/api/v1/nutrition/shopping/checked", "", 204)
	if bytes.Contains(request("GET", "/api/v1/nutrition/shopping", "", 200), []byte(shoppingID)) {
		testingContext.Fatal("checked shopping items were not cleared")
	}
	request("POST", "/api/v1/nutrition/shopping/items", `{"label":"Sal","quantity":1,"unit":"unit"}`, 201)
	recipeGenerated := request("POST", "/api/v1/nutrition/shopping/generate", `{"recipe_ids":["`+recipeID+`"]}`, 200)
	if !bytes.Contains(recipeGenerated, []byte(`"label":"Sal"`)) {
		testingContext.Fatal("regeneration removed manual shopping items")
	}
	if !bytes.Contains(recipeGenerated, []byte(`"source":"recipe"`)) {
		testingContext.Fatal("regeneration did not mark the recipe source")
	}
	request("POST", "/api/v1/nutrition/shopping/generate", `{}`, 422)
	request("DELETE", "/api/v1/nutrition/plans/"+planID, "", 204)
	request("DELETE", "/api/v1/nutrition/foods/"+importedID, "", 422)
	request("DELETE", "/api/v1/nutrition/recipes/"+recipeID, "", 204)
	request("GET", "/api/v1/nutrition/recipes/"+recipeID, "", 404)
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
