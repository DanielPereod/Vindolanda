package nutrition

import "testing"

func pointer(value string) *string { return &value }

func validFood() FoodInput {
	return FoodInput{
		Name:           "Greek yogurt",
		Brand:          "Example",
		Barcode:        pointer("8412345678901"),
		BaseQuantity:   100,
		BaseUnit:       "g",
		CaloriesKcal:   59,
		ProteinG:       10,
		CarbsG:         3.6,
		FatG:           0.4,
		FiberG:         0,
		SugarG:         3.6,
		SaturatedFatG:  0.1,
		SaltG:          0.1,
		SodiumMg:       40,
		Micronutrients: map[string]float64{"calcium_mg": 110},
		Favorite:       true,
	}
}

func TestValidateFoodAcceptsCompleteEntry(testingContext *testing.T) {
	if operationError := validateFood(validFood()); operationError != nil {
		testingContext.Fatalf("complete food rejected: %v", operationError)
	}
}

func TestValidateFoodAcceptsOptionalFieldsEmpty(testingContext *testing.T) {
	value := FoodInput{
		Name:         "Banana",
		BaseQuantity: 1,
		BaseUnit:     "unit",
		Barcode:      pointer(""),
	}
	if operationError := validateFood(value); operationError != nil {
		testingContext.Fatalf("minimal food rejected: %v", operationError)
	}
}

func TestValidateFoodRejectsInvalidValues(testingContext *testing.T) {
	cases := []struct {
		name   string
		mutate func(*FoodInput)
	}{
		{"empty name", func(value *FoodInput) { value.Name = "   " }},
		{"long name", func(value *FoodInput) { value.Name = string(make([]rune, 201)) }},
		{"bad unit", func(value *FoodInput) { value.BaseUnit = "kg" }},
		{"zero base quantity", func(value *FoodInput) { value.BaseQuantity = 0 }},
		{"negative base quantity", func(value *FoodInput) { value.BaseQuantity = -100 }},
		{"huge base quantity", func(value *FoodInput) { value.BaseQuantity = 100001 }},
		{"negative calories", func(value *FoodInput) { value.CaloriesKcal = -1 }},
		{"negative protein", func(value *FoodInput) { value.ProteinG = -1 }},
		{"negative sodium", func(value *FoodInput) { value.SodiumMg = -1 }},
		{"non numeric barcode", func(value *FoodInput) { value.Barcode = pointer("ABC-123") }},
		{"short barcode", func(value *FoodInput) { value.Barcode = pointer("12") }},
		{"negative micronutrient", func(value *FoodInput) {
			value.Micronutrients = map[string]float64{"iron_mg": -1}
		}},
		{"empty micronutrient key", func(value *FoodInput) {
			value.Micronutrients = map[string]float64{"": 1}
		}},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			value := validFood()
			testCase.mutate(&value)
			if operationError := validateFood(value); operationError == nil {
				testingContext.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}
}

func TestNormalizeBarcode(testingContext *testing.T) {
	if normalizeBarcode(pointer("  ")) != nil {
		testingContext.Fatal("blank barcode must be null")
	}
	if normalizeBarcode(nil) != nil {
		testingContext.Fatal("nil barcode must stay null")
	}
	normalized := normalizeBarcode(pointer("  8412345678901 "))
	if normalized == nil || *normalized != "8412345678901" {
		testingContext.Fatal("barcode must be trimmed of surrounding space")
	}
}
