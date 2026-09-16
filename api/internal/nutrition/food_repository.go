package nutrition

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"personal-life/api/internal/core"
)

func encodeMicronutrients(value map[string]float64) (string, error) {
	if value == nil {
		value = map[string]float64{}
	}
	encoded, operationError := json.Marshal(value)
	if operationError != nil {
		return "", operationError
	}
	return string(encoded), nil
}

// ListFoods searches the local catalog by name, brand or barcode.
func ListFoods(requestContext context.Context, database core.Database, query string, favoritesOnly bool, limit, offset int) ([]Food, error) {
	clauses := make([]string, 0, 2)
	arguments := make([]any, 0, 3)
	if trimmed := strings.TrimSpace(query); trimmed != "" {
		arguments = append(arguments, trimmed)
		placeholder := fmt.Sprintf("$%d", len(arguments))
		clauses = append(clauses, fmt.Sprintf("(strpos(lower(food.name), lower(%s)) > 0 OR strpos(lower(food.brand), lower(%s)) > 0 OR food.barcode = %s)", placeholder, placeholder, placeholder))
	}
	if favoritesOnly {
		clauses = append(clauses, "food.favorite")
	}
	statement := "SELECT to_jsonb(food) FROM foods food"
	if len(clauses) > 0 {
		statement += " WHERE " + strings.Join(clauses, " AND ")
	}
	arguments = append(arguments, limit, offset)
	statement += fmt.Sprintf(" ORDER BY food.favorite DESC, lower(food.name), food.id LIMIT $%d OFFSET $%d", len(arguments)-1, len(arguments))
	return core.List[Food](requestContext, database, statement, arguments...)
}

// GetFood returns one catalog food or a not-found error.
func GetFood(requestContext context.Context, database core.Database, identifier string) (Food, error) {
	return core.One[Food](requestContext, database, "SELECT to_jsonb(food) FROM foods food WHERE id=$1", identifier)
}

// CreateFood inserts a manual catalog food.
func CreateFood(requestContext context.Context, database core.Database, value FoodInput) (Food, error) {
	return createFood(requestContext, database, value, "manual")
}

func createFood(requestContext context.Context, database core.Database, value FoodInput, source string) (Food, error) {
	micronutrients, operationError := encodeMicronutrients(value.Micronutrients)
	if operationError != nil {
		return Food{}, operationError
	}
	return core.One[Food](requestContext, database, `INSERT INTO foods(name,brand,barcode,base_quantity,base_unit,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,salt_g,sodium_mg,micronutrients,favorite,source)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)
 RETURNING to_jsonb(foods)`, value.Name, value.Brand, normalizeBarcode(value.Barcode), value.BaseQuantity, value.BaseUnit, value.CaloriesKcal, value.ProteinG, value.CarbsG, value.FatG, value.FiberG, value.SugarG, value.SaturatedFatG, value.SaltG, value.SodiumMg, micronutrients, value.Favorite, source)
}

// UpdateFood replaces the editable fields of a catalog food.
func UpdateFood(requestContext context.Context, database core.Database, identifier string, value FoodInput) (Food, error) {
	micronutrients, operationError := encodeMicronutrients(value.Micronutrients)
	if operationError != nil {
		return Food{}, operationError
	}
	return core.One[Food](requestContext, database, `UPDATE foods SET name=$2,brand=$3,barcode=$4,base_quantity=$5,base_unit=$6,calories_kcal=$7,protein_g=$8,carbs_g=$9,fat_g=$10,fiber_g=$11,sugar_g=$12,saturated_fat_g=$13,salt_g=$14,sodium_mg=$15,micronutrients=$16::jsonb,favorite=$17,updated_at=now()
 WHERE id=$1 RETURNING to_jsonb(foods)`, identifier, value.Name, value.Brand, normalizeBarcode(value.Barcode), value.BaseQuantity, value.BaseUnit, value.CaloriesKcal, value.ProteinG, value.CarbsG, value.FatG, value.FiberG, value.SugarG, value.SaturatedFatG, value.SaltG, value.SodiumMg, micronutrients, value.Favorite)
}

// DeleteFood removes a catalog food.
func DeleteFood(requestContext context.Context, database core.Database, identifier string) error {
	tag, operationError := database.Exec(requestContext, "DELETE FROM foods WHERE id=$1", identifier)
	if operationError != nil {
		return operationError
	}
	if tag.RowsAffected() == 0 {
		return core.Error{Status: 404, Message: "Resource not found"}
	}
	return nil
}

// MatchFoodByName finds the closest catalog food for an imported ingredient.
func MatchFoodByName(requestContext context.Context, database core.Database, name string) (Food, bool, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return Food{}, false, nil
	}
	food, operationError := core.One[Food](requestContext, database, "SELECT to_jsonb(food) FROM foods food WHERE lower(food.name)=lower($1) ORDER BY food.favorite DESC, food.id LIMIT 1", trimmed)
	if operationError == nil {
		return food, true, nil
	}
	if !errors.Is(operationError, pgx.ErrNoRows) {
		return Food{}, false, operationError
	}
	if len([]rune(trimmed)) < 3 {
		return Food{}, false, nil
	}
	food, operationError = core.One[Food](requestContext, database, "SELECT to_jsonb(food) FROM foods food WHERE strpos(lower(food.name), lower($1)) > 0 ORDER BY length(food.name), food.favorite DESC, food.id LIMIT 1", trimmed)
	if errors.Is(operationError, pgx.ErrNoRows) {
		return Food{}, false, nil
	}
	if operationError != nil {
		return Food{}, false, operationError
	}
	return food, true, nil
}

// foodsByIDs loads several catalog foods at once.
func foodsByIDs(requestContext context.Context, database core.Database, identifiers []string) (map[string]Food, error) {
	foods := map[string]Food{}
	if len(identifiers) == 0 {
		return foods, nil
	}
	values, operationError := core.List[Food](requestContext, database, "SELECT to_jsonb(food) FROM foods food WHERE food.id = ANY($1::uuid[])", identifiers)
	if operationError != nil {
		return nil, operationError
	}
	for _, food := range values {
		foods[food.ID] = food
	}
	return foods, nil
}
