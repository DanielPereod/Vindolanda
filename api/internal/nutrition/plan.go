package nutrition

import (
	"strings"
	"time"

	"personal-life/api/internal/core"
)

// PlanInput is the editable representation of a meal plan.
type PlanInput struct {
	Name       string  `json:"name"`
	WeekStart  *string `json:"week_start"`
	IsTemplate bool    `json:"is_template"`
}

// PlanItemInput is one planned meal.
type PlanItemInput struct {
	DayIndex int     `json:"day_index"`
	Meal     string  `json:"meal"`
	RecipeID *string `json:"recipe_id"`
	FoodID   *string `json:"food_id"`
	Quantity float64 `json:"quantity"`
}

// PlanItem includes the planned source, label and computed nutrition.
type PlanItem struct {
	ID       string  `json:"id"`
	DayIndex int     `json:"day_index"`
	Meal     string  `json:"meal"`
	RecipeID *string `json:"recipe_id"`
	FoodID   *string `json:"food_id"`
	Label    string  `json:"label"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	Position float64 `json:"position"`
	DiaryTotals
}

// MealPlan is a concrete week or a reusable template.
type MealPlan struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	WeekStart  *string    `json:"week_start"`
	IsTemplate bool       `json:"is_template"`
	Items      []PlanItem `json:"items"`
	CreatedAt  string     `json:"created_at"`
	UpdatedAt  string     `json:"updated_at"`
}

// mondayOf returns the ISO Monday of the week containing the given date.
func mondayOf(date string) string {
	parsed, operationError := time.Parse("2006-01-02", date)
	if operationError != nil {
		return date
	}
	offset := (int(parsed.Weekday()) + 6) % 7
	return parsed.AddDate(0, 0, -offset).Format("2006-01-02")
}

// addDays shifts an ISO date by whole days.
func addDays(date string, days int) string {
	parsed, operationError := time.Parse("2006-01-02", date)
	if operationError != nil {
		return date
	}
	return parsed.AddDate(0, 0, days).Format("2006-01-02")
}

// validatePlanInput enforces the plan invariants.
func validatePlanInput(value PlanInput) error {
	name := strings.TrimSpace(value.Name)
	if len(name) == 0 || len(name) > 200 {
		return core.Invalid("Name is required and must fit the length limit")
	}
	if value.IsTemplate {
		if value.WeekStart != nil {
			return core.Invalid("Templates cannot have a week")
		}
		return nil
	}
	if value.WeekStart == nil || !validEntryDate(*value.WeekStart) {
		return core.Invalid("A valid week start is required")
	}
	return nil
}

// validatePlanItemInput enforces the planned meal invariants.
func validatePlanItemInput(value PlanItemInput) error {
	if value.DayIndex < 0 || value.DayIndex > 6 {
		return core.Invalid("Invalid day")
	}
	if !oneOf(value.Meal, meals) {
		return core.Invalid("Invalid meal")
	}
	hasRecipe := value.RecipeID != nil && strings.TrimSpace(*value.RecipeID) != ""
	hasFood := value.FoodID != nil && strings.TrimSpace(*value.FoodID) != ""
	if hasRecipe == hasFood {
		return core.Invalid("Exactly one source is required")
	}
	if value.Quantity <= 0 || value.Quantity > maxBaseQuantity {
		return core.Invalid("Quantity is out of range")
	}
	return nil
}

// foodTotals scales a food snapshot to the given quantity.
func foodTotals(food Food, quantity float64) DiaryTotals {
	factor := 0.0
	if food.BaseQuantity > 0 {
		factor = quantity / food.BaseQuantity
	}
	totals := DiaryTotals{
		CaloriesKcal:   round2(food.CaloriesKcal * factor),
		ProteinG:       round2(food.ProteinG * factor),
		CarbsG:         round2(food.CarbsG * factor),
		FatG:           round2(food.FatG * factor),
		FiberG:         round2(food.FiberG * factor),
		SugarG:         round2(food.SugarG * factor),
		SaturatedFatG:  round2(food.SaturatedFatG * factor),
		SaltG:          round2(food.SaltG * factor),
		SodiumMg:       round2(food.SodiumMg * factor),
		Micronutrients: map[string]float64{},
	}
	for name, amount := range food.Micronutrients {
		totals.Micronutrients[name] = round2(amount * factor)
	}
	return totals
}
