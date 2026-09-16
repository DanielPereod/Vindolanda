package nutrition

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"personal-life/api/internal/core"
)

// ErrProductNotFound reports a barcode absent from Open Food Facts.
var ErrProductNotFound = errors.New("open food facts product not found")

const (
	openFoodFactsBaseURL = "https://world.openfoodfacts.org"
	// maxResponseBytes bounds an upstream response before it is decoded.
	maxResponseBytes = 1 << 20
)

// OpenFoodFactsClient fetches products and search results from Open Food Facts.
type OpenFoodFactsClient interface {
	Product(context.Context, string) (Product, error)
	Search(context.Context, string) ([]Product, error)
}

// Product is the normalized Open Food Facts representation used for import.
type Product struct {
	Barcode        string             `json:"barcode"`
	Name           string             `json:"name"`
	Brand          string             `json:"brand"`
	BaseQuantity   float64            `json:"base_quantity"`
	BaseUnit       string             `json:"base_unit"`
	CaloriesKcal   float64            `json:"calories_kcal"`
	ProteinG       float64            `json:"protein_g"`
	CarbsG         float64            `json:"carbs_g"`
	FatG           float64            `json:"fat_g"`
	FiberG         float64            `json:"fiber_g"`
	SugarG         float64            `json:"sugar_g"`
	SaturatedFatG  float64            `json:"saturated_fat_g"`
	SaltG          float64            `json:"salt_g"`
	SodiumMg       float64            `json:"sodium_mg"`
	Micronutrients map[string]float64 `json:"micronutrients"`
}

type offProduct struct {
	Code          string         `json:"code"`
	ProductName   string         `json:"product_name"`
	ProductNameEs string         `json:"product_name_es"`
	GenericName   string         `json:"generic_name"`
	Brands        string         `json:"brands"`
	Nutriments    map[string]any `json:"nutriments"`
}

type offProductResponse struct {
	Status  int        `json:"status"`
	Product offProduct `json:"product"`
}

type offSearchResponse struct {
	Products []offProduct `json:"products"`
}

type openFoodFactsClient struct {
	baseURL   string
	userAgent string
	http      *http.Client
}

// NewOpenFoodFactsClient returns the production client with a descriptive user agent.
func NewOpenFoodFactsClient(userAgent string) OpenFoodFactsClient {
	if strings.TrimSpace(userAgent) == "" {
		userAgent = "personal-life/0.1 (personal nutrition tracker)"
	}
	return newOpenFoodFactsClient(openFoodFactsBaseURL, userAgent)
}

func newOpenFoodFactsClient(baseURL, userAgent string) *openFoodFactsClient {
	return &openFoodFactsClient{
		baseURL:   strings.TrimRight(baseURL, "/"),
		userAgent: userAgent,
		http:      &http.Client{Timeout: 8 * time.Second},
	}
}

func (client *openFoodFactsClient) Product(requestContext context.Context, barcode string) (Product, error) {
	endpoint := fmt.Sprintf("%s/api/v2/product/%s.json", client.baseURL, url.PathEscape(barcode))
	var payload offProductResponse
	if operationError := client.fetch(requestContext, endpoint, &payload); operationError != nil {
		return Product{}, operationError
	}
	if payload.Status == 0 || strings.TrimSpace(payload.Product.Code) == "" {
		return Product{}, ErrProductNotFound
	}
	return normalizeProduct(payload.Product), nil
}

func (client *openFoodFactsClient) Search(requestContext context.Context, query string) ([]Product, error) {
	parameters := url.Values{}
	parameters.Set("search_terms", query)
	parameters.Set("search_simple", "1")
	parameters.Set("action", "process")
	parameters.Set("json", "1")
	parameters.Set("page_size", "20")
	parameters.Set("fields", "code,product_name,product_name_es,generic_name,brands,nutriments")
	endpoint := client.baseURL + "/cgi/search.pl?" + parameters.Encode()
	var payload offSearchResponse
	if operationError := client.fetch(requestContext, endpoint, &payload); operationError != nil {
		return nil, operationError
	}
	products := make([]Product, 0, len(payload.Products))
	for _, raw := range payload.Products {
		if strings.TrimSpace(raw.Code) == "" {
			continue
		}
		product := normalizeProduct(raw)
		if strings.TrimSpace(product.Name) == "" {
			continue
		}
		products = append(products, product)
	}
	return products, nil
}

