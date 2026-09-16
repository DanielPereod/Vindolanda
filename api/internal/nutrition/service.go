package nutrition

import (
	"math"

	"personal-life/api/internal/core"
)

var allowedSexes = []string{"male", "female", "other"}
var allowedActivityLevels = []string{"sedentary", "light", "moderate", "active", "very_active"}
var allowedGoals = []string{"lose", "maintain", "gain"}
var allowedTargetModes = []string{"auto", "manual"}

var activityFactors = map[string]float64{
	"sedentary":   1.2,
	"light":       1.375,
	"moderate":    1.55,
	"active":      1.725,
	"very_active": 1.9,
}

// macroSplits maps each goal to its protein, carbohydrate and fat energy share.
var macroSplits = map[string][3]float64{
	"lose":     {0.35, 0.35, 0.30},
	"maintain": {0.30, 0.40, 0.30},
	"gain":     {0.30, 0.45, 0.25},
}

const (
	losingAdjustment  = 0.85
	gainingAdjustment = 1.10
	fiberPerThousand  = 14
	waterPerKilogram  = 35
)

// BasalMetabolicRate returns the Mifflin-St Jeor basal rate in kilocalories.
func BasalMetabolicRate(value ProfileInput) float64 {
	base := 10*value.WeightKg + 6.25*value.HeightCm - 5*float64(value.Age)
	switch value.Sex {
	case "male":
		return base + 5
	case "female":
		return base - 161
	default:
		return base - 78
	}
}

// applyAutoTargets replaces stored targets with derived values when the profile is in auto mode.
// While the identity data is incomplete it preserves the stored targets instead of wiping them.
func applyAutoTargets(value *ProfileInput) {
	if value.TargetMode != "auto" {
		return
	}
	calories, calculated := autoCalories(*value)
	if !calculated {
		return
	}
	split := macroSplits[value.Goal]
	value.TargetCalories = calories
	value.TargetProteinG = math.Round(float64(calories) * split[0] / 4)
	value.TargetCarbsG = math.Round(float64(calories) * split[1] / 4)
	value.TargetFatG = math.Round(float64(calories) * split[2] / 9)
	value.TargetFiberG = math.Round(float64(calories) * fiberPerThousand / 1000)
	value.TargetWaterMl = int(math.Round(value.WeightKg * waterPerKilogram))
}

func autoCalories(value ProfileInput) (int, bool) {
	if value.WeightKg <= 0 || value.HeightCm <= 0 || value.Age <= 0 {
		return 0, false
	}
	basal := BasalMetabolicRate(value)
	if basal <= 0 {
		return 0, false
	}
	factor, knownActivity := activityFactors[value.ActivityLevel]
	if !knownActivity {
		return 0, false
	}
	if _, knownGoal := macroSplits[value.Goal]; !knownGoal {
		return 0, false
	}
	maintenance := basal * factor
	switch value.Goal {
	case "lose":
		maintenance *= losingAdjustment
	case "gain":
		maintenance *= gainingAdjustment
	}
	return int(math.Round(maintenance)), true
}

func oneOf(value string, allowed []string) bool {
	for _, candidate := range allowed {
		if candidate == value {
			return true
		}
	}
	return false
}

// validate enforces the profile invariants before persistence.
func validate(value ProfileInput) error {
	if !oneOf(value.Sex, allowedSexes) {
		return core.Invalid("Invalid sex")
	}
	if !oneOf(value.ActivityLevel, allowedActivityLevels) {
		return core.Invalid("Invalid activity level")
	}
	if !oneOf(value.Goal, allowedGoals) {
		return core.Invalid("Invalid goal")
	}
	if !oneOf(value.TargetMode, allowedTargetModes) {
		return core.Invalid("Invalid target mode")
	}
	if value.WeightKg < 0 || value.WeightKg > 1000 {
		return core.Invalid("Weight must be between 0 and 1000 kg")
	}
	if value.HeightCm < 0 || value.HeightCm > 300 {
		return core.Invalid("Height must be between 0 and 300 cm")
	}
	if value.Age < 0 || value.Age > 130 {
		return core.Invalid("Age must be between 0 and 130")
	}
	if value.TargetCalories < 0 || value.TargetProteinG < 0 || value.TargetCarbsG < 0 ||
		value.TargetFatG < 0 || value.TargetFiberG < 0 || value.TargetWaterMl < 0 {
		return core.Invalid("Targets cannot be negative")
	}
	return nil
}
