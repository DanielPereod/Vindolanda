package notes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"personal-life/api/internal/core"
)

// PropertyDefinition is shared by all notes; renaming it preserves every value's identity.
type PropertyDefinition struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Usage int    `json:"usage"`
}

// PropertyInput defines a named type. Type changes reject incompatible existing values.
type PropertyInput struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// NoteProperty exposes a typed JSON value. Relations are a note ID or null.
type NoteProperty struct {
	PropertyDefinition
	Value json.RawMessage `json:"value"`
}

func knownPropertyType(kind string) bool {
	switch kind {
	case "text", "list", "number", "boolean", "date", "datetime", "tag", "relation":
		return true
	}
	return false
}

// ValidatePropertyValue enforces the JSON contract without evaluating user input.
// Null is an explicit empty value for any known type. Dates must be real calendar dates.
func ValidatePropertyValue(kind string, value json.RawMessage) error {
	if !knownPropertyType(kind) {
		return core.Invalid("Unknown property type")
	}
	if len(value) == 0 || !json.Valid(value) || len(value) > 100000 {
		return core.Invalid("Invalid or oversized property value")
	}
	if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return nil
	}
	if kind == "number" {
		var number float64
		if failure := json.Unmarshal(value, &number); failure != nil || math.IsInf(number, 0) || math.IsNaN(number) {
			return core.Invalid("Expected a finite number")
		}
		return nil
	}
	if kind == "boolean" {
		var boolean bool
		if failure := json.Unmarshal(value, &boolean); failure != nil {
			return core.Invalid("Expected a boolean")
		}
		return nil
	}
	if kind == "list" || kind == "tag" {
		return validatePropertyList(kind, value)
	}
	var text string
	if failure := json.Unmarshal(value, &text); failure != nil {
		return core.Invalid("Expected a string")
	}
	switch kind {
	case "date":
		if _, failure := time.Parse("2006-01-02", text); failure != nil {
			return core.Invalid("Expected a date in YYYY-MM-DD format")
		}
	case "datetime":
		if _, failure := time.Parse(time.RFC3339, text); failure != nil {
			return core.Invalid("Expected an ISO timestamp with timezone")
		}
	case "relation":
		if !core.ValidID(text) {
			return core.Invalid("Expected a related note ID")
		}
	}
	return nil
}

func validatePropertyList(kind string, value json.RawMessage) error {
	var values []string
	if failure := json.Unmarshal(value, &values); failure != nil || len(values) > 1000 {
		return core.Invalid("Expected a list of up to 1000 strings")
	}
	for _, entry := range values {
		if kind == "tag" && !validTag(entry) {
			return core.Invalid("Invalid tag name")
		}
	}
	return nil
}

// ListProperties returns the global registry and usage, including trashed notes.
func ListProperties(requestContext context.Context, database core.Database) ([]PropertyDefinition, error) {
	return core.List[PropertyDefinition](requestContext, database, `SELECT to_jsonb(definition)||jsonb_build_object('usage',count(value.note_id)) FROM property_definitions definition LEFT JOIN note_properties value ON value.property_id=definition.id GROUP BY definition.id ORDER BY lower(definition.name),definition.id`)
}

// ListNoteProperties reads typed values through definition IDs, not cached property names.
func ListNoteProperties(requestContext context.Context, database core.Database, identifier string) ([]NoteProperty, error) {
	return core.List[NoteProperty](requestContext, database, `SELECT to_jsonb(definition)||jsonb_build_object('value',COALESCE(to_jsonb(value.related_note_id),value.value)) FROM note_properties value JOIN property_definitions definition ON definition.id=value.property_id WHERE value.note_id=$1 ORDER BY definition.name,definition.id`, identifier)
}