func (client *openFoodFactsClient) fetch(requestContext context.Context, endpoint string, target any) error {
	request, operationError := http.NewRequestWithContext(requestContext, http.MethodGet, endpoint, nil)
	if operationError != nil {
		return operationError
	}
	request.Header.Set("User-Agent", client.userAgent)
	request.Header.Set("Accept", "application/json")
	response, operationError := client.http.Do(request)
	if operationError != nil {
		return core.Error{Status: 502, Message: "Open Food Facts is unavailable"}
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return ErrProductNotFound
	}
	if response.StatusCode != http.StatusOK {
		return core.Error{Status: 502, Message: "Open Food Facts returned an unexpected response"}
	}
	if operationError := json.NewDecoder(io.LimitReader(response.Body, maxResponseBytes)).Decode(target); operationError != nil {
		return core.Error{Status: 502, Message: "Open Food Facts returned unreadable data"}
	}
	return nil
}

func normalizeProduct(raw offProduct) Product {
	nutrients := raw.Nutriments
	calories := number(nutrients, "energy-kcal_100g")
	if calories == 0 {
		calories = number(nutrients, "energy_100g") / 4.184
	}
	return Product{
		Barcode:        strings.TrimSpace(raw.Code),
		Name:           strings.TrimSpace(firstNonEmpty(raw.ProductNameEs, raw.ProductName, raw.GenericName)),
		Brand:          strings.TrimSpace(raw.Brands),
		BaseQuantity:   100,
		BaseUnit:       "g",
		CaloriesKcal:   round2(calories),
		ProteinG:       round2(number(nutrients, "proteins_100g")),
		CarbsG:         round2(number(nutrients, "carbohydrates_100g")),
		FatG:           round2(number(nutrients, "fat_100g")),
		FiberG:         round2(number(nutrients, "fiber_100g")),
		SugarG:         round2(number(nutrients, "sugars_100g")),
		SaturatedFatG:  round2(number(nutrients, "saturated-fat_100g")),
		SaltG:          round2(number(nutrients, "salt_100g")),
		SodiumMg:       round2(number(nutrients, "sodium_100g") * 1000),
		Micronutrients: micronutrients(nutrients),
	}
}

// microNutrientSources maps Open Food Facts gram values to catalog milligram entries.
var microNutrientSources = map[string]string{
	"calcium_100g":     "calcium_mg",
	"iron_100g":        "iron_mg",
	"magnesium_100g":   "magnesium_mg",
	"zinc_100g":        "zinc_mg",
	"potassium_100g":   "potassium_mg",
	"vitamin-c_100g":   "vitamin_c_mg",
	"vitamin-e_100g":   "vitamin_e_mg",
	"vitamin-b12_100g": "vitamin_b12_mg",
}

func micronutrients(nutrients map[string]any) map[string]float64 {
	values := map[string]float64{}
	for source, target := range microNutrientSources {
		if amount := number(nutrients, source); amount > 0 {
			values[target] = round2(amount * 1000)
		}
	}
	return values
}

func number(values map[string]any, key string) float64 {
	raw, present := values[key]
	if !present {
		return 0
	}
	switch typed := raw.(type) {
	case float64:
		return typed
	case json.Number:
		parsed, operationError := typed.Float64()
		if operationError == nil {
			return parsed
		}
	case string:
		parsed, operationError := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if operationError == nil {
			return parsed
		}
	}
	return 0
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func round2(value float64) float64 {
	if value == 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return math.Round(value*100) / 100
}

// input converts a normalized product into a catalog input.
func (product Product) input() FoodInput {
	barcode := product.Barcode
	return FoodInput{
		Name:           product.Name,
		Brand:          product.Brand,
		Barcode:        &barcode,
		BaseQuantity:   product.BaseQuantity,
		BaseUnit:       product.BaseUnit,
		CaloriesKcal:   product.CaloriesKcal,
		ProteinG:       product.ProteinG,
		CarbsG:         product.CarbsG,
		FatG:           product.FatG,
		FiberG:         product.FiberG,
		SugarG:         product.SugarG,
		SaturatedFatG:  product.SaturatedFatG,
		SaltG:          product.SaltG,
		SodiumMg:       product.SodiumMg,
		Micronutrients: product.Micronutrients,
	}
}

// ImportFood validates a fetched product and stores it as an Open Food Facts food.
func ImportFood(requestContext context.Context, database core.Database, product Product) (Food, error) {
	input := product.input()
	if operationError := validateFood(input); operationError != nil {
		return Food{}, operationError
	}
	return createFood(requestContext, database, input, "openfoodfacts")
}
