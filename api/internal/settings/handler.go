package settings

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"personal-life/api/internal/core"
)

// Register attaches authenticated settings endpoints.
func Register(router chi.Router, pool *pgxpool.Pool) {
	router.Get("/settings", func(writer http.ResponseWriter, request *http.Request) {
		value, operationError := Get(request.Context(), pool)
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, value)
	})
	router.Put("/settings", func(writer http.ResponseWriter, request *http.Request) {
		value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Settings, error) {
			value, operationError := Get(request.Context(), transaction)
			if operationError != nil {
				return value, operationError
			}
			if operationError := core.Decode(writer, request, &value); operationError != nil {
				return value, operationError
			}
			if operationError := Validate(value); operationError != nil {
				return value, operationError
			}
			return Save(request.Context(), transaction, value)
		})
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, value)
	})
}