// SaveProperty defines or changes a global property. Incompatible type changes roll back.
func (service Service) SaveProperty(requestContext context.Context, identifier string, input PropertyInput) (PropertyDefinition, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len(input.Name) > 200 || !knownPropertyType(input.Type) {
		return PropertyDefinition{}, core.Invalid("Invalid property name or type")
	}
	return core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (PropertyDefinition, error) {
		if identifier == "" {
			return core.One[PropertyDefinition](requestContext, transaction, "INSERT INTO property_definitions(name,type) VALUES($1,$2) RETURNING to_jsonb(property_definitions)", input.Name, input.Type)
		}
		previous, failure := core.One[PropertyDefinition](requestContext, transaction, "SELECT to_jsonb(definition) FROM property_definitions definition WHERE id=$1", identifier)
		if failure != nil {
			return PropertyDefinition{}, failure
		}
		if previous.Type != input.Type {
			if previous.Type == "relation" || previous.Type == "tag" || input.Type == "relation" || input.Type == "tag" {
				var used bool
				if failure = transaction.QueryRow(requestContext, "SELECT EXISTS(SELECT 1 FROM note_properties WHERE property_id=$1)", identifier).Scan(&used); failure != nil {
					return PropertyDefinition{}, failure
				}
				if used {
					return PropertyDefinition{}, core.Invalid("Remove assignments before changing a tag or relation type")
				}
			}
			if failure = validateTypeChange(requestContext, transaction, identifier, input.Type); failure != nil {
				return PropertyDefinition{}, failure
			}
		}
		definition, failure := core.One[PropertyDefinition](requestContext, transaction, "UPDATE property_definitions SET name=$2,type=$3 WHERE id=$1 RETURNING to_jsonb(property_definitions)", identifier, input.Name, input.Type)
		if failure != nil {
			return PropertyDefinition{}, failure
		}
		// Touch values to refresh compatibility projections through the database trigger.
		_, failure = transaction.Exec(requestContext, "UPDATE note_properties SET value=value WHERE property_id=$1", identifier)
		return definition, failure
	})
}

func validateTypeChange(requestContext context.Context, database core.Database, identifier, kind string) error {
	cursor := "00000000-0000-0000-0000-000000000000"
	for {
		values, failure := core.List[struct {
			NoteID string          `json:"note_id"`
			Value  json.RawMessage `json:"value"`
		}](requestContext, database, `SELECT jsonb_build_object('note_id',note_id,'value',COALESCE(to_jsonb(related_note_id),value)) FROM note_properties WHERE property_id=$1 AND note_id>$2 ORDER BY note_id LIMIT 100`, identifier, cursor)
		if failure != nil {
			return failure
		}
		if len(values) == 0 {
			return nil
		}
		for _, value := range values {
			if failure = ValidatePropertyValue(kind, value.Value); failure != nil {
				return core.Invalid("Existing values are incompatible with the new type; clear or edit them first")
			}
			cursor = value.NoteID
		}
	}
}

// SetProperty updates one typed value or removes its assignment when remove is true.
// Relations enforce foreign keys and reject newly assigned deleted notes.
func (service Service) SetProperty(requestContext context.Context, noteID, propertyID string, value json.RawMessage, remove bool) error {
	_, failure := core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (bool, error) {
		note, failure := Get(requestContext, transaction, noteID)
		if failure != nil {
			return false, failure
		}
		if remove {
			_, failure = transaction.Exec(requestContext, "DELETE FROM note_properties WHERE note_id=$1 AND property_id=$2", noteID, propertyID)
		} else {
			failure = writePropertyValue(requestContext, transaction, noteID, propertyID, value)
		}
		if failure != nil {
			return false, failure
		}
		return true, indexTags(requestContext, transaction, note)
	})
	return failure
}

