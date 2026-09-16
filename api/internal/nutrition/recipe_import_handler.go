package nutrition

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

// RecipeDraft is an imported recipe with catalog matches attached for review.
type RecipeDraft struct {
	SourceURL   string            `json:"source_url"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	PrepMinutes int               `json:"prep_minutes"`
	Servings    float64           `json:"servings"`
	Tags        []string          `json:"tags"`
	Ingredients []DraftIngredient `json:"ingredients"`
}

// DraftIngredient keeps the page text and, when found, its catalog food.
type DraftIngredient struct {
	Raw      string  `json:"raw"`
	Name     string  `json:"name"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	FoodID   string  `json:"food_id"`
	FoodName string  `json:"food_name"`
	BaseUnit string  `json:"base_unit"`
}

func registerRecipeImport(router chi.Router, pool *pgxpool.Pool, client RecipeImportClient) {
	router.Post("/nutrition/recipes/import", func(writer http.ResponseWriter, request *http.Request) {
		var input struct {
			URL string `json:"url"`
		}
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		imported, operationError := client.Recipe(request.Context(), input.URL)
		if errors.Is(operationError, ErrRecipeNotFound) {
			core.Fail(writer, core.Error{Status: 422, Message: "No recipe was found on that page"})
			return
		}
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		draft, operationError := matchImportedRecipe(request.Context(), pool, imported)
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, draft)
	})
}

// matchImportedRecipe attaches the closest catalog food to each ingredient.
func matchImportedRecipe(requestContext context.Context, database core.Database, imported ImportedRecipe) (RecipeDraft, error) {
	draft := RecipeDraft{
		SourceURL:   imported.SourceURL,
		Name:        strings.TrimSpace(imported.Name),
		Description: strings.TrimSpace(imported.Description),
		PrepMinutes: imported.PrepMinutes,
		Servings:    imported.Servings,
		Tags:        imported.Tags,
		Ingredients: []DraftIngredient{},
	}
	if draft.Servings <= 0 || draft.Servings > 1000 {
		draft.Servings = 1
	}
	if draft.Tags == nil {
		draft.Tags = []string{}
	}
	for _, ingredient := range imported.Ingredients {
		entry := DraftIngredient{
			Raw:      ingredient.Raw,
			Name:     ingredient.Name,
			Quantity: ingredient.Quantity,
			Unit:     ingredient.Unit,
		}
		food, found, operationError := MatchFoodByName(requestContext, database, ingredient.Name)
		if operationError != nil {
			return RecipeDraft{}, operationError
		}
		if found {
			entry.FoodID = food.ID
			entry.FoodName = food.Name
			entry.BaseUnit = food.BaseUnit
		}
		draft.Ingredients = append(draft.Ingredients, entry)
	}
	return draft, nil
}
