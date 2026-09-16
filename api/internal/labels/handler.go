package labels

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"personal-life/api/internal/core"
)

// Register attaches authenticated labels endpoints.
func Register(router chi.Router, pool *pgxpool.Pool) {
	router.Get("/labels", func(writer http.ResponseWriter, request *http.Request) {
		values, operationError := List(request.Context(), pool)
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, values)
	})
	router.Post("/labels", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, pool, false) })
	router.Patch("/labels/{id}", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, pool, true) })
	router.Delete("/labels/{id}", func(writer http.ResponseWriter, request *http.Request) {
		_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
			tag, operationError := transaction.Exec(request.Context(), "DELETE FROM labels WHERE id=$1", chi.URLParam(request, "id"))
			if operationError != nil {
				return false, operationError
			}
			if tag.RowsAffected() == 0 {
				return false, core.Error{Status: 404, Message: "Resource not found"}
			}
			return true, nil
		})
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		writer.WriteHeader(204)
	})
}
func save(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool, editing bool) {
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Label, error) {
		input := Input{Color: "#15836b"}
		identifier := chi.URLParam(request, "id")
		if editing {
			current, operationError := Get(request.Context(), transaction, identifier)
			if operationError != nil {
				return Label{}, operationError
			}
			input = current.Input
		}
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			return Label{}, operationError
		}
		if operationError := validate(request.Context(), transaction, identifier, input); operationError != nil {
			return Label{}, operationError
		}
		if editing {
			return update(request.Context(), transaction, identifier, input)
		}
		return create(request.Context(), transaction, input)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	status := 201
	if editing {
		status = 200
	}
	core.Write(writer, status, value)
}
