package nutrition

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

const recipePage = `<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Blog"},{"@type":"Recipe","name":"Tortilla de patatas","description":"Clásica","recipeYield":4,"totalTime":"PT45M","keywords":"española, fácil","recipeIngredient":["6 huevos","300 g de patatas","1 cebolla","Aceite de oliva"]}]}
</script></head><body><h1>Tortilla</h1></body></html>`

func TestParseRecipeDocumentFromGraph(testingContext *testing.T) {
	imported, operationError := parseRecipeDocument([]byte(recipePage), "https://example.com/tortilla")
	if operationError != nil {
		testingContext.Fatal(operationError)
	}
	if imported.Name != "Tortilla de patatas" || imported.Description != "Clásica" {
		testingContext.Fatalf("unexpected identity: %+v", imported)
	}
	if imported.PrepMinutes != 45 || imported.Servings != 4 {
		testingContext.Fatalf("unexpected time or servings: %+v", imported)
	}
	if len(imported.Tags) != 2 || imported.Tags[0] != "española" || imported.Tags[1] != "fácil" {
		testingContext.Fatalf("unexpected tags: %+v", imported.Tags)
	}
	if len(imported.Ingredients) != 4 {
		testingContext.Fatalf("unexpected ingredients: %+v", imported.Ingredients)
	}
	egg := imported.Ingredients[0]
	if egg.Quantity != 6 || egg.Unit != "" || egg.Name != "huevos" {
		testingContext.Fatalf("unexpected non-metric ingredient: %+v", egg)
	}
	potatoes := imported.Ingredients[1]
	if potatoes.Quantity != 300 || potatoes.Unit != "g" || potatoes.Name != "patatas" {
		testingContext.Fatalf("unexpected metric ingredient: %+v", potatoes)
	}
	oil := imported.Ingredients[3]
	if oil.Quantity != 0 || oil.Name != "Aceite de oliva" {
		testingContext.Fatalf("unexpected text ingredient: %+v", oil)
	}
}

func TestParseRecipeDocumentFractionsAndStringYield(testingContext *testing.T) {
	page := `<script type="application/ld+json">{"@type":"Recipe","name":"Porridge","recipeYield":"6 raciones","prepTime":"PT10M","recipeIngredient":["½ taza de avena","1 1/2 cucharadas de miel","2/3 de taza de leche"]}</script>`
	imported, operationError := parseRecipeDocument([]byte(page), "https://example.com/porridge")
	if operationError != nil {
		testingContext.Fatal(operationError)
	}
	if imported.Servings != 6 || imported.PrepMinutes != 10 {
		testingContext.Fatalf("unexpected yield or time: %+v", imported)
	}
	oats := imported.Ingredients[0]
	if oats.Quantity != 0.5 || oats.Unit != "taza" || oats.Name != "avena" {
		testingContext.Fatalf("unexpected unicode fraction: %+v", oats)
	}
	honey := imported.Ingredients[1]
	if honey.Quantity != 1.5 || honey.Unit != "cucharadas" || honey.Name != "miel" {
		testingContext.Fatalf("unexpected mixed fraction: %+v", honey)
	}
	milk := imported.Ingredients[2]
	if milk.Quantity != 0.67 || milk.Unit != "taza" || milk.Name != "leche" {
		testingContext.Fatalf("unexpected vulgar fraction with 'de': %+v", milk)
	}
}

func TestParseRecipeDocumentWithoutRecipe(testingContext *testing.T) {
	page := `<html><body><p>Sin datos</p><script type="application/ld+json">{"@type":"Article","name":"Noticias"}</script></body></html>`
	if _, operationError := parseRecipeDocument([]byte(page), "https://example.com/news"); !errors.Is(operationError, ErrRecipeNotFound) {
		testingContext.Fatalf("expected not found, got %v", operationError)
	}
}

func TestRecipeImportClientFetchesPage(testingContext *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("User-Agent") != "personal-life-test/1.0" {
			testingContext.Errorf("missing user agent: %q", request.Header.Get("User-Agent"))
		}
		writer.Header().Set("Content-Type", "text/html")
		_, _ = writer.Write([]byte(recipePage))
	}))
	defer server.Close()
	client := newRecipeImportClient("personal-life-test/1.0")
	client.http = server.Client()
	imported, operationError := client.Recipe(context.Background(), server.URL+"/tortilla")
	if operationError != nil {
		testingContext.Fatal(operationError)
	}
	if imported.Name != "Tortilla de patatas" || imported.SourceURL != server.URL+"/tortilla" {
		testingContext.Fatalf("unexpected import: %+v", imported)
	}
}

func TestRecipeImportClientRejectsUnsupportedURL(testingContext *testing.T) {
	client := newRecipeImportClient("personal-life-test/1.0")
	for _, source := range []string{"", "ftp://example.com/receta", "https://", "javascript:alert(1)"} {
		if _, operationError := client.Recipe(context.Background(), source); operationError == nil {
			testingContext.Fatalf("expected %q to be rejected", source)
		}
	}
}

func TestRecipeImportClientRejectsNetworkFailure(testingContext *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	client := newRecipeImportClient("personal-life-test/1.0")
	client.http = server.Client()
	if _, operationError := client.Recipe(context.Background(), server.URL); operationError == nil {
		testingContext.Fatal("expected upstream failure")
	}
}

func TestGuardedAddressRejectsPrivateNetworks(testingContext *testing.T) {
	blocked := []string{"127.0.0.1", "10.0.0.1", "192.168.1.10", "172.16.0.1", "169.254.1.1", "::1", "fd00::1", "fe80::1", "0.0.0.0"}
	for _, candidate := range blocked {
		if isPublicAddress(net.ParseIP(candidate)) {
			testingContext.Fatalf("expected %s to be blocked", candidate)
		}
	}
	for _, candidate := range []string{"8.8.8.8", "1.1.1.1", "2606:4700::1111"} {
		if !isPublicAddress(net.ParseIP(candidate)) {
			testingContext.Fatalf("expected %s to be allowed", candidate)
		}
	}
}
