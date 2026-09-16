package projects

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"personal-life/api/internal/core"
)

// Register attaches authenticated projects endpoints.
func Register(router chi.Router, pool *pgxpool.Pool) {
	router.Patch("/projects/{id}/reorder", func(writer http.ResponseWriter, request *http.Request) {
		value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Project, error) {
			identifier := chi.URLParam(request, "id")
			item, operationError := Get(request.Context(), transaction, identifier)
			if operationError != nil {
				return item, operationError
			}
			var input core.OrderInput
			if operationError := core.Decode(writer, request, &input); operationError != nil {
				return item, operationError
			}
			if operationError := core.OrderCollection(request.Context(), transaction, "projects", identifier, input); operationError != nil {
				return item, operationError
			}
			return Get(request.Context(), transaction, identifier)
		})
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, value)
	})

	router.Get("/projects", func(writer http.ResponseWriter, request *http.Request) {
		values, operationError := List(request.Context(), pool)
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, values)
	})
	router.Post("/projects", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, pool, false) })
	router.Patch("/projects/{id}", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, pool, true) })
	router.Delete("/projects/{id}", func(writer http.ResponseWriter, request *http.Request) {
		_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
			tag, operationError := transaction.Exec(request.Context(), "DELETE FROM projects WHERE id=$1", chi.URLParam(request, "id"))
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
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Project, error) {
		input := Input{Color: "#15836b", Icon: "folder", DefaultView: "list"}
		identifier := chi.URLParam(request, "id")
		if editing {
			current, operationError := Get(request.Context(), transaction, identifier)
			if operationError != nil {
				return Project{}, operationError
			}
			input = current.Input
		}
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			return Project{}, operationError
		}
		if operationError := validate(request.Context(), transaction, identifier, input); operationError != nil {
			return Project{}, operationError
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
