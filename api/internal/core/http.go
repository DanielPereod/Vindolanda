// Package core provides shared transport and persistence primitives, not domain entities.
package core

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Error represents an expected API failure safe to expose to the client.
type Error struct {
	Status  int
	Message string
}

func (operationError Error) Error() string { return operationError.Message }

// Invalid reports a failed domain invariant.
func Invalid(message string) error { return Error{422, message} }

// Write encodes a typed response as JSON.
func Write[Value any](writer http.ResponseWriter, status int, value Value) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if operationError := json.NewEncoder(writer).Encode(value); operationError != nil {
		slog.Error("encode response", "error", operationError)
	}
}

// Fail maps expected database and domain failures to stable HTTP errors.
func Fail(writer http.ResponseWriter, operationError error) {
	var problem Error
	var databaseError *pgconn.PgError
	switch {
	case errors.As(operationError, &problem):
	case errors.Is(operationError, pgx.ErrNoRows):
		problem = Error{404, "Resource not found"}
	case errors.As(operationError, &databaseError):
		problem = Error{500, "Database operation failed"}
		if databaseError.Code == "23505" {
			problem = Error{409, "Resource already exists"}
		}
		if databaseError.Code == "23503" || databaseError.Code == "23514" || databaseError.Code == "22P02" {
			problem = Error{422, "Invalid resource reference or value"}
		}
	default:
		problem = Error{500, "Unexpected server error"}
	}
	if problem.Status >= 500 {
		slog.Error("request failed", "error", operationError)
	}
	Write(writer, problem.Status, struct {
		Error string `json:"error"`
	}{problem.Message})
}

// Decode accepts one JSON object with known fields and a bounded body.
func Decode[Value any](writer http.ResponseWriter, request *http.Request, value *Value) error {
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if operationError := decoder.Decode(value); operationError != nil {
		return Error{400, "Invalid JSON request"}
	}
	var extra json.RawMessage
	if operationError := decoder.Decode(&extra); operationError != io.EOF {
		return Error{400, "Expected one JSON object"}
	}
	return nil
}

// Patch overlays supplied JSON fields on a typed input, preserving explicit nulls.
func Patch[Value any](writer http.ResponseWriter, request *http.Request, value *Value) error {
	return Decode(writer, request, value)
}

var identifierPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// ValidID checks a UUID before it reaches a database parameter.
func ValidID(value string) bool { return identifierPattern.MatchString(value) }

var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// ValidColor restricts stored colors to a six-digit CSS hex color.
func ValidColor(value string) bool { return colorPattern.MatchString(value) }
