package nutrition

import "testing"

func pointerTo(value string) *string { return &value }

func TestMondayOf(testingContext *testing.T) {
	cases := map[string]string{
		"2026-09-14": "2026-09-14", // lunes
		"2026-09-16": "2026-09-14", // miércoles
		"2026-09-20": "2026-09-14", // domingo
		"2026-09-21": "2026-09-21", // lunes siguiente
	}
	for input, want := range cases {
		if got := mondayOf(input); got != want {
			testingContext.Fatalf("mondayOf(%s) got %s want %s", input, got, want)
		}
	}
}

func TestValidatePlanInput(testingContext *testing.T) {
	valid := func() PlanInput {
		return PlanInput{Name: "Semana", WeekStart: pointerTo("2026-09-14")}
	}
	cases := []struct {
		name   string
		mutate func(*PlanInput)
	}{
		{"empty name", func(value *PlanInput) { value.Name = "  " }},
		{"missing week", func(value *PlanInput) { value.WeekStart = nil }},
		{"bad week", func(value *PlanInput) { value.WeekStart = pointerTo("14/09/2026") }},
		{"template with week", func(value *PlanInput) {
			value.IsTemplate = true
			value.WeekStart = pointerTo("2026-09-14")
		}},
		{"week marked template", func(value *PlanInput) { value.WeekStart = nil }},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			value := valid()
			testCase.mutate(&value)
			if operationError := validatePlanInput(value); operationError == nil {
				testingContext.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}
	if operationError := validatePlanInput(valid()); operationError != nil {
		testingContext.Fatalf("valid plan rejected: %v", operationError)
	}
	template := PlanInput{Name: "Plantilla", IsTemplate: true}
	if operationError := validatePlanInput(template); operationError != nil {
		testingContext.Fatalf("valid template rejected: %v", operationError)
	}
}

func TestValidatePlanItemInput(testingContext *testing.T) {
	valid := func() PlanItemInput {
		return PlanItemInput{
			DayIndex: 0,
			Meal:     "lunch",
			RecipeID: pointerTo("11111111-1111-1111-1111-111111111111"),
			Quantity: 1,
		}
	}
	cases := []struct {
		name   string
		mutate func(*PlanItemInput)
	}{
		{"day below range", func(value *PlanItemInput) { value.DayIndex = -1 }},
		{"day above range", func(value *PlanItemInput) { value.DayIndex = 7 }},
		{"unknown meal", func(value *PlanItemInput) { value.Meal = "brunch" }},
		{"no source", func(value *PlanItemInput) { value.RecipeID = nil }},
		{"both sources", func(value *PlanItemInput) {
			value.FoodID = pointerTo("22222222-2222-2222-2222-222222222222")
		}},
		{"zero quantity", func(value *PlanItemInput) { value.Quantity = 0 }},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			value := valid()
			testCase.mutate(&value)
			if operationError := validatePlanItemInput(value); operationError == nil {
				testingContext.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}
}
