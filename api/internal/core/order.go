package core

import "context"

// Positioned identifies a sibling's stable manual position.
type Positioned struct {
	ID       string  `json:"id"`
	Position float64 `json:"position"`
}

// OrderInput moves an item before a sibling; null appends it.
type OrderInput struct {
	BeforeID *string `json:"before_id"`
}

// OrderCollection reorders project or section siblings inside the caller's transaction.
func OrderCollection(requestContext context.Context, database Database, collection, identifier string, input OrderInput) error {
	var siblingQuery string
	switch collection {
	case "projects":
		siblingQuery = `SELECT to_jsonb(item) FROM projects item WHERE parent_project_id IS NOT DISTINCT FROM (SELECT parent_project_id FROM projects WHERE id=$1) AND id!=$1 ORDER BY position,id`
	case "sections":
		siblingQuery = `SELECT to_jsonb(item) FROM sections item WHERE project_id=(SELECT project_id FROM sections WHERE id=$1) AND id!=$1 ORDER BY position,id`
	default:
		return Invalid("Unsupported ordered collection")
	}
	siblings, operationError := List[Positioned](requestContext, database, siblingQuery, identifier)
	if operationError != nil {
		return operationError
	}
	index := len(siblings)
	if input.BeforeID != nil {
		index = -1
		for siblingIndex, sibling := range siblings {
			if sibling.ID == *input.BeforeID {
				index = siblingIndex
				break
			}
		}
		if index < 0 {
			return Invalid("Reorder target must be a different sibling")
		}
	}
	var previous, next *float64
	if index > 0 {
		previous = &siblings[index-1].Position
	}
	if index < len(siblings) {
		next = &siblings[index].Position
	}
	position, rebalance := Between(previous, next)
	if rebalance {
		for siblingIndex, sibling := range siblings {
			if _, operationError := database.Exec(requestContext, "UPDATE "+collection+" SET position=$2 WHERE id=$1", sibling.ID, float64(siblingIndex+1)*1024); operationError != nil {
				return operationError
			}
		}
		position = float64(index)*1024 + 512
	}
	_, operationError = database.Exec(requestContext, "UPDATE "+collection+" SET position=$2,updated_at=now() WHERE id=$1", identifier, position)
	return operationError
}
