package settings

import (
	"os/exec"
	"strings"
	"testing"
)

func TestTimezoneDatabaseIsEmbedded(testingContext *testing.T) {
	command := exec.Command("go", "list", "-deps", ".")
	dependencies, operationError := command.Output()
	if operationError != nil {
		testingContext.Fatalf("list settings dependencies: %v", operationError)
	}

	for dependency := range strings.Lines(string(dependencies)) {
		if strings.TrimSpace(dependency) == "time/tzdata" {
			return
		}
	}

	testingContext.Fatal("settings must embed time/tzdata for minimal container images")
}

func TestValidate(testingContext *testing.T) {
	value := Settings{Timezone: "Europe/Madrid", Language: "es", WeekStart: 1, HourFormat: "24", DateFormat: "DD/MM/YYYY", Theme: "system", AccentColor: "#2563eb", DefaultSort: "manual", NotesConfirmDiscard: true, NutritionBaseUnit: "g"}
	if operationError := Validate(value); operationError != nil {
		testingContext.Fatal(operationError)
	}
	value.AccentColor = "#ffff00"
	if operationError := Validate(value); operationError == nil {
		testingContext.Fatal("unsupported accent color accepted")
	}
	value.AccentColor = "#2563eb"
	value.Timezone = "Not/AZone"
	if operationError := Validate(value); operationError == nil {
		testingContext.Fatal("invalid timezone accepted")
	}
	value.Timezone = "Europe/Madrid"
	value.NutritionBaseUnit = "oz"
	if operationError := Validate(value); operationError == nil {
		testingContext.Fatal("unsupported nutrition base unit accepted")
	}
}
