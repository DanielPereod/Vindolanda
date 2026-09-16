package nutrition

import (
	"math"
	"testing"
)

func closeEnough(got, want float64) bool { return math.Abs(got-want) < 0.01 }

func TestValidateAcceptsDefaultProfile(testingContext *testing.T) {
	value := ProfileInput{
		Sex:           "other",
		ActivityLevel: "moderate",
		Goal:          "maintain",
		TargetMode:    "auto",
	}
	if operationError := validate(value); operationError != nil {
		testingContext.Fatalf("default profile rejected: %v", operationError)
	}
}

func TestValidateRejectsInvalidValues(testingContext *testing.T) {
	valid := func() ProfileInput {
		return ProfileInput{
			WeightKg:       72.5,
			HeightCm:       178,
			Age:            34,
			Sex:            "male",
			ActivityLevel:  "light",
			Goal:           "lose",
			TargetCalories: 2100,
			TargetProteinG: 150,
			TargetCarbsG:   200,
			TargetFatG:     70,
			TargetFiberG:   30,
			TargetWaterMl:  2500,
			TargetMode:     "manual",
		}
	}
	cases := []struct {
		name   string
		mutate func(*ProfileInput)
	}{
		{"unknown sex", func(value *ProfileInput) { value.Sex = "unknown" }},
		{"unknown activity", func(value *ProfileInput) { value.ActivityLevel = "extreme" }},
		{"unknown goal", func(value *ProfileInput) { value.Goal = "bulk" }},
		{"unknown target mode", func(value *ProfileInput) { value.TargetMode = "guess" }},
		{"negative weight", func(value *ProfileInput) { value.WeightKg = -1 }},
		{"negative height", func(value *ProfileInput) { value.HeightCm = -1 }},
		{"negative age", func(value *ProfileInput) { value.Age = -1 }},
		{"age beyond 130", func(value *ProfileInput) { value.Age = 131 }},
		{"negative calories", func(value *ProfileInput) { value.TargetCalories = -1 }},
		{"negative protein", func(value *ProfileInput) { value.TargetProteinG = -1 }},
		{"negative water", func(value *ProfileInput) { value.TargetWaterMl = -1 }},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			value := valid()
			testCase.mutate(&value)
			if operationError := validate(value); operationError == nil {
				testingContext.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}
}

func TestBasalMetabolicRate(testingContext *testing.T) {
	cases := []struct {
		name  string
		value ProfileInput
		want  float64
	}{
		{"male", ProfileInput{WeightKg: 80, HeightCm: 180, Age: 30, Sex: "male"}, 1780},
		{"female", ProfileInput{WeightKg: 60, HeightCm: 165, Age: 25, Sex: "female"}, 1345.25},
		{"other", ProfileInput{WeightKg: 60, HeightCm: 165, Age: 25, Sex: "other"}, 1428.25},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			got := BasalMetabolicRate(testCase.value)
			if !closeEnough(got, testCase.want) {
				testingContext.Fatalf("BMR got %.4f want %.4f", got, testCase.want)
			}
		})
	}
}

func TestAutoTargetsMaleLose(testingContext *testing.T) {
	value := ProfileInput{
		WeightKg:      80,
		HeightCm:      180,
		Age:           30,
		Sex:           "male",
		ActivityLevel: "moderate",
		Goal:          "lose",
		TargetMode:    "auto",
	}
	applyAutoTargets(&value)
	if value.TargetCalories != 2345 {
		testingContext.Fatalf("calories got %d want 2345", value.TargetCalories)
	}
	if !closeEnough(value.TargetProteinG, 205) {
		testingContext.Fatalf("protein got %v want 205", value.TargetProteinG)
	}
	if !closeEnough(value.TargetCarbsG, 205) {
		testingContext.Fatalf("carbs got %v want 205", value.TargetCarbsG)
	}
	if !closeEnough(value.TargetFatG, 78) {
		testingContext.Fatalf("fat got %v want 78", value.TargetFatG)
	}
	if !closeEnough(value.TargetFiberG, 33) {
		testingContext.Fatalf("fiber got %v want 33", value.TargetFiberG)
	}
	if value.TargetWaterMl != 2800 {
		testingContext.Fatalf("water got %d want 2800", value.TargetWaterMl)
	}
}

func TestAutoTargetsPreserveStoredValuesWhenDataIsIncomplete(testingContext *testing.T) {
	value := ProfileInput{TargetMode: "auto", TargetCalories: 9999, TargetWaterMl: 2000}
	applyAutoTargets(&value)
	if value.TargetCalories != 9999 || value.TargetWaterMl != 2000 {
		testingContext.Fatal("incomplete auto profile must preserve stored targets")
	}
}

func TestManualTargetsArePreserved(testingContext *testing.T) {
	value := ProfileInput{
		WeightKg:       80,
		HeightCm:       180,
		Age:            30,
		Sex:            "male",
		ActivityLevel:  "moderate",
		Goal:           "lose",
		TargetMode:     "manual",
		TargetCalories: 2000,
		TargetProteinG: 180,
		TargetCarbsG:   190,
		TargetFatG:     60,
		TargetFiberG:   25,
		TargetWaterMl:  2200,
	}
	applyAutoTargets(&value)
	if value.TargetCalories != 2000 || value.TargetProteinG != 180 || value.TargetWaterMl != 2200 {
		testingContext.Fatal("manual targets must be preserved")
	}
}
