package nutrition

import "testing"

func sampleFood() Food {
	return Food{
		FoodInput: FoodInput{
			Name:           "Yogur griego",
			BaseQuantity:   100,
			BaseUnit:       "g",
			CaloriesKcal:   59,
			ProteinG:       10,
			CarbsG:         3.6,
			FatG:           0.4,
			SodiumMg:       40,
			Micronutrients: map[string]float64{"calcium_mg": 110},
		},
		ID: "11111111-1111-1111-1111-111111111111",
	}
}

func TestScaleFoodScalesByQuantity(testingContext *testing.T) {
	entry := scaleFood(sampleFood(), 150)
	if !closeEnough(entry.CaloriesKcal, 88.5) {
		testingContext.Fatalf("calories got %v want 88.5", entry.CaloriesKcal)
	}
	if !closeEnough(entry.ProteinG, 15) {
		testingContext.Fatalf("protein got %v want 15", entry.ProteinG)
	}
	if !closeEnough(entry.SodiumMg, 60) {
		testingContext.Fatalf("sodium got %v want 60", entry.SodiumMg)
	}
	if !closeEnough(entry.Micronutrients["calcium_mg"], 165) {
		testingContext.Fatalf("calcium got %v want 165", entry.Micronutrients["calcium_mg"])
	}
	if entry.Label != "Yogur griego" || entry.Unit != "g" {
		testingContext.Fatalf("snapshot kept the wrong identity: %+v", entry)
	}
}

func TestValidateDiaryEntry(testingContext *testing.T) {
	valid := func() DiaryEntryInput {
		return DiaryEntryInput{
			EntryDate: "2026-09-16",
			Meal:      "lunch",
			FoodID:    "11111111-1111-1111-1111-111111111111",
			Quantity:  150,
			Unit:      "g",
		}
	}
	cases := []struct {
		name   string
		mutate func(*DiaryEntryInput)
	}{
		{"bad date", func(value *DiaryEntryInput) { value.EntryDate = "16/09/2026" }},
		{"unknown meal", func(value *DiaryEntryInput) { value.Meal = "brunch" }},
		{"zero quantity", func(value *DiaryEntryInput) { value.Quantity = 0 }},
		{"negative quantity", func(value *DiaryEntryInput) { value.Quantity = -10 }},
		{"huge quantity", func(value *DiaryEntryInput) { value.Quantity = 100001 }},
		{"incompatible unit", func(value *DiaryEntryInput) { value.Unit = "ml" }},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			value := valid()
			testCase.mutate(&value)
			if operationError := validateDiaryEntry(value, sampleFood()); operationError == nil {
				testingContext.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}
	if operationError := validateDiaryEntry(valid(), sampleFood()); operationError != nil {
		testingContext.Fatalf("valid entry rejected: %v", operationError)
	}
	empty := valid()
	empty.Unit = ""
	if operationError := validateDiaryEntry(empty, sampleFood()); operationError != nil {
		testingContext.Fatalf("empty unit must default to the food unit: %v", operationError)
	}
}

func TestSumEntriesTotals(testingContext *testing.T) {
	entries := []DiaryEntry{
		{CaloriesKcal: 100, ProteinG: 5, Micronutrients: map[string]float64{"iron_mg": 2}},
		{CaloriesKcal: 50, ProteinG: 2.5, Micronutrients: map[string]float64{"iron_mg": 1, "zinc_mg": 3}},
	}
	totals := sumEntries(entries)
	if !closeEnough(totals.CaloriesKcal, 150) || !closeEnough(totals.ProteinG, 7.5) {
		testingContext.Fatalf("unexpected totals: %+v", totals)
	}
	if !closeEnough(totals.Micronutrients["iron_mg"], 3) || !closeEnough(totals.Micronutrients["zinc_mg"], 3) {
		testingContext.Fatalf("unexpected micronutrient totals: %+v", totals.Micronutrients)
	}
}
