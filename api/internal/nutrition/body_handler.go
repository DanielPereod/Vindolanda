package nutrition

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

func registerMeasurements(router chi.Router, pool *pgxpool.Pool) {
	router.Get("/nutrition/measurements", func(writer http.ResponseWriter, request *http.Request) {
		values, operationError := ListMeasurements(request.Context(), pool)
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, values)
	})
	router.Post("/nutrition/measurements", func(writer http.ResponseWriter, request *http.Request) { saveMeasurement(writer, request, pool, false) })
	router.Patch("/nutrition/measurements/{id}", func(writer http.ResponseWriter, request *http.Request) { saveMeasurement(writer, request, pool, true) })
	router.Delete("/nutrition/measurements/{id}", func(writer http.ResponseWriter, request *http.Request) {
		_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
			if operationError := DeleteMeasurement(request.Context(), transaction, chi.URLParam(request, "id")); operationError != nil {
				return false, operationError
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

func saveMeasurement(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool, editing bool) {
	var input MeasurementInput
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if operationError := validateMeasurement(input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Measurement, error) {
		if editing {
			return UpdateMeasurement(request.Context(), transaction, chi.URLParam(request, "id"), input)
		}
		return CreateMeasurement(request.Context(), transaction, input)
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
