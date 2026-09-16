package nutrition

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

func registerRecipes(router chi.Router, pool *pgxpool.Pool) {
	router.Get("/nutrition/recipes", func(writer http.ResponseWriter, request *http.Request) {
		values, operationError := ListRecipes(request.Context(), pool, request.URL.Query().Get("q"))
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, values)
	})
	router.Post("/nutrition/recipes", func(writer http.ResponseWriter, request *http.Request) { saveRecipe(writer, request, pool, false) })
	router.Get("/nutrition/recipes/{id}", func(writer http.ResponseWriter, request *http.Request) {
		value, operationError := GetRecipe(request.Context(), pool, chi.URLParam(request, "id"))
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, value)
	})
	router.Patch("/nutrition/recipes/{id}", func(writer http.ResponseWriter, request *http.Request) { saveRecipe(writer, request, pool, true) })
	router.Delete("/nutrition/recipes/{id}", func(writer http.ResponseWriter, request *http.Request) {
		_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
			if operationError := DeleteRecipe(request.Context(), transaction, chi.URLParam(request, "id")); operationError != nil {
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
	router.Post("/nutrition/recipes/{id}/cook", func(writer http.ResponseWriter, request *http.Request) { cookRecipe(writer, request, pool) })
}

func saveRecipe(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool, editing bool) {
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Recipe, error) {
		input := RecipeInput{Servings: 1}
		identifier := chi.URLParam(request, "id")
		if editing {
			current, operationError := GetRecipe(request.Context(), transaction, identifier)
			if operationError != nil {
				return Recipe{}, operationError
			}
			input = RecipeInput{
				Name:        current.Name,
				Description: current.Description,
				PrepMinutes: current.PrepMinutes,
				Servings:    current.Servings,
				Tags:        current.Tags,
				Favorite:    current.Favorite,
				Ingredients: ingredientsFromRecipe(current.Ingredients),
			}
		}
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			return Recipe{}, operationError
		}
		if operationError := validateRecipe(input); operationError != nil {
			return Recipe{}, operationError
		}
		if input.Tags == nil {
			input.Tags = []string{}
		}
		resolved, operationError := resolveIngredients(request.Context(), transaction, input.Ingredients)
		if operationError != nil {
			return Recipe{}, operationError
		}
		if editing {
			return UpdateRecipe(request.Context(), transaction, identifier, input, resolved)
		}
		return CreateRecipe(request.Context(), transaction, input, resolved)
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

func cookRecipe(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		EntryDate string  `json:"entry_date"`
		Meal      string  `json:"meal"`
		Servings  float64 `json:"servings"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if input.Servings == 0 {
		input.Servings = 1
	}
	if operationError := validateDiaryUpdate(input.EntryDate, input.Meal, input.Servings); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (DiaryEntry, error) {
		recipe, operationError := GetRecipe(request.Context(), transaction, chi.URLParam(request, "id"))
		if operationError != nil {
			return DiaryEntry{}, operationError
		}
		return CreateDiaryEntry(request.Context(), transaction, CookedEntry(recipe, input.EntryDate, input.Meal, input.Servings))
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 201, value)
}

func resolveIngredients(requestContext context.Context, database core.Database, inputs []RecipeIngredientInput) ([]RecipeIngredientInput, error) {
	resolved := make([]RecipeIngredientInput, 0, len(inputs))
	for _, input := range inputs {
		if !core.ValidID(input.FoodID) {
			return nil, core.Invalid("Invalid ingredient food")
		}
		food, operationError := GetFood(requestContext, database, input.FoodID)
		if errors.Is(operationError, pgx.ErrNoRows) {
			return nil, core.Invalid("Unknown ingredient food")
		}
		if operationError != nil {
			return nil, operationError
		}
		if operationError := validateRecipeIngredient(input, food); operationError != nil {
			return nil, operationError
		}
		resolved = append(resolved, RecipeIngredientInput{
			FoodID:   food.ID,
			Quantity: input.Quantity,
			Unit:     food.BaseUnit,
			Note:     strings.TrimSpace(input.Note),
		})
	}
	return resolved, nil
}

func ingredientsFromRecipe(ingredients []RecipeIngredient) []RecipeIngredientInput {
	inputs := make([]RecipeIngredientInput, 0, len(ingredients))
	for _, ingredient := range ingredients {
		inputs = append(inputs, RecipeIngredientInput{
			FoodID:   ingredient.FoodID,
			Quantity: ingredient.Quantity,
			Unit:     ingredient.Unit,
			Note:     ingredient.Note,
		})
	}
	return inputs
}
