package nutrition

import (
	"context"
	"strings"

	"personal-life/api/internal/core"
)

const recipeIngredientQuery = `SELECT jsonb_build_object(
 'recipe_id', ingredient.recipe_id,
 'id', ingredient.id,
 'food_id', ingredient.food_id,
 'food_name', food.name,
 'quantity', ingredient.quantity,
 'unit', ingredient.unit,
 'position', ingredient.position,
 'note', ingredient.note,
 'base_quantity', food.base_quantity,
 'calories_kcal', food.calories_kcal,
 'protein_g', food.protein_g,
 'carbs_g', food.carbs_g,
 'fat_g', food.fat_g,
 'fiber_g', food.fiber_g,
 'sugar_g', food.sugar_g,
 'saturated_fat_g', food.saturated_fat_g,
 'salt_g', food.salt_g,
 'sodium_mg', food.sodium_mg,
 'micronutrients', food.micronutrients)
FROM recipe_ingredients ingredient JOIN foods food ON food.id=ingredient.food_id
WHERE ingredient.recipe_id = ANY($1::uuid[])
ORDER BY ingredient.recipe_id, ingredient.position, ingredient.id`

// ListRecipes returns recipes, optionally filtered by name.
func ListRecipes(requestContext context.Context, database core.Database, query string) ([]Recipe, error) {
	statement := "SELECT to_jsonb(recipe) FROM recipes recipe"
	arguments := make([]any, 0, 1)
	if trimmed := strings.TrimSpace(query); trimmed != "" {
		arguments = append(arguments, trimmed)
		statement += " WHERE strpos(lower(recipe.name), lower($1)) > 0"
	}
	statement += " ORDER BY recipe.favorite DESC, lower(recipe.name), recipe.id"
	recipes, operationError := core.List[Recipe](requestContext, database, statement, arguments...)
	if operationError != nil {
		return nil, operationError
	}
	identifiers := make([]string, len(recipes))
	for index, recipe := range recipes {
		identifiers[index] = recipe.ID
	}
	grouped, operationError := recipeIngredients(requestContext, database, identifiers)
	if operationError != nil {
		return nil, operationError
	}
	for index := range recipes {
		recipes[index] = buildRecipe(recipes[index], grouped[recipes[index].ID])
	}
	return recipes, nil
}

// GetRecipe returns one recipe with its computed nutrition.
func GetRecipe(requestContext context.Context, database core.Database, identifier string) (Recipe, error) {
	recipe, operationError := core.One[Recipe](requestContext, database, "SELECT to_jsonb(recipe) FROM recipes recipe WHERE id=$1", identifier)
	if operationError != nil {
		return Recipe{}, operationError
	}
	grouped, operationError := recipeIngredients(requestContext, database, []string{recipe.ID})
	if operationError != nil {
		return Recipe{}, operationError
	}
	return buildRecipe(recipe, grouped[recipe.ID]), nil
}

// CreateRecipe inserts a recipe and its ingredients.
func CreateRecipe(requestContext context.Context, database core.Database, value RecipeInput, ingredients []RecipeIngredientInput) (Recipe, error) {
	recipe, operationError := core.One[Recipe](requestContext, database, `INSERT INTO recipes(name,description,prep_minutes,servings,tags,favorite)
 VALUES($1,$2,$3,$4,$5,$6) RETURNING to_jsonb(recipes)`, value.Name, value.Description, value.PrepMinutes, value.Servings, value.Tags, value.Favorite)
	if operationError != nil {
		return Recipe{}, operationError
	}
	if operationError := replaceIngredients(requestContext, database, recipe.ID, ingredients); operationError != nil {
		return Recipe{}, operationError
	}
	return GetRecipe(requestContext, database, recipe.ID)
}

// UpdateRecipe replaces the editable fields and the ingredient list.
func UpdateRecipe(requestContext context.Context, database core.Database, identifier string, value RecipeInput, ingredients []RecipeIngredientInput) (Recipe, error) {
	_, operationError := core.One[Recipe](requestContext, database, `UPDATE recipes SET name=$2,description=$3,prep_minutes=$4,servings=$5,tags=$6,favorite=$7,updated_at=now()
 WHERE id=$1 RETURNING to_jsonb(recipes)`, identifier, value.Name, value.Description, value.PrepMinutes, value.Servings, value.Tags, value.Favorite)
	if operationError != nil {
		return Recipe{}, operationError
	}
	if operationError := replaceIngredients(requestContext, database, identifier, ingredients); operationError != nil {
		return Recipe{}, operationError
	}
	return GetRecipe(requestContext, database, identifier)
}

// DeleteRecipe removes a recipe and its ingredients.
func DeleteRecipe(requestContext context.Context, database core.Database, identifier string) error {
	tag, operationError := database.Exec(requestContext, "DELETE FROM recipes WHERE id=$1", identifier)
	if operationError != nil {
		return operationError
	}
	if tag.RowsAffected() == 0 {
		return core.Error{Status: 404, Message: "Resource not found"}
	}
	return nil
}

func replaceIngredients(requestContext context.Context, database core.Database, recipeID string, ingredients []RecipeIngredientInput) error {
	if _, operationError := database.Exec(requestContext, "DELETE FROM recipe_ingredients WHERE recipe_id=$1", recipeID); operationError != nil {
		return operationError
	}
	for index, ingredient := range ingredients {
		if _, operationError := database.Exec(requestContext, `INSERT INTO recipe_ingredients(recipe_id,food_id,quantity,unit,note,position)
 VALUES($1,$2,$3,$4,$5,$6)`, recipeID, ingredient.FoodID, ingredient.Quantity, ingredient.Unit, ingredient.Note, 1024+float64(index)*1024); operationError != nil {
			return operationError
		}
	}
	return nil
}

// recipeIngredients loads the ingredient rows for several recipes at once.
func recipeIngredients(requestContext context.Context, database core.Database, recipeIDs []string) (map[string][]ingredientRow, error) {
	grouped := map[string][]ingredientRow{}
	if len(recipeIDs) == 0 {
		return grouped, nil
	}
	rows, operationError := core.List[ingredientRow](requestContext, database, recipeIngredientQuery, recipeIDs)
	if operationError != nil {
		return nil, operationError
	}
	for _, row := range rows {
		grouped[row.RecipeID] = append(grouped[row.RecipeID], row)
	}
	return grouped, nil
}

// recipesByIDs loads several recipes with their computed nutrition in two queries.
func recipesByIDs(requestContext context.Context, database core.Database, identifiers []string) (map[string]Recipe, error) {
	recipes := map[string]Recipe{}
	if len(identifiers) == 0 {
		return recipes, nil
	}
	values, operationError := core.List[Recipe](requestContext, database, "SELECT to_jsonb(recipe) FROM recipes recipe WHERE recipe.id = ANY($1::uuid[])", identifiers)
	if operationError != nil {
		return nil, operationError
	}
	grouped, operationError := recipeIngredients(requestContext, database, identifiers)
	if operationError != nil {
		return nil, operationError
	}
	for _, recipe := range values {
		recipes[recipe.ID] = buildRecipe(recipe, grouped[recipe.ID])
	}
	return recipes, nil
}
