package nutrition

import (
	"strings"

	"personal-life/api/internal/core"
)

const maxShoppingQuantity = 1000000

// ShoppingInput is the editable representation of a shopping line.
type ShoppingInput struct {
	Label    string  `json:"label"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	Checked  bool    `json:"checked"`
	FoodID   *string `json:"food_id"`
}

// ShoppingItem includes identity, provenance and server metadata.
type ShoppingItem struct {
	ShoppingInput
	ID        string `json:"id"`
	Source    string `json:"source"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// shoppingContribution is one ingredient or food before aggregation.
type shoppingContribution struct {
	FoodID   string
	Label    string
	Quantity float64
	Unit     string
}

// aggregateContributions merges lines that share a food and unit.
func aggregateContributions(items []shoppingContribution) []shoppingContribution {
	aggregated := make([]shoppingContribution, 0, len(items))
	index := map[string]int{}
	for _, item := range items {
		key := item.FoodID + "/" + item.Unit
		position, present := index[key]
		if !present {
			index[key] = len(aggregated)
			aggregated = append(aggregated, item)
			continue
		}
		aggregated[position].Quantity = round2(aggregated[position].Quantity + item.Quantity)
	}
	return aggregated
}

// validateShoppingInput enforces the shopping line invariants.
func validateShoppingInput(value ShoppingInput) error {
	label := strings.TrimSpace(value.Label)
	if len(label) == 0 || len(label) > 200 {
		return core.Invalid("Label is required and must fit the length limit")
	}
	if !oneOf(value.Unit, foodUnits) {
		return core.Invalid("Invalid unit")
	}
	if value.Quantity < 0 || value.Quantity > maxShoppingQuantity {
		return core.Invalid("Quantity is out of range")
	}
	return nil
}
