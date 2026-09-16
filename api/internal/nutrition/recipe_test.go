package nutrition

import "testing"

func ingredientRowWith(base, quantity, calories, protein float64) ingredientRow {
	return ingredientRow{
		FoodName:     "Ingrediente",
		BaseQuantity: base,
		Quantity:     quantity,
		CaloriesKcal: calories,
		ProteinG:     protein,
	}
}

func TestBuildRecipeComputesTotalsAndServings(testingContext *testing.T) {
	base := Recipe{ID: "r1", Name: "Bol", Servings: 2}
	rows := []ingredientRow{
		ingredientRowWith(100, 50, 100, 10),
		ingredientRowWith(100, 100, 200, 20),
	}
	recipe := buildRecipe(base, rows)
	if !closeEnough(recipe.Totals.CaloriesKcal, 250) {
		testingContext.Fatalf("recipe calories got %v want 250", recipe.Totals.CaloriesKcal)
	}
	if !closeEnough(recipe.Totals.ProteinG, 25) {
		testingContext.Fatalf("recipe protein got %v want 25", recipe.Totals.ProteinG)
	}
	if !closeEnough(recipe.PerServing.CaloriesKcal, 125) {
		testingContext.Fatalf("per serving got %v want 125", recipe.PerServing.CaloriesKcal)
	}
	if len(recipe.Ingredients) != 2 {
		testingContext.Fatalf("expected two ingredients, got %d", len(recipe.Ingredients))
	}
	if !closeEnough(recipe.Ingredients[0].CaloriesKcal, 50) {
		testingContext.Fatalf("first ingredient got %v want 50", recipe.Ingredients[0].CaloriesKcal)
	}
}

func TestValidateRecipeRejectsInvalidValues(testingContext *testing.T) {
	valid := func() RecipeInput {
		return RecipeInput{Name: "Bol de avena", Servings: 2, Tags: []string{"desayuno"}}
	}
	cases := []struct {
		name   string
		mutate func(*RecipeInput)
	}{
		{"empty name", func(value *RecipeInput) { value.Name = "  " }},
		{"negative prep", func(value *RecipeInput) { value.PrepMinutes = -1 }},
		{"zero servings", func(value *RecipeInput) { value.Servings = 0 }},
		{"negative servings", func(value *RecipeInput) { value.Servings = -2 }},
		{"huge servings", func(value *RecipeInput) { value.Servings = 1001 }},
		{"empty tag", func(value *RecipeInput) { value.Tags = []string{"ok", "  "} }},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			value := valid()
			testCase.mutate(&value)
			if operationError := validateRecipe(value); operationError == nil {
				testingContext.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}
	if operationError := validateRecipe(valid()); operationError != nil {
		testingContext.Fatalf("valid recipe rejected: %v", operationError)
	}
}
