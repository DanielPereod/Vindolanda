package nutrition

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

const (
	defaultFoodLimit = 50
	maxFoodLimit     = 200
)

func registerFoods(router chi.Router, pool *pgxpool.Pool, client OpenFoodFactsClient) {
	router.Get("/nutrition/foods", func(writer http.ResponseWriter, request *http.Request) { listFoods(writer, request, pool) })
	router.Post("/nutrition/foods", func(writer http.ResponseWriter, request *http.Request) { saveFood(writer, request, pool, false) })
	router.Get("/nutrition/foods/lookup", func(writer http.ResponseWriter, request *http.Request) { lookupProduct(writer, request, client) })
	router.Get("/nutrition/foods/openfoodfacts", func(writer http.ResponseWriter, request *http.Request) { searchProducts(writer, request, client) })
	router.Post("/nutrition/foods/import", func(writer http.ResponseWriter, request *http.Request) { importProduct(writer, request, pool, client) })
	router.Get("/nutrition/foods/{id}", func(writer http.ResponseWriter, request *http.Request) {
		value, operationError := GetFood(request.Context(), pool, chi.URLParam(request, "id"))
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, value)
	})
	router.Patch("/nutrition/foods/{id}", func(writer http.ResponseWriter, request *http.Request) { saveFood(writer, request, pool, true) })
	router.Delete("/nutrition/foods/{id}", func(writer http.ResponseWriter, request *http.Request) {
		_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
			if operationError := DeleteFood(request.Context(), transaction, chi.URLParam(request, "id")); operationError != nil {
				return false, operationError
			}
			return true, nil
		})
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		writer.WriteHeader(204)
	})
}

func listFoods(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	query := request.URL.Query()
	favoritesOnly := false
	switch query.Get("favorite") {
	case "", "false":
	case "true":
		favoritesOnly = true
	default:
		core.Fail(writer, core.Invalid("Invalid favorite filter"))
		return
	}
	limit := defaultFoodLimit
	if raw := query.Get("limit"); raw != "" {
		parsed, operationError := strconv.Atoi(raw)
		if operationError != nil || parsed < 1 || parsed > maxFoodLimit {
			core.Fail(writer, core.Invalid("Invalid limit"))
			return
		}
		limit = parsed
	}
	offset := 0
	if raw := query.Get("offset"); raw != "" {
		parsed, operationError := strconv.Atoi(raw)
		if operationError != nil || parsed < 0 {
			core.Fail(writer, core.Invalid("Invalid offset"))
			return
		}
		offset = parsed
	}
	values, operationError := ListFoods(request.Context(), pool, query.Get("q"), favoritesOnly, limit, offset)
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, values)
}

func saveFood(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool, editing bool) {
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Food, error) {
		input := FoodInput{BaseUnit: "g", BaseQuantity: 100}
		identifier := chi.URLParam(request, "id")
		if editing {
			current, operationError := GetFood(request.Context(), transaction, identifier)
			if operationError != nil {
				return Food{}, operationError
			}
			input = current.FoodInput
		}
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			return Food{}, operationError
		}
		input.Barcode = normalizeBarcode(input.Barcode)
		if operationError := validateFood(input); operationError != nil {
			return Food{}, operationError
		}
		if editing {
			return UpdateFood(request.Context(), transaction, identifier, input)
		}
		return CreateFood(request.Context(), transaction, input)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	status := 201
	if editing {
		status = 200
	}
	core.Write(writer, status, value)
}

func lookupProduct(writer http.ResponseWriter, request *http.Request, client OpenFoodFactsClient) {
	barcode, operationError := parseBarcode(request.URL.Query().Get("barcode"))
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	product, operationError := client.Product(request.Context(), *barcode)
	if errors.Is(operationError, ErrProductNotFound) {
		core.Fail(writer, core.Error{Status: 404, Message: "Product not found"})
		return
	}
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, product)
}

func searchProducts(writer http.ResponseWriter, request *http.Request, client OpenFoodFactsClient) {
	query := strings.TrimSpace(request.URL.Query().Get("q"))
	if query == "" {
		core.Fail(writer, core.Invalid("Search text is required"))
		return
	}
	products, operationError := client.Search(request.Context(), query)
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, products)
}

func importProduct(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool, client OpenFoodFactsClient) {
	var input struct {
		Barcode string `json:"barcode"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	barcode, operationError := parseBarcode(input.Barcode)
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	product, operationError := client.Product(request.Context(), *barcode)
	if errors.Is(operationError, ErrProductNotFound) {
		core.Fail(writer, core.Error{Status: 404, Message: "Product not found"})
		return
	}
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Food, error) {
		return ImportFood(request.Context(), transaction, product)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 201, value)
}
