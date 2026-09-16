package nutrition

import (
	"regexp"
	"strings"

	"personal-life/api/internal/core"
)

// FoodInput is the editable representation of a catalog food.
type FoodInput struct {
	Name           string             `json:"name"`
	Brand          string             `json:"brand"`
	Barcode        *string            `json:"barcode"`
	BaseQuantity   float64            `json:"base_quantity"`
	BaseUnit       string             `json:"base_unit"`
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
	Favorite       bool               `json:"favorite"`
}

// Food includes stable identity and provenance.
type Food struct {
	FoodInput
	ID        string `json:"id"`
	Source    string `json:"source"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

var barcodePattern = regexp.MustCompile(`^[0-9]{4,32}$`)
var foodUnits = []string{"g", "ml", "unit"}

const (
	maxNutrientValue     = 100000
	maxBaseQuantity      = 100000
	maxMicronutrients    = 100
	maxMicronutrientName = 100
)

// normalizeBarcode trims a barcode and treats blanks as no barcode.
func normalizeBarcode(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// parseBarcode validates a barcode that is about to be looked up or imported.
func parseBarcode(raw string) (*string, error) {
	barcode := normalizeBarcode(&raw)
	if barcode == nil {
		return nil, core.Invalid("Barcode is required")
	}
	if !barcodePattern.MatchString(*barcode) {
		return nil, core.Invalid("Invalid barcode")
	}
	return barcode, nil
}

// validateFood enforces the catalog invariants before persistence.
func validateFood(value FoodInput) error {
	name := strings.TrimSpace(value.Name)
	if len(name) == 0 || len(name) > 200 {
		return core.Invalid("Name is required and must fit the length limit")
	}
	if len(value.Brand) > 200 {
		return core.Invalid("Brand must fit the length limit")
	}
	if !oneOf(value.BaseUnit, foodUnits) {
		return core.Invalid("Invalid base unit")
	}
	if value.BaseQuantity <= 0 || value.BaseQuantity > maxBaseQuantity {
		return core.Invalid("Base quantity is out of range")
	}
	if barcode := normalizeBarcode(value.Barcode); barcode != nil && !barcodePattern.MatchString(*barcode) {
		return core.Invalid("Invalid barcode")
	}
	nutrients := []float64{
		value.CaloriesKcal, value.ProteinG, value.CarbsG, value.FatG,
		value.FiberG, value.SugarG, value.SaturatedFatG, value.SaltG, value.SodiumMg,
	}
	for _, nutrient := range nutrients {
		if nutrient < 0 || nutrient > maxNutrientValue {
			return core.Invalid("Nutrient values are out of range")
		}
	}
	if len(value.Micronutrients) > maxMicronutrients {
		return core.Invalid("Too many micronutrients")
	}
	for name, amount := range value.Micronutrients {
		if len(strings.TrimSpace(name)) == 0 || len(name) > maxMicronutrientName {
			return core.Invalid("Invalid micronutrient name")
		}
		if amount < 0 || amount > maxNutrientValue {
			return core.Invalid("Micronutrient values are out of range")
		}
	}
	return nil
}
