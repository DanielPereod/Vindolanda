package nutrition

import (
	"context"
	"personal-life/api/internal/core"
)

// GetProfile returns the singleton nutrition profile.
func GetProfile(requestContext context.Context, database core.Database) (Profile, error) {
	return core.One[Profile](requestContext, database, "SELECT to_jsonb(item) - 'singleton' FROM nutrition_profiles item")
}

// UpdateProfile upserts the singleton nutrition profile.
func UpdateProfile(requestContext context.Context, database core.Database, value ProfileInput) (Profile, error) {
	return core.One[Profile](requestContext, database, `INSERT INTO nutrition_profiles(singleton,weight_kg,height_cm,age,sex,activity_level,goal,target_calories,target_protein_g,target_carbs_g,target_fat_g,target_fiber_g,target_water_ml,target_mode)
 VALUES(true,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
 ON CONFLICT (singleton) DO UPDATE SET weight_kg=EXCLUDED.weight_kg,height_cm=EXCLUDED.height_cm,age=EXCLUDED.age,sex=EXCLUDED.sex,activity_level=EXCLUDED.activity_level,goal=EXCLUDED.goal,target_calories=EXCLUDED.target_calories,target_protein_g=EXCLUDED.target_protein_g,target_carbs_g=EXCLUDED.target_carbs_g,target_fat_g=EXCLUDED.target_fat_g,target_fiber_g=EXCLUDED.target_fiber_g,target_water_ml=EXCLUDED.target_water_ml,target_mode=EXCLUDED.target_mode,updated_at=now()
 RETURNING to_jsonb(nutrition_profiles) - 'singleton'`, value.WeightKg, value.HeightCm, value.Age, value.Sex, value.ActivityLevel, value.Goal, value.TargetCalories, value.TargetProteinG, value.TargetCarbsG, value.TargetFatG, value.TargetFiberG, value.TargetWaterMl, value.TargetMode)
}
