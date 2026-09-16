package nutrition

import (
	"context"

	"personal-life/api/internal/core"
)

// ListShopping returns the shopping list in display order.
func ListShopping(requestContext context.Context, database core.Database) ([]ShoppingItem, error) {
	return core.List[ShoppingItem](requestContext, database, "SELECT to_jsonb(item) FROM shopping_items item ORDER BY item.checked, lower(item.label), item.id")
}

// GetShoppingItem returns one shopping line.
func GetShoppingItem(requestContext context.Context, database core.Database, identifier string) (ShoppingItem, error) {
	return core.One[ShoppingItem](requestContext, database, "SELECT to_jsonb(item) FROM shopping_items item WHERE id=$1", identifier)
}

// CreateShoppingItem inserts a manual shopping line.
func CreateShoppingItem(requestContext context.Context, database core.Database, value ShoppingInput, source string) (ShoppingItem, error) {
	return core.One[ShoppingItem](requestContext, database, `INSERT INTO shopping_items(label,quantity,unit,checked,source,food_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING to_jsonb(shopping_items)`, value.Label, value.Quantity, value.Unit, value.Checked, source, value.FoodID)
}

// UpdateShoppingItem replaces the editable fields of a shopping line.
func UpdateShoppingItem(requestContext context.Context, database core.Database, identifier string, value ShoppingInput) (ShoppingItem, error) {
	return core.One[ShoppingItem](requestContext, database, `UPDATE shopping_items SET label=$2,quantity=$3,unit=$4,checked=$5,food_id=$6,updated_at=now() WHERE id=$1 RETURNING to_jsonb(shopping_items)`, identifier, value.Label, value.Quantity, value.Unit, value.Checked, value.FoodID)
}

// DeleteShoppingItem removes one shopping line.
func DeleteShoppingItem(requestContext context.Context, database core.Database, identifier string) error {
	tag, operationError := database.Exec(requestContext, "DELETE FROM shopping_items WHERE id=$1", identifier)
	if operationError != nil {
		return operationError
	}
	if tag.RowsAffected() == 0 {
		return core.Error{Status: 404, Message: "Resource not found"}
	}
	return nil
}

// DeleteCheckedShoppingItems clears every checked line.
func DeleteCheckedShoppingItems(requestContext context.Context, database core.Database) error {
	_, operationError := database.Exec(requestContext, "DELETE FROM shopping_items WHERE checked")
	return operationError
}

// ReplaceGeneratedShoppingItems swaps the generated lines for a fresh set.
func ReplaceGeneratedShoppingItems(requestContext context.Context, database core.Database, items []shoppingContribution, source string) error {
	if _, operationError := database.Exec(requestContext, "DELETE FROM shopping_items WHERE source <> 'manual'"); operationError != nil {
		return operationError
	}
	for _, item := range items {
		foodID := item.FoodID
		if _, operationError := database.Exec(requestContext, `INSERT INTO shopping_items(label,quantity,unit,checked,source,food_id) VALUES($1,$2,$3,false,$4,$5)`, item.Label, item.Quantity, item.Unit, source, foodID); operationError != nil {
			return operationError
		}
	}
	return nil
}