func writePropertyValue(requestContext context.Context, database core.Database, noteID, propertyID string, value json.RawMessage) error {
	definition, failure := core.One[PropertyDefinition](requestContext, database, "SELECT to_jsonb(definition) FROM property_definitions definition WHERE id=$1", propertyID)
	if failure != nil {
		return failure
	}
	if failure = ValidatePropertyValue(definition.Type, value); failure != nil {
		return failure
	}
	var related *string
	if definition.Type == "relation" && !bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		var identifier string
		if failure = json.Unmarshal(value, &identifier); failure != nil {
			return failure
		}
		if _, failure = Get(requestContext, database, identifier); failure != nil {
			return core.Invalid("Relation must point to an active note")
		}
		related = &identifier
		value = json.RawMessage("null")
	}
	_, failure = database.Exec(requestContext, `INSERT INTO note_properties(note_id,property_id,value,related_note_id) VALUES($1,$2,$3,$4) ON CONFLICT(note_id,property_id) DO UPDATE SET value=excluded.value,related_note_id=excluded.related_note_id`, noteID, propertyID, value, related)
	return failure
}

// DeleteProperty removes a definition only when unused, avoiding implicit mass data loss.
func (service Service) DeleteProperty(requestContext context.Context, identifier string) error {
	_, failure := core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (bool, error) {
		var used bool
		if failure := transaction.QueryRow(requestContext, "SELECT EXISTS(SELECT 1 FROM note_properties WHERE property_id=$1)", identifier).Scan(&used); failure != nil {
			return false, failure
		}
		if used {
			return false, core.Invalid("Remove property values from notes before deleting their definition")
		}
		result, failure := transaction.Exec(requestContext, "DELETE FROM property_definitions WHERE id=$1", identifier)
		if failure == nil && result.RowsAffected() == 0 {
			return false, pgx.ErrNoRows
		}
		return failure == nil, failure
	})
	return failure
}

func syncLegacyProperties(requestContext context.Context, database core.Database, note Note) error {
	existing, failure := ListNoteProperties(requestContext, database, note.ID)
	if failure != nil {
		return failure
	}
	for _, property := range existing {
		if _, exists := note.Properties[property.Name]; exists {
			continue
		}
		if _, failure = database.Exec(requestContext, "DELETE FROM note_properties WHERE note_id=$1 AND property_id=$2", note.ID, property.ID); failure != nil {
			return failure
		}
	}
	for name, value := range note.Properties {
		definition, failure := core.One[PropertyDefinition](requestContext, database, "INSERT INTO property_definitions(name,type) VALUES($1,'text') ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING to_jsonb(property_definitions)", name)
		if failure != nil {
			return failure
		}
		// Un valor vacío desde el editor significa "sin valor": se guarda como
		// null explícito, válido para cualquier tipo. Sin esto, añadir una
		// propiedad nueva (que el frontend crea con "") fallaba al validar
		// tipos no textuales (date, number, boolean, list, tag, relation).
		var raw json.RawMessage
		if strings.TrimSpace(value) == "" {
			raw = json.RawMessage("null")
		} else if definition.Type == "number" || definition.Type == "boolean" {
			raw = json.RawMessage(value)
		} else if definition.Type == "list" || definition.Type == "tag" {
			raw = legacyListValue(value)
		} else {
			raw, failure = json.Marshal(value)
			if failure != nil {
				return failure
			}
		}
		if failure = writePropertyValue(requestContext, database, note.ID, definition.ID, raw); failure != nil {
			return fmt.Errorf("property %s: %w", name, failure)
		}
	}
	return nil
}

// legacyListValue acepta tanto el JSON de la API tipada (["a","b"]) como el
// formato histórico del editor (texto separado por comas).
func legacyListValue(value string) json.RawMessage {
	trimmed := strings.TrimSpace(value)
	if trimmed != "" && strings.HasPrefix(trimmed, "[") {
		var values []string
		if failure := json.Unmarshal([]byte(trimmed), &values); failure == nil {
			raw, failure := json.Marshal(values)
			if failure == nil {
				return raw
			}
		}
	}
	parts := strings.FieldsFunc(value, func(character rune) bool {
		return character == ',' || character == ';'
	})
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	raw, _ := json.Marshal(values)
	return raw
}
