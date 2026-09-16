package nutrition

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

func registerShopping(router chi.Router, pool *pgxpool.Pool) {
	router.Get("/nutrition/shopping", func(writer http.ResponseWriter, request *http.Request) {
		values, operationError := ListShopping(request.Context(), pool)
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, values)
	})
	router.Post("/nutrition/shopping/items", func(writer http.ResponseWriter, request *http.Request) { createShoppingItem(writer, request, pool) })
	router.Delete("/nutrition/shopping/checked", func(writer http.ResponseWriter, request *http.Request) {
		_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
			return true, DeleteCheckedShoppingItems(request.Context(), transaction)
		})
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		writer.WriteHeader(204)
	})
	router.Patch("/nutrition/shopping/{id}", func(writer http.ResponseWriter, request *http.Request) { updateShoppingItem(writer, request, pool) })
	router.Delete("/nutrition/shopping/{id}", func(writer http.ResponseWriter, request *http.Request) {
		_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
			if operationError := DeleteShoppingItem(request.Context(), transaction, chi.URLParam(request, "id")); operationError != nil {
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
	router.Post("/nutrition/shopping/generate", func(writer http.ResponseWriter, request *http.Request) { generateShopping(writer, request, pool) })
}

func createShoppingItem(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (ShoppingItem, error) {
		input := ShoppingInput{Unit: "unit"}
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			return ShoppingItem{}, operationError
		}
		input.Label = strings.TrimSpace(input.Label)
		if operationError := validateShoppingInput(input); operationError != nil {
			return ShoppingItem{}, operationError
		}
		return CreateShoppingItem(request.Context(), transaction, input, "manual")
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 201, value)
}

func updateShoppingItem(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		Label    *string  `json:"label"`
		Quantity *float64 `json:"quantity"`
		Unit     *string  `json:"unit"`
		Checked  *bool    `json:"checked"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (ShoppingItem, error) {
		current, operationError := GetShoppingItem(request.Context(), transaction, chi.URLParam(request, "id"))
		if operationError != nil {
			return ShoppingItem{}, operationError
		}
		next := current.ShoppingInput
		if input.Label != nil {
			next.Label = strings.TrimSpace(*input.Label)
		}
		if input.Quantity != nil {
			next.Quantity = *input.Quantity
		}
		if input.Unit != nil {
			next.Unit = *input.Unit
		}
		if input.Checked != nil {
			next.Checked = *input.Checked
		}
		if operationError := validateShoppingInput(next); operationError != nil {
			return ShoppingItem{}, operationError
		}
		return UpdateShoppingItem(request.Context(), transaction, current.ID, next)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, value)
}

func generateShopping(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		PlanID    *string  `json:"plan_id"`
		RecipeIDs []string `json:"recipe_ids"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	hasPlan := input.PlanID != nil && strings.TrimSpace(*input.PlanID) != ""
	hasRecipes := len(input.RecipeIDs) > 0
	if hasPlan == hasRecipes {
		core.Fail(writer, core.Invalid("Provide a plan or recipes, but not both"))
		return
	}
	values, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) ([]ShoppingItem, error) {
		contributions, source, operationError := shoppingContributions(request.Context(), transaction, input.PlanID, input.RecipeIDs)
		if operationError != nil {
			return nil, operationError
		}
		if operationError := ReplaceGeneratedShoppingItems(request.Context(), transaction, contributions, source); operationError != nil {
			return nil, operationError
		}
		return ListShopping(request.Context(), transaction)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, values)
}

func shoppingContributions(requestContext context.Context, database core.Database, planID *string, recipeIDs []string) ([]shoppingContribution, string, error) {
	contributions := make([]shoppingContribution, 0)
	if planID != nil && strings.TrimSpace(*planID) != "" {
		plan, operationError := GetPlan(requestContext, database, *planID)
		if operationError != nil {
			return nil, "", operationError
		}
		for _, item := range plan.Items {
			if item.RecipeID != nil {
				recipe, operationError := GetRecipe(requestContext, database, *item.RecipeID)
				if operationError != nil {
					return nil, "", operationError
				}
				factor := 1.0
				if recipe.Servings > 0 {
					factor = item.Quantity / recipe.Servings
				}
				for _, ingredient := range recipe.Ingredients {
					contributions = append(contributions, shoppingContribution{
						FoodID:   ingredient.FoodID,
						Label:    ingredient.FoodName,
						Quantity: round2(ingredient.Quantity * factor),
						Unit:     ingredient.Unit,
					})
				}
			} else if item.FoodID != nil {
				contributions = append(contributions, shoppingContribution{
					FoodID:   *item.FoodID,
					Label:    item.Label,
					Quantity: item.Quantity,
					Unit:     item.Unit,
				})
			}
		}
		return aggregateContributions(contributions), "plan", nil
	}
	for _, recipeID := range recipeIDs {
		recipe, operationError := GetRecipe(requestContext, database, recipeID)
		if operationError != nil {
			return nil, "", operationError
		}
		for _, ingredient := range recipe.Ingredients {
			contributions = append(contributions, shoppingContribution{
				FoodID:   ingredient.FoodID,
				Label:    ingredient.FoodName,
				Quantity: ingredient.Quantity,
				Unit:     ingredient.Unit,
			})
		}
	}
	return aggregateContributions(contributions), "recipe", nil
}
