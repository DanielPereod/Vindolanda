package nutrition

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

// Register attaches authenticated nutrition endpoints.
func Register(router chi.Router, pool *pgxpool.Pool, client OpenFoodFactsClient) {
	router.Get("/nutrition/profile", func(writer http.ResponseWriter, request *http.Request) {
		value, operationError := GetProfile(request.Context(), pool)
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, value)
	})
	router.Put("/nutrition/profile", func(writer http.ResponseWriter, request *http.Request) { saveProfile(writer, request, pool) })
	registerFoods(router, pool, client)
	registerDiary(router, pool)
	registerRecipes(router, pool)
	registerPlans(router, pool)
	registerShopping(router, pool)
	registerMeasurements(router, pool)
}

func saveProfile(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (Profile, error) {
		current, operationError := GetProfile(request.Context(), transaction)
		if operationError != nil {
			return Profile{}, operationError
		}
		input := current.ProfileInput
		if operationError := core.Decode(writer, request, &input); operationError != nil {
			return Profile{}, operationError
		}
		applyAutoTargets(&input)
		if operationError := validate(input); operationError != nil {
			return Profile{}, operationError
		}
		return UpdateProfile(request.Context(), transaction, input)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, value)
}
