package nutrition

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

const maxWaterMl = 100000

func registerDiary(router chi.Router, pool *pgxpool.Pool) {
	router.Get("/nutrition/diary", func(writer http.ResponseWriter, request *http.Request) { getDiary(writer, request, pool) })
	router.Post("/nutrition/diary", func(writer http.ResponseWriter, request *http.Request) { createDiaryEntry(writer, request, pool) })
	router.Put("/nutrition/diary/water", func(writer http.ResponseWriter, request *http.Request) { setDiaryWater(writer, request, pool) })
	router.Patch("/nutrition/diary/{id}", func(writer http.ResponseWriter, request *http.Request) { updateDiaryEntry(writer, request, pool) })
	router.Delete("/nutrition/diary/{id}", func(writer http.ResponseWriter, request *http.Request) { deleteDiaryEntry(writer, request, pool) })
}

func getDiary(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	entryDate := request.URL.Query().Get("date")
	if !validEntryDate(entryDate) {
		core.Fail(writer, core.Invalid("Invalid date"))
		return
	}
	entries, operationError := ListDiaryEntries(request.Context(), pool, entryDate)
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if entries == nil {
		entries = []DiaryEntry{}
	}
	waterMl, operationError := GetDiaryWater(request.Context(), pool, entryDate)
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	profile, operationError := GetProfile(request.Context(), pool)
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, DiaryDay{
		EntryDate: entryDate,
		WaterMl:   waterMl,
		Entries:   entries,
		Totals:    sumEntries(entries),
		Targets: DiaryTargets{
			CaloriesKcal: profile.TargetCalories,
			ProteinG:     profile.TargetProteinG,
			CarbsG:       profile.TargetCarbsG,
			FatG:         profile.TargetFatG,
			FiberG:       profile.TargetFiberG,
			WaterMl:      profile.TargetWaterMl,
		},
	})
}

func createDiaryEntry(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input DiaryEntryInput
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if !core.ValidID(input.FoodID) {
		core.Fail(writer, core.Invalid("Invalid food"))
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (DiaryEntry, error) {
		food, operationError := GetFood(request.Context(), transaction, input.FoodID)
		if operationError != nil {
			return DiaryEntry{}, operationError
		}
		if operationError := validateDiaryEntry(input, food); operationError != nil {
			return DiaryEntry{}, operationError
		}
		entry := scaleFood(food, input.Quantity)
		entry.EntryDate = input.EntryDate
		entry.Meal = input.Meal
		foodID := food.ID
		entry.FoodID = &foodID
		return CreateDiaryEntry(request.Context(), transaction, entry)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 201, value)
}

func updateDiaryEntry(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		Quantity  *float64 `json:"quantity"`
		Meal      *string  `json:"meal"`
		EntryDate *string  `json:"entry_date"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (DiaryEntry, error) {
		current, operationError := GetDiaryEntry(request.Context(), transaction, chi.URLParam(request, "id"))
		if operationError != nil {
			return DiaryEntry{}, operationError
		}
		quantity := current.Quantity
		if input.Quantity != nil {
			quantity = *input.Quantity
		}
		meal := current.Meal
		if input.Meal != nil {
			meal = *input.Meal
		}
		entryDate := current.EntryDate
		if input.EntryDate != nil {
			entryDate = *input.EntryDate
		}
		if operationError := validateDiaryUpdate(entryDate, meal, quantity); operationError != nil {
			return DiaryEntry{}, operationError
		}
		updated := rescaleEntry(current, quantity/current.Quantity)
		updated.EntryDate = entryDate
		updated.Meal = meal
		updated.Quantity = quantity
		return UpdateDiaryEntry(request.Context(), transaction, current.ID, updated)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, value)
}

func deleteDiaryEntry(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
		if operationError := DeleteDiaryEntry(request.Context(), transaction, chi.URLParam(request, "id")); operationError != nil {
			return false, operationError
		}
		return true, nil
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	writer.WriteHeader(204)
}

func setDiaryWater(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		EntryDate string `json:"entry_date"`
		WaterMl   int    `json:"water_ml"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if !validEntryDate(input.EntryDate) || input.WaterMl < 0 || input.WaterMl > maxWaterMl {
		core.Fail(writer, core.Invalid("Invalid water entry"))
		return
	}
	waterMl, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (int, error) {
		return SetDiaryWater(request.Context(), transaction, input.EntryDate, input.WaterMl)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, struct {
		EntryDate string `json:"entry_date"`
		WaterMl   int    `json:"water_ml"`
	}{input.EntryDate, waterMl})
}
