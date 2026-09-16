package nutrition

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"personal-life/api/internal/core"
)

// planItemRow is the stored planned item before nutrition is resolved.
type planItemRow struct {
	ID       string  `json:"id"`
	DayIndex int     `json:"day_index"`
	Meal     string  `json:"meal"`
	RecipeID *string `json:"recipe_id"`
	FoodID   *string `json:"food_id"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	Position float64 `json:"position"`
}

// ListTemplates returns reusable plan templates with their items.
func ListTemplates(requestContext context.Context, database core.Database) ([]MealPlan, error) {
	plans, operationError := core.List[MealPlan](requestContext, database, "SELECT to_jsonb(plan) FROM meal_plans plan WHERE plan.is_template ORDER BY lower(plan.name), plan.id")
	if operationError != nil {
		return nil, operationError
	}
	for index := range plans {
		if plans[index], operationError = assemblePlan(requestContext, database, plans[index]); operationError != nil {
			return nil, operationError
		}
	}
	return plans, nil
}

// GetPlanForWeek returns the concrete plan for a Monday, or nil when absent.
func GetPlanForWeek(requestContext context.Context, database core.Database, weekStart string) (*MealPlan, error) {
	plan, operationError := core.One[MealPlan](requestContext, database, "SELECT to_jsonb(plan) FROM meal_plans plan WHERE week_start=$1", weekStart)
	if operationError != nil {
		if errors.Is(operationError, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, operationError
	}
	assembled, operationError := assemblePlan(requestContext, database, plan)
	if operationError != nil {
		return nil, operationError
	}
	return &assembled, nil
}

// GetPlan returns one plan with its items.
func GetPlan(requestContext context.Context, database core.Database, identifier string) (MealPlan, error) {
	plan, operationError := core.One[MealPlan](requestContext, database, "SELECT to_jsonb(plan) FROM meal_plans plan WHERE id=$1", identifier)
	if operationError != nil {
		return MealPlan{}, operationError
	}
	return assemblePlan(requestContext, database, plan)
}

// CreatePlan inserts a concrete week or a template.
func CreatePlan(requestContext context.Context, database core.Database, value PlanInput) (MealPlan, error) {
	plan, operationError := core.One[MealPlan](requestContext, database, `INSERT INTO meal_plans(name,week_start,is_template) VALUES($1,$2,$3) RETURNING to_jsonb(meal_plans)`, value.Name, value.WeekStart, value.IsTemplate)
	if operationError != nil {
		return MealPlan{}, operationError
	}
	return assemblePlan(requestContext, database, plan)
}

// RenamePlan updates the plan name.
func RenamePlan(requestContext context.Context, database core.Database, identifier, name string) (MealPlan, error) {
	plan, operationError := core.One[MealPlan](requestContext, database, "UPDATE meal_plans SET name=$2,updated_at=now() WHERE id=$1 RETURNING to_jsonb(meal_plans)", identifier, name)
	if operationError != nil {
		return MealPlan{}, operationError
	}
	return assemblePlan(requestContext, database, plan)
}

// DeletePlan removes a plan and its items.
func DeletePlan(requestContext context.Context, database core.Database, identifier string) error {
	tag, operationError := database.Exec(requestContext, "DELETE FROM meal_plans WHERE id=$1", identifier)
	if operationError != nil {
		return operationError
	}
	if tag.RowsAffected() == 0 {
		return core.Error{Status: 404, Message: "Resource not found"}
	}
	return nil
}

// InsertPlanItem appends one planned item.
func InsertPlanItem(requestContext context.Context, database core.Database, planID string, value PlanItemInput, unit string) error {
	_, operationError := database.Exec(requestContext, `INSERT INTO meal_plan_items(plan_id,day_index,meal,recipe_id,food_id,quantity,unit,position)
 VALUES($1,$2,$3,$4,$5,$6,$7,1024)`, planID, value.DayIndex, value.Meal, value.RecipeID, value.FoodID, value.Quantity, unit)
	return operationError
}

// UpdatePlanItem changes the day, meal and quantity of an item.
func UpdatePlanItem(requestContext context.Context, database core.Database, identifier string, dayIndex int, meal string, quantity float64) error {
	tag, operationError := database.Exec(requestContext, "UPDATE meal_plan_items SET day_index=$2,meal=$3,quantity=$4 WHERE id=$1", identifier, dayIndex, meal, quantity)
	if operationError != nil {
		return operationError
	}
	if tag.RowsAffected() == 0 {
		return core.Error{Status: 404, Message: "Resource not found"}
	}
	return nil
}

// DeletePlanItem removes one planned item.
func DeletePlanItem(requestContext context.Context, database core.Database, identifier string) error {
	tag, operationError := database.Exec(requestContext, "DELETE FROM meal_plan_items WHERE id=$1", identifier)
	if operationError != nil {
		return operationError
	}
	if tag.RowsAffected() == 0 {
		return core.Error{Status: 404, Message: "Resource not found"}
	}
	return nil
}

// CopyPlanItems replaces the target items with a copy of the source items.
// Diary entries derived from the replaced target items are removed so a later
// log starts from a clean state.
func CopyPlanItems(requestContext context.Context, database core.Database, sourceID, targetID string) error {
	if operationError := DeletePlannedDiaryEntriesForPlan(requestContext, database, targetID); operationError != nil {
		return operationError
	}
	if _, operationError := database.Exec(requestContext, "DELETE FROM meal_plan_items WHERE plan_id=$1", targetID); operationError != nil {
		return operationError
	}
	_, operationError := database.Exec(requestContext, `INSERT INTO meal_plan_items(plan_id,day_index,meal,recipe_id,food_id,quantity,unit,position)
 SELECT $2,day_index,meal,recipe_id,food_id,quantity,unit,position FROM meal_plan_items WHERE plan_id=$1`, sourceID, targetID)
	return operationError
}

// DeletePlannedDiaryEntriesForPlan removes every diary entry derived from a plan.
func DeletePlannedDiaryEntriesForPlan(requestContext context.Context, database core.Database, planID string) error {
	_, operationError := database.Exec(requestContext, "DELETE FROM diary_entries WHERE plan_item_id IN (SELECT id FROM meal_plan_items WHERE plan_id=$1)", planID)
	return operationError
}

// DeletePlannedDiaryEntries removes previously logged entries for the given items.
func DeletePlannedDiaryEntries(requestContext context.Context, database core.Database, itemIDs []string) error {
	if len(itemIDs) == 0 {
		return nil
	}
	_, operationError := database.Exec(requestContext, "DELETE FROM diary_entries WHERE plan_item_id = ANY($1::uuid[])", itemIDs)
	return operationError
}

func planItems(requestContext context.Context, database core.Database, planID string) ([]planItemRow, error) {
	return core.List[planItemRow](requestContext, database, "SELECT to_jsonb(item) FROM meal_plan_items item WHERE plan_id=$1 ORDER BY day_index, meal, position, id", planID)
}

func assemblePlan(requestContext context.Context, database core.Database, plan MealPlan) (MealPlan, error) {
	rows, operationError := planItems(requestContext, database, plan.ID)
	if operationError != nil {
		return MealPlan{}, operationError
	}
	recipeIDs := make([]string, 0)
	foodIDs := make([]string, 0)
	for _, row := range rows {
		if row.RecipeID != nil {
			recipeIDs = append(recipeIDs, *row.RecipeID)
		} else if row.FoodID != nil {
			foodIDs = append(foodIDs, *row.FoodID)
		}
	}
	recipes, operationError := recipesByIDs(requestContext, database, recipeIDs)
	if operationError != nil {
		return MealPlan{}, operationError
	}
	foods, operationError := foodsByIDs(requestContext, database, foodIDs)
	if operationError != nil {
		return MealPlan{}, operationError
	}
	items := make([]PlanItem, 0, len(rows))
	for _, row := range rows {
		item := PlanItem{
			ID:       row.ID,
			DayIndex: row.DayIndex,
			Meal:     row.Meal,
			RecipeID: row.RecipeID,
			FoodID:   row.FoodID,
			Quantity: row.Quantity,
			Unit:     row.Unit,
			Position: row.Position,
		}
		if row.RecipeID != nil {
			recipe, present := recipes[*row.RecipeID]
			if !present {
				return MealPlan{}, core.Error{Status: 404, Message: "Resource not found"}
			}
			item.Label = recipe.Name
			item.Unit = "unit"
			item.DiaryTotals = multiplyNutrients(recipe.PerServing, row.Quantity)
		} else if row.FoodID != nil {
			food, present := foods[*row.FoodID]
			if !present {
				return MealPlan{}, core.Error{Status: 404, Message: "Resource not found"}
			}
			item.Label = food.Name
			item.Unit = food.BaseUnit
			item.DiaryTotals = foodTotals(food, row.Quantity)
		}
		items = append(items, item)
	}
	plan.Items = items
	return plan, nil
}
