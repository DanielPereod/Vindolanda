package notes

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"personal-life/api/internal/core"
)

// Register attaches authenticated transport adapters; Service owns all mutation logic.
func Register(router chi.Router, pool *pgxpool.Pool) {
	service := Service{Pool: pool}
	registerMetadata(router, service)
	router.Delete("/notes/trash", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, service.Purge(request.Context(), nil))
	})
	router.Delete("/notes/{id}/permanent", func(writer http.ResponseWriter, request *http.Request) {
		identifier := chi.URLParam(request, "id")
		respondEmpty(writer, service.Purge(request.Context(), &identifier))
	})
	router.Get("/notes/search", func(writer http.ResponseWriter, request *http.Request) {
		values, failure := Search(request.Context(), pool, request.URL.Query().Get("q"))
		respond(writer, 200, values, failure)
	})
	router.Get("/notes", func(writer http.ResponseWriter, request *http.Request) {
		values, failure := List(request.Context(), pool, request.URL.Query().Get("deleted") == "true")
		respond(writer, 200, values, failure)
	})
	router.Get("/notes/{id}", func(writer http.ResponseWriter, request *http.Request) {
		value, failure := Get(request.Context(), pool, chi.URLParam(request, "id"))
		respond(writer, 200, value, failure)
	})
	router.Post("/notes", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, service) })
	router.Put("/notes/{id}", func(writer http.ResponseWriter, request *http.Request) { save(writer, request, service) })
	router.Delete("/notes/{id}", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, service.Trash(request.Context(), chi.URLParam(request, "id"), false))
	})
	router.Post("/notes/{id}/restore", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, service.Trash(request.Context(), chi.URLParam(request, "id"), true))
	})
	router.Get("/notes/{id}/links", func(writer http.ResponseWriter, request *http.Request) {
		values, failure := ListLinks(request.Context(), pool, chi.URLParam(request, "id"), false)
		respond(writer, 200, values, failure)
	})
	router.Get("/notes/{id}/backlinks", func(writer http.ResponseWriter, request *http.Request) {
		values, failure := ListLinks(request.Context(), pool, chi.URLParam(request, "id"), true)
		respond(writer, 200, values, failure)
	})
	router.Get("/note-folders", func(writer http.ResponseWriter, request *http.Request) {
		values, failure := ListFolders(request.Context(), pool)
		respond(writer, 200, values, failure)
	})
	router.Post("/note-folders", func(writer http.ResponseWriter, request *http.Request) { saveFolder(writer, request, service) })
	router.Put("/note-folders/{id}", func(writer http.ResponseWriter, request *http.Request) { saveFolder(writer, request, service) })
	router.Delete("/note-folders/{id}", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, service.DeleteFolder(request.Context(), chi.URLParam(request, "id")))
	})
}

func save(writer http.ResponseWriter, request *http.Request, service Service) {
	var input Input
	if failure := core.Decode(writer, request, &input); failure != nil {
		core.Fail(writer, failure)
		return
	}
	value, failure := service.Save(request.Context(), chi.URLParam(request, "id"), input)
	status := 200
	if request.Method == "POST" {
		status = 201
	}
	respond(writer, status, value, failure)
}

func saveFolder(writer http.ResponseWriter, request *http.Request, service Service) {
	var input FolderInput
	if failure := core.Decode(writer, request, &input); failure != nil {
		core.Fail(writer, failure)
		return
	}
	value, failure := service.SaveFolder(request.Context(), chi.URLParam(request, "id"), input)
	status := 200
	if request.Method == "POST" {
		status = 201
	}
	respond(writer, status, value, failure)
}

func respond[Value any](writer http.ResponseWriter, status int, value Value, failure error) {
	if failure != nil {
		core.Fail(writer, failure)
		return
	}
	core.Write(writer, status, value)
}

func respondEmpty(writer http.ResponseWriter, failure error) {
	if failure != nil {
		core.Fail(writer, failure)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}
