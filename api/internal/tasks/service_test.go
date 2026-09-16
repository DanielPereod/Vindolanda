package tasks

import (
	"context"
	"testing"
)

func TestValidateScheduling(testingContext *testing.T) {
	date, invalidDate, clock, invalidClock := "2026-09-15", "2026-02-30", "18:30", "18:30:99"
	cases := []struct {
		name    string
		input   Input
		invalid bool
	}{
		{"normal", Input{Title: "Task", Priority: 4}, false},
		{"no title", Input{Priority: 4}, true},
		{"invalid priority", Input{Title: "Task", Priority: 0}, true},
		{"valid schedule", Input{Title: "Task", Priority: 4, DueDate: &date, DueTime: &clock}, false},
		{"time without date", Input{Title: "Task", Priority: 4, DueTime: &clock}, true},
		{"invalid date", Input{Title: "Task", Priority: 4, DueDate: &invalidDate}, true},
		{"invalid seconds", Input{Title: "Task", Priority: 4, DueDate: &date, DueTime: &invalidClock}, true},
	}
	for _, testCase := range cases {
		testingContext.Run(testCase.name, func(testingContext *testing.T) {
			operationError := validate(context.Background(), nil, "", testCase.input)
			if (operationError != nil) != testCase.invalid {
				testingContext.Fatalf("got %v, invalid=%v", operationError, testCase.invalid)
			}
		})
	}
}
