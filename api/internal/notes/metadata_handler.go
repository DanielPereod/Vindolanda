package notes

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"personal-life/api/internal/core"
)

func registerMetadata(router chi.Router, service Service) {
	router.Get("/note-properties", func(writer http.ResponseWriter, request *http.Request) {
		values, failure := ListProperties(request.Context(), service.Pool)
		respond(writer, 200, values, failure)
	})
	router.Post("/note-properties", func(writer http.ResponseWriter, request *http.Request) {
		savePropertyDefinition(writer, request, service)
	})
	router.Put("/note-properties/{id}", func(writer http.ResponseWriter, request *http.Request) {
		savePropertyDefinition(writer, request, service)
	})
	router.Delete("/note-properties/{id}", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, service.DeleteProperty(request.Context(), chi.URLParam(request, "id")))
	})
	router.Get("/notes/{id}/properties", func(writer http.ResponseWriter, request *http.Request) {
		if _, failure := Get(request.Context(), service.Pool, chi.URLParam(request, "id")); failure != nil {
			core.Fail(writer, failure)
			return
		}
		values, failure := ListNoteProperties(request.Context(), service.Pool, chi.URLParam(request, "id"))
		respond(writer, 200, values, failure)
	})
	router.Put("/notes/{id}/properties/{property}", func(writer http.ResponseWriter, request *http.Request) {
		var input struct {
			Value json.RawMessage `json:"value"`
		}
		if failure := core.Decode(writer, request, &input); failure != nil {
			core.Fail(writer, failure)
			return
		}
		respondEmpty(writer, service.SetProperty(request.Context(), chi.URLParam(request, "id"), chi.URLParam(request, "property"), input.Value, false))
	})
	router.Delete("/notes/{id}/properties/{property}", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, service.SetProperty(request.Context(), chi.URLParam(request, "id"), chi.URLParam(request, "property"), nil, true))
	})
	router.Get("/note-tags", func(writer http.ResponseWriter, request *http.Request) {
		values, failure := ListTags(request.Context(), service.Pool)
		respond(writer, 200, values, failure)
	})
	router.Get("/note-tags/{id}/notes", func(writer http.ResponseWriter, request *http.Request) {
		values, failure := NotesWithTag(request.Context(), service.Pool, chi.URLParam(request, "id"))
		respond(writer, 200, values, failure)
	})
}

func savePropertyDefinition(writer http.ResponseWriter, request *http.Request, service Service) {
	var input PropertyInput
	if failure := core.Decode(writer, request, &input); failure != nil {
		core.Fail(writer, failure)
		return
	}
	value, failure := service.SaveProperty(request.Context(), chi.URLParam(request, "id"), input)
	status := 200
	if request.Method == "POST" {
		status = 201
	}
	respond(writer, status, value, failure)
}
