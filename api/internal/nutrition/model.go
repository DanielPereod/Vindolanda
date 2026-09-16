// Package nutrition owns the nutrition profile, food catalog, diary, recipes and meal plans.
package nutrition

// ProfileInput is the editable representation of the single nutrition profile.
type ProfileInput struct {
	WeightKg       float64 `json:"weight_kg"`
	HeightCm       float64 `json:"height_cm"`
	Age            int     `json:"age"`
	Sex            string  `json:"sex"`
	ActivityLevel  string  `json:"activity_level"`
	Goal           string  `json:"goal"`
	TargetCalories int     `json:"target_calories"`
	TargetProteinG float64 `json:"target_protein_g"`
	TargetCarbsG   float64 `json:"target_carbs_g"`
	TargetFatG     float64 `json:"target_fat_g"`
	TargetFiberG   float64 `json:"target_fiber_g"`
	TargetWaterMl  int     `json:"target_water_ml"`
	TargetMode     string  `json:"target_mode"`
}

// Profile includes server-managed metadata.
type Profile struct {
	ProfileInput
	UpdatedAt string `json:"updated_at"`
}
