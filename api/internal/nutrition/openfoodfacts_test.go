package nutrition

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

const productPayload = `{"status":1,"product":{"code":"8412345678901","product_name":"Yogur griego","product_name_es":"Yogur griego natural","brands":"Marca Ejemplo","nutriments":{"energy-kcal_100g":59,"proteins_100g":10,"carbohydrates_100g":3.6,"fat_100g":0.4,"fiber_100g":0,"sugars_100g":3.6,"saturated-fat_100g":0.1,"salt_100g":0.1,"sodium_100g":0.04,"calcium_100g":0.11}}}`

func TestOpenFoodFactsProduct(testingContext *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/v2/product/8412345678901.json" {
			writer.WriteHeader(404)
			return
		}
		if request.Header.Get("User-Agent") != "personal-life-test/1.0" {
			testingContext.Errorf("missing user agent: %q", request.Header.Get("User-Agent"))
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(productPayload))
	}))
	defer server.Close()
	client := newOpenFoodFactsClient(server.URL, "personal-life-test/1.0")
	product, operationError := client.Product(context.Background(), "8412345678901")
	if operationError != nil {
		testingContext.Fatal(operationError)
	}
	if product.Name != "Yogur griego natural" || product.Brand != "Marca Ejemplo" {
		testingContext.Fatalf("unexpected identity: %+v", product)
	}
	if product.BaseQuantity != 100 || product.BaseUnit != "g" {
		testingContext.Fatalf("unexpected base portion: %+v", product)
	}
	if !closeEnough(product.CaloriesKcal, 59) || !closeEnough(product.ProteinG, 10) {
		testingContext.Fatalf("unexpected macros: %+v", product)
	}
	if !closeEnough(product.SodiumMg, 40) {
		testingContext.Fatalf("sodium not converted to milligrams: %v", product.SodiumMg)
	}
	if !closeEnough(product.Micronutrients["calcium_mg"], 110) {
		testingContext.Fatalf("calcium not converted to milligrams: %v", product.Micronutrients)
	}
}

func TestOpenFoodFactsProductNotFound(testingContext *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(404)
	}))
	defer server.Close()
	client := newOpenFoodFactsClient(server.URL, "personal-life-test/1.0")
	_, operationError := client.Product(context.Background(), "0000000000000")
	if !errors.Is(operationError, ErrProductNotFound) {
		testingContext.Fatalf("expected not found, got %v", operationError)
	}
}

func TestOpenFoodFactsSearch(testingContext *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/cgi/search.pl" || request.URL.Query().Get("search_terms") != "yogur" {
			writer.WriteHeader(400)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"products":[{"code":"8412345678901","product_name":"Yogur natural","brands":"Marca","nutriments":{"energy-kcal_100g":59}},{"code":"","product_name":"","nutriments":{}}]}`))
	}))
	defer server.Close()
	client := newOpenFoodFactsClient(server.URL, "personal-life-test/1.0")
	products, operationError := client.Search(context.Background(), "yogur")
	if operationError != nil {
		testingContext.Fatal(operationError)
	}
	if len(products) != 1 {
		testingContext.Fatalf("expected one usable product, got %d", len(products))
	}
	if products[0].Barcode != "8412345678901" || !closeEnough(products[0].CaloriesKcal, 59) {
		testingContext.Fatalf("unexpected search result: %+v", products[0])
	}
}

func TestOpenFoodFactsSearchRejectsNetworkFailure(testingContext *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(500)
	}))
	defer server.Close()
	client := newOpenFoodFactsClient(server.URL, "personal-life-test/1.0")
	if _, operationError := client.Search(context.Background(), "yogur"); operationError == nil {
		testingContext.Fatal("expected upstream failure")
	}
}

func TestOpenFoodFactsProductRejectsNetworkFailure(testingContext *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	client := newOpenFoodFactsClient(server.URL, "personal-life-test/1.0")
	if _, operationError := client.Product(context.Background(), "8412345678901"); operationError == nil {
		testingContext.Fatal("expected upstream failure")
	}
}
