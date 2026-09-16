package tasks

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"personal-life/api/internal/core"
	"personal-life/api/internal/settings"
	"strconv"
)

// Register attaches the task API, search and computed views.
func Register(router chi.Router, pool *pgxpool.Pool) {
	router.Get("/tasks", func(writer http.ResponseWriter, request *http.Request) { list(writer, request, pool, "") })
	router.Get("/search", func(writer http.ResponseWriter, request *http.Request) { list(writer, request, pool, "") })
	for _, view := range []string{"inbox", "today", "upcoming", "completed"} {
		router.Get("/views/"+view, func(writer http.ResponseWriter, request *http.Request) { list(writer, request, pool, view) })
	}
	router.Get("/tasks/{id}", func(writer http.ResponseWriter, request *http.Request) {
		task, operationError := Get(request.Context(), pool, chi.URLParam(request, "id"))
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, task)
	})
	router.Get("/tasks/{id}/history", func(writer http.ResponseWriter, request *http.Request) {
		values, operationError := core.List[Completion](request.Context(), pool, "SELECT to_jsonb(c) FROM task_completions c WHERE task_id=$1 ORDER BY completed_at DESC", chi.URLParam(request, "id"))
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, values)
	})
	router.Post("/tasks", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, pool, false) })
	router.Patch("/tasks/{id}", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, pool, true) })
	router.Patch("/tasks/{id}/move", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, pool, true) })
	for _, action := range []string{"complete", "uncomplete", "duplicate", "reorder", "delete"} {
		method := "POST"
		path := "/tasks/{id}/" + action
		if action == "reorder" {
			method = "PATCH"
		}
		if action == "delete" {
			method = "DELETE"
			path = "/tasks/{id}"
		}
		router.MethodFunc(method, path, func(writer http.ResponseWriter, request *http.Request) {
			value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Task, error) { return perform(writer, request, transaction, action) })
			if operationError != nil {
				core.Fail(writer, operationError)
				return
			}
			if action == "delete" {
				writer.WriteHeader(204)
				return
			}
			status := 200
			if action == "duplicate" {
				status = 201
			}
			core.Write(writer, status, value)
		})
	}
}
func save(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool, editing bool) {
	task, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Task, error) {
		input := Input{Priority: 4, LabelIDs: []string{}}
		identifier := chi.URLParam(request, "id")
		if editing {
			current, operationError := Get(request.Context(), transaction, identifier)
			if operationError != nil {
				return Task{}, operationError
			}
			input = current.Input
		}
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			return Task{}, operationError
		}
		return Save(request.Context(), transaction, identifier, input)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	status := 201
	if editing {
		status = 200
	}
	core.Write(writer, status, task)
}
func perform(writer http.ResponseWriter, request *http.Request, database core.Database, action string) (Task, error) {
	identifier := chi.URLParam(request, "id")
	requestContext := request.Context()
	switch action {
	case "complete", "uncomplete":
		return Complete(requestContext, database, identifier, action == "complete")
	case "reorder":
		var input Reorder
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			return Task{}, operationError
		}
		return MoveBefore(requestContext, database, identifier, input)
	case "duplicate":
		original, operationError := Get(requestContext, database, identifier)
		if operationError != nil {
			return original, operationError
		}
		original.Input.Title += " (copy)"
		return Save(requestContext, database, "", original.Input)
	case "delete":
		task, operationError := Get(requestContext, database, identifier)
		if operationError != nil {
			return task, operationError
		}
		if operationError := activity(requestContext, database, task, "task.deleted"); operationError != nil {
			return task, operationError
		}
		_, operationError = database.Exec(requestContext, "DELETE FROM tasks WHERE id=$1", identifier)
		return task, operationError
	default:
		return Task{}, core.Invalid("Unknown action")
	}
}
func list(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool, view string) {
	preferences, operationError := settings.Get(request.Context(), pool)
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	parameters := request.URL.Query()
	days := 7
	if parameters.Get("days") != "" {
		days, operationError = strconv.Atoi(parameters.Get("days"))
		if operationError != nil || days != 7 && days != 14 && days != 30 {
			core.Fail(writer, core.Invalid("Upcoming range must be 7, 14 or 30 days"))
			return
		}
	}
	status := parameters.Get("status")
	if status == "" {
		status = "pending"
	}
	if status != "pending" && status != "completed" {
		core.Fail(writer, core.Invalid("Invalid status"))
		return
	}
	if parameters.Get("date") == "today" {
		view = "today"
	}
	query := Query{View: view, ProjectID: parameters.Get("project_id"), LabelID: parameters.Get("label"), Search: parameters.Get("q"), Status: status, Days: days, Sort: parameters.Get("sort"), Descending: parameters.Get("order") == "desc", Timezone: preferences.Timezone}
	values, operationError := List(request.Context(), pool, query)
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, values)
}
