package nutrition

import "testing"

func TestAggregateContributionsMergesSameFoodAndUnit(testingContext *testing.T) {
	items := []shoppingContribution{
		{FoodID: "a", Label: "Avena", Quantity: 100, Unit: "g"},
		{FoodID: "a", Label: "Avena", Quantity: 50, Unit: "g"},
		{FoodID: "b", Label: "Leche", Quantity: 1, Unit: "unit"},
		{FoodID: "a", Label: "Avena", Quantity: 1, Unit: "unit"},
	}
	aggregated := aggregateContributions(items)
	if len(aggregated) != 3 {
		testingContext.Fatalf("expected 3 lines, got %d: %+v", len(aggregated), aggregated)
	}
	first := aggregated[0]
	if first.FoodID != "a" || first.Unit != "g" || !closeEnough(first.Quantity, 150) {
		testingContext.Fatalf("a/g line wrong: %+v", first)
	}
	byKey := map[string]shoppingContribution{}
	for _, item := range aggregated {
		byKey[item.FoodID+"/"+item.Unit] = item
	}
	if line, present := byKey["b/unit"]; !present || !closeEnough(line.Quantity, 1) {
		testingContext.Fatalf("b/unit line wrong: %+v", line)
	}
}

func TestValidateShoppingInput(testingContext *testing.T) {
	valid := func() ShoppingInput {
		return ShoppingInput{Label: "Avena", Quantity: 500, Unit: "g"}
	}
	cases := []struct {
		name   string
		mutate func(*ShoppingInput)
	}{
		{"empty label", func(value *ShoppingInput) { value.Label = "  " }},
		{"bad unit", func(value *ShoppingInput) { value.Unit = "kg" }},
		{"negative quantity", func(value *ShoppingInput) { value.Quantity = -1 }},
		{"huge quantity", func(value *ShoppingInput) { value.Quantity = 1000001 }},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			value := valid()
			testCase.mutate(&value)
			if operationError := validateShoppingInput(value); operationError == nil {
				testingContext.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}
	if operationError := validateShoppingInput(valid()); operationError != nil {
		testingContext.Fatalf("valid item rejected: %v", operationError)
	}
}
