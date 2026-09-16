package nutrition

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"personal-life/api/internal/core"
)

// ListDiaryEntries returns one day of entries in logging order.
func ListDiaryEntries(requestContext context.Context, database core.Database, entryDate string) ([]DiaryEntry, error) {
	return core.List[DiaryEntry](requestContext, database, "SELECT to_jsonb(entry) FROM diary_entries entry WHERE entry_date=$1 ORDER BY created_at, id", entryDate)
}

// GetDiaryEntry returns one logged entry.
func GetDiaryEntry(requestContext context.Context, database core.Database, identifier string) (DiaryEntry, error) {
	return core.One[DiaryEntry](requestContext, database, "SELECT to_jsonb(entry) FROM diary_entries entry WHERE id=$1", identifier)
}

// GetDiaryWater returns the stored water for a date, or zero when none exists.
func GetDiaryWater(requestContext context.Context, database core.Database, entryDate string) (int, error) {
	var waterMl int
	operationError := database.QueryRow(requestContext, "SELECT water_ml FROM diary_days WHERE entry_date=$1", entryDate).Scan(&waterMl)
	if errors.Is(operationError, pgx.ErrNoRows) {
		return 0, nil
	}
	return waterMl, operationError
}

// CreateDiaryEntry stores a frozen snapshot.
func CreateDiaryEntry(requestContext context.Context, database core.Database, value DiaryEntry) (DiaryEntry, error) {
	micronutrients, operationError := encodeMicronutrients(value.Micronutrients)
	if operationError != nil {
		return DiaryEntry{}, operationError
	}
	return core.One[DiaryEntry](requestContext, database, `INSERT INTO diary_entries(entry_date,meal,food_id,plan_item_id,label,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,salt_g,sodium_mg,micronutrients)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
 RETURNING to_jsonb(diary_entries)`, value.EntryDate, value.Meal, value.FoodID, value.PlanItemID, value.Label, value.Quantity, value.Unit, value.CaloriesKcal, value.ProteinG, value.CarbsG, value.FatG, value.FiberG, value.SugarG, value.SaturatedFatG, value.SaltG, value.SodiumMg, micronutrients)
}

// UpdateDiaryEntry replaces the editable fields and the frozen snapshot.
func UpdateDiaryEntry(requestContext context.Context, database core.Database, identifier string, value DiaryEntry) (DiaryEntry, error) {
	micronutrients, operationError := encodeMicronutrients(value.Micronutrients)
	if operationError != nil {
		return DiaryEntry{}, operationError
	}
	return core.One[DiaryEntry](requestContext, database, `UPDATE diary_entries SET entry_date=$2,meal=$3,label=$4,quantity=$5,unit=$6,calories_kcal=$7,protein_g=$8,carbs_g=$9,fat_g=$10,fiber_g=$11,sugar_g=$12,saturated_fat_g=$13,salt_g=$14,sodium_mg=$15,micronutrients=$16::jsonb
 WHERE id=$1 RETURNING to_jsonb(diary_entries)`, identifier, value.EntryDate, value.Meal, value.Label, value.Quantity, value.Unit, value.CaloriesKcal, value.ProteinG, value.CarbsG, value.FatG, value.FiberG, value.SugarG, value.SaturatedFatG, value.SaltG, value.SodiumMg, micronutrients)
}

// DeleteDiaryEntry removes a logged entry.
func DeleteDiaryEntry(requestContext context.Context, database core.Database, identifier string) error {
	tag, operationError := database.Exec(requestContext, "DELETE FROM diary_entries WHERE id=$1", identifier)
	if operationError != nil {
		return operationError
	}
	if tag.RowsAffected() == 0 {
		return core.Error{Status: 404, Message: "Resource not found"}
	}
	return nil
}

// SetDiaryWater upserts the water intake for a date.
func SetDiaryWater(requestContext context.Context, database core.Database, entryDate string, waterMl int) (int, error) {
	var stored int
	operationError := database.QueryRow(requestContext, `INSERT INTO diary_days(entry_date,water_ml,updated_at) VALUES($1,$2,now())
 ON CONFLICT (entry_date) DO UPDATE SET water_ml=EXCLUDED.water_ml,updated_at=now()
 RETURNING water_ml`, entryDate, waterMl).Scan(&stored)
	return stored, operationError
}
