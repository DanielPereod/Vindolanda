package nutrition

import (
	"time"

	"personal-life/api/internal/core"
)

// DiaryEntryInput is the editable representation of a logged food.
type DiaryEntryInput struct {
	EntryDate string  `json:"entry_date"`
	Meal      string  `json:"meal"`
	FoodID    string  `json:"food_id"`
	Quantity  float64 `json:"quantity"`
	Unit      string  `json:"unit"`
}

// DiaryEntry is a frozen nutrition snapshot taken when a food was logged.
type DiaryEntry struct {
	ID             string             `json:"id"`
	EntryDate      string             `json:"entry_date"`
	Meal           string             `json:"meal"`
	FoodID         *string            `json:"food_id"`
	PlanItemID     *string            `json:"plan_item_id"`
	Label          string             `json:"label"`
	Quantity       float64            `json:"quantity"`
	Unit           string             `json:"unit"`
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
	CreatedAt      string             `json:"created_at"`
}

// DiaryTotals aggregates a day of entries.
type DiaryTotals struct {
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
}

// DiaryTargets mirrors the daily objectives from the profile.
type DiaryTargets struct {
	CaloriesKcal int     `json:"calories_kcal"`
	ProteinG     float64 `json:"protein_g"`
	CarbsG       float64 `json:"carbs_g"`
	FatG         float64 `json:"fat_g"`
	FiberG       float64 `json:"fiber_g"`
	WaterMl      int     `json:"water_ml"`
}

// DiaryDay is the full projection returned for one date.
type DiaryDay struct {
	EntryDate string       `json:"entry_date"`
	WaterMl   int          `json:"water_ml"`
	Entries   []DiaryEntry `json:"entries"`
	Totals    DiaryTotals  `json:"totals"`
	Targets   DiaryTargets `json:"targets"`
}

var meals = []string{"breakfast", "lunch", "dinner", "snack"}

func validEntryDate(value string) bool {
	_, operationError := time.Parse("2006-01-02", value)
	return operationError == nil
}

// validateDiaryEntry checks a new entry against the referenced food.
func validateDiaryEntry(value DiaryEntryInput, food Food) error {
	if operationError := validateDiaryUpdate(value.EntryDate, value.Meal, value.Quantity); operationError != nil {
		return operationError
	}
	if food.BaseQuantity <= 0 {
		return core.Invalid("Food has no base portion")
	}
	if value.Unit != "" && value.Unit != food.BaseUnit {
		return core.Invalid("Unit does not match the food")
	}
	return nil
}

// validateDiaryUpdate checks the fields that can change after logging.
func validateDiaryUpdate(entryDate, meal string, quantity float64) error {
	if !validEntryDate(entryDate) {
		return core.Invalid("Invalid entry date")
	}
	if !oneOf(meal, meals) {
		return core.Invalid("Invalid meal")
	}
	if quantity <= 0 || quantity > maxBaseQuantity {
		return core.Invalid("Quantity is out of range")
	}
	return nil
}

// scaleFood freezes a food snapshot scaled to the logged quantity.
func scaleFood(food Food, quantity float64) DiaryEntry {
	totals := foodTotals(food, quantity)
	return DiaryEntry{
		Label:          food.Name,
		Quantity:       quantity,
		Unit:           food.BaseUnit,
		CaloriesKcal:   totals.CaloriesKcal,
		ProteinG:       totals.ProteinG,
		CarbsG:         totals.CarbsG,
		FatG:           totals.FatG,
		FiberG:         totals.FiberG,
		SugarG:         totals.SugarG,
		SaturatedFatG:  totals.SaturatedFatG,
		SaltG:          totals.SaltG,
		SodiumMg:       totals.SodiumMg,
		Micronutrients: totals.Micronutrients,
	}
}

// rescaleEntry adjusts an existing snapshot proportionally to a new quantity.
func rescaleEntry(source DiaryEntry, factor float64) DiaryEntry {
	source.CaloriesKcal = round2(source.CaloriesKcal * factor)
	source.ProteinG = round2(source.ProteinG * factor)
	source.CarbsG = round2(source.CarbsG * factor)
	source.FatG = round2(source.FatG * factor)
	source.FiberG = round2(source.FiberG * factor)
	source.SugarG = round2(source.SugarG * factor)
	source.SaturatedFatG = round2(source.SaturatedFatG * factor)
	source.SaltG = round2(source.SaltG * factor)
	source.SodiumMg = round2(source.SodiumMg * factor)
	if len(source.Micronutrients) > 0 {
		scaled := make(map[string]float64, len(source.Micronutrients))
		for name, amount := range source.Micronutrients {
			scaled[name] = round2(amount * factor)
		}
		source.Micronutrients = scaled
	}
	return source
}

// sumEntries aggregates entries into day totals.
func sumEntries(entries []DiaryEntry) DiaryTotals {
	totals := DiaryTotals{Micronutrients: map[string]float64{}}
	for _, entry := range entries {
		totals.CaloriesKcal += entry.CaloriesKcal
		totals.ProteinG += entry.ProteinG
		totals.CarbsG += entry.CarbsG
		totals.FatG += entry.FatG
		totals.FiberG += entry.FiberG
		totals.SugarG += entry.SugarG
		totals.SaturatedFatG += entry.SaturatedFatG
		totals.SaltG += entry.SaltG
		totals.SodiumMg += entry.SodiumMg
		for name, amount := range entry.Micronutrients {
			totals.Micronutrients[name] += amount
		}
	}
	totals.CaloriesKcal = round2(totals.CaloriesKcal)
	totals.ProteinG = round2(totals.ProteinG)
	totals.CarbsG = round2(totals.CarbsG)
	totals.FatG = round2(totals.FatG)
	totals.FiberG = round2(totals.FiberG)
	totals.SugarG = round2(totals.SugarG)
	totals.SaturatedFatG = round2(totals.SaturatedFatG)
	totals.SaltG = round2(totals.SaltG)
	totals.SodiumMg = round2(totals.SodiumMg)
	for name, amount := range totals.Micronutrients {
		totals.Micronutrients[name] = round2(amount)
	}
	return totals
}
