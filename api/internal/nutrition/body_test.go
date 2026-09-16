package nutrition

import "testing"

func weight(value float64) *float64 { return &value }

func TestValidateMeasurementAcceptsWeightOnly(testingContext *testing.T) {
	value := MeasurementInput{MeasuredOn: "2026-09-16", WeightKg: weight(72.5)}
	if operationError := validateMeasurement(value); operationError != nil {
		testingContext.Fatalf("weight-only measurement rejected: %v", operationError)
	}
}

func TestValidateMeasurementAcceptsCircumferenceOnly(testingContext *testing.T) {
	value := MeasurementInput{MeasuredOn: "2026-09-16", WaistCm: weight(80)}
	if operationError := validateMeasurement(value); operationError != nil {
		testingContext.Fatalf("circumference-only measurement rejected: %v", operationError)
	}
}

func TestValidateMeasurementRejectsInvalidValues(testingContext *testing.T) {
	valid := func() MeasurementInput {
		return MeasurementInput{MeasuredOn: "2026-09-16", WeightKg: weight(72.5)}
	}
	cases := []struct {
		name   string
		mutate func(*MeasurementInput)
	}{
		{"bad date", func(value *MeasurementInput) { value.MeasuredOn = "16/09/2026" }},
		{"no metrics", func(value *MeasurementInput) { value.WeightKg = nil }},
		{"negative weight", func(value *MeasurementInput) { value.WeightKg = weight(-1) }},
		{"huge weight", func(value *MeasurementInput) { value.WeightKg = weight(1001) }},
		{"body fat over 100", func(value *MeasurementInput) { value.BodyFatPct = weight(101) }},
		{"negative waist", func(value *MeasurementInput) { value.WaistCm = weight(-2) }},
		{"long notes", func(value *MeasurementInput) { value.Notes = string(make([]rune, 501)) }},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			value := valid()
			testCase.mutate(&value)
			if operationError := validateMeasurement(value); operationError == nil {
				testingContext.Fatalf("expected %q to be rejected", testCase.name)
			}
		})
	}
}
