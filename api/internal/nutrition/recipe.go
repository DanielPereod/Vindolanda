package nutrition

import (
	"strings"

	"personal-life/api/internal/core"
)

// RecipeInput is the editable representation of a recipe with its ingredients.
type RecipeInput struct {
	Name        string                  `json:"name"`
	Description string                  `json:"description"`
	PrepMinutes int                     `json:"prep_minutes"`
	Servings    float64                 `json:"servings"`
	Tags        []string                `json:"tags"`
	Favorite    bool                    `json:"favorite"`
	Ingredients []RecipeIngredientInput `json:"ingredients"`
}

// RecipeIngredientInput is one editable ingredient line.
type RecipeIngredientInput struct {
	FoodID   string  `json:"food_id"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	Note     string  `json:"note"`
}

// RecipeIngredient includes the scaled nutrition of one ingredient.
type RecipeIngredient struct {
	ID             string             `json:"id"`
	FoodID         string             `json:"food_id"`
	FoodName       string             `json:"food_name"`
	Quantity       float64            `json:"quantity"`
	Unit           string             `json:"unit"`
	Note           string             `json:"note"`
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

// Recipe includes stored fields, ingredients and computed nutrition.
type Recipe struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	PrepMinutes int                `json:"prep_minutes"`
	Servings    float64            `json:"servings"`
	Tags        []string           `json:"tags"`
	Favorite    bool               `json:"favorite"`
	Ingredients []RecipeIngredient `json:"ingredients"`
	Totals      DiaryTotals        `json:"totals"`
	PerServing  DiaryTotals        `json:"per_serving"`
	CreatedAt   string             `json:"created_at"`
	UpdatedAt   string             `json:"updated_at"`
}

// ingredientRow joins an ingredient with its catalog food before scaling.
type ingredientRow struct {
	RecipeID       string             `json:"recipe_id"`
	ID             string             `json:"id"`
	FoodID         string             `json:"food_id"`
	FoodName       string             `json:"food_name"`
	Quantity       float64            `json:"quantity"`
	Unit           string             `json:"unit"`
	Position       float64            `json:"position"`
	Note           string             `json:"note"`
	BaseQuantity   float64            `json:"base_quantity"`
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

// validateRecipe enforces the scalar recipe invariants.
func validateRecipe(value RecipeInput) error {
	name := strings.TrimSpace(value.Name)
	if len(name) == 0 || len(name) > 200 {
		return core.Invalid("Name is required and must fit the length limit")
	}
	if value.PrepMinutes < 0 || value.PrepMinutes > 10000 {
		return core.Invalid("Preparation time is out of range")
	}
	if value.Servings <= 0 || value.Servings > 1000 {
		return core.Invalid("Servings are out of range")
	}
	if len(value.Tags) > 20 {
		return core.Invalid("Too many tags")
	}
	for _, tag := range value.Tags {
		trimmed := strings.TrimSpace(tag)
		if len(trimmed) == 0 || len(trimmed) > 50 {
			return core.Invalid("Invalid tag")
		}
	}
	return nil
}

// validateRecipeIngredient checks one ingredient against its catalog food.
func validateRecipeIngredient(value RecipeIngredientInput, food Food) error {
	if !core.ValidID(value.FoodID) {
		return core.Invalid("Invalid ingredient food")
	}
	if food.BaseQuantity <= 0 {
		return core.Invalid("Food has no base portion")
	}
	if value.Quantity <= 0 || value.Quantity > maxBaseQuantity {
		return core.Invalid("Ingredient quantity is out of range")
	}
	if value.Unit != "" && value.Unit != food.BaseUnit {
		return core.Invalid("Unit does not match the food")
	}
	if len(value.Note) > 200 {
		return core.Invalid("Ingredient note is too long")
	}
	return nil
}

// buildRecipe scales ingredients, totals them and divides by servings.
func buildRecipe(base Recipe, rows []ingredientRow) Recipe {
	ingredients := make([]RecipeIngredient, 0, len(rows))
	totals := DiaryTotals{Micronutrients: map[string]float64{}}
	for _, row := range rows {
		scaled := foodTotals(Food{FoodInput: FoodInput{
			Name:           row.FoodName,
			BaseQuantity:   row.BaseQuantity,
			CaloriesKcal:   row.CaloriesKcal,
			ProteinG:       row.ProteinG,
			CarbsG:         row.CarbsG,
			FatG:           row.FatG,
			FiberG:         row.FiberG,
			SugarG:         row.SugarG,
			SaturatedFatG:  row.SaturatedFatG,
			SaltG:          row.SaltG,
			SodiumMg:       row.SodiumMg,
			Micronutrients: row.Micronutrients,
		}}, row.Quantity)
		ingredient := RecipeIngredient{
			ID:             row.ID,
			FoodID:         row.FoodID,
			FoodName:       row.FoodName,
			Quantity:       row.Quantity,
			Unit:           row.Unit,
			Note:           row.Note,
			CaloriesKcal:   scaled.CaloriesKcal,
			ProteinG:       scaled.ProteinG,
			CarbsG:         scaled.CarbsG,
			FatG:           scaled.FatG,
			FiberG:         scaled.FiberG,
			SugarG:         scaled.SugarG,
			SaturatedFatG:  scaled.SaturatedFatG,
			SaltG:          scaled.SaltG,
			SodiumMg:       scaled.SodiumMg,
			Micronutrients: scaled.Micronutrients,
		}
		ingredients = append(ingredients, ingredient)
		addNutrients(&totals, ingredient)
	}
	base.Ingredients = ingredients
	base.Totals = totals
	base.PerServing = divideNutrients(totals, base.Servings)
	return base
}

// addNutrients accumulates one ingredient into a running total.
func addNutrients(target *DiaryTotals, source RecipeIngredient) {
	target.CaloriesKcal += source.CaloriesKcal
	target.ProteinG += source.ProteinG
	target.CarbsG += source.CarbsG
	target.FatG += source.FatG
	target.FiberG += source.FiberG
	target.SugarG += source.SugarG
	target.SaturatedFatG += source.SaturatedFatG
	target.SaltG += source.SaltG
	target.SodiumMg += source.SodiumMg
	for name, amount := range source.Micronutrients {
		target.Micronutrients[name] += amount
	}
}

// divideNutrients returns a rounded copy divided by the given divisor.
func divideNutrients(source DiaryTotals, divisor float64) DiaryTotals {
	if divisor <= 0 {
		divisor = 1
	}
	scaled := DiaryTotals{
		CaloriesKcal:   round2(source.CaloriesKcal / divisor),
		ProteinG:       round2(source.ProteinG / divisor),
		CarbsG:         round2(source.CarbsG / divisor),
		FatG:           round2(source.FatG / divisor),
		FiberG:         round2(source.FiberG / divisor),
		SugarG:         round2(source.SugarG / divisor),
		SaturatedFatG:  round2(source.SaturatedFatG / divisor),
		SaltG:          round2(source.SaltG / divisor),
		SodiumMg:       round2(source.SodiumMg / divisor),
		Micronutrients: map[string]float64{},
	}
	for name, amount := range source.Micronutrients {
		scaled.Micronutrients[name] = round2(amount / divisor)
	}
	return scaled
}

// multiplyNutrients returns a rounded copy scaled by the given factor.
func multiplyNutrients(source DiaryTotals, factor float64) DiaryTotals {
	return divideNutrients(source, 1/factor)
}

// CookedEntry builds a diary snapshot for a number of recipe servings.
func CookedEntry(recipe Recipe, entryDate, meal string, servings float64) DiaryEntry {
	nutrients := multiplyNutrients(recipe.PerServing, servings)
	return DiaryEntry{
		EntryDate:      entryDate,
		Meal:           meal,
		Label:          recipe.Name,
		Quantity:       servings,
		Unit:           "unit",
		CaloriesKcal:   nutrients.CaloriesKcal,
		ProteinG:       nutrients.ProteinG,
		CarbsG:         nutrients.CarbsG,
		FatG:           nutrients.FatG,
		FiberG:         nutrients.FiberG,
		SugarG:         nutrients.SugarG,
		SaturatedFatG:  nutrients.SaturatedFatG,
		SaltG:          nutrients.SaltG,
		SodiumMg:       nutrients.SodiumMg,
		Micronutrients: nutrients.Micronutrients,
	}
}
