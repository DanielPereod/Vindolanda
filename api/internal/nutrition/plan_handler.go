package nutrition

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

type logResult struct {
	Logged    int
	EntryDate string
}

func registerPlans(router chi.Router, pool *pgxpool.Pool) {
	router.Get("/nutrition/plans", func(writer http.ResponseWriter, request *http.Request) { listPlans(writer, request, pool) })
	router.Post("/nutrition/plans", func(writer http.ResponseWriter, request *http.Request) { createPlan(writer, request, pool) })
	router.Get("/nutrition/plans/{id}", func(writer http.ResponseWriter, request *http.Request) {
		value, operationError := GetPlan(request.Context(), pool, chi.URLParam(request, "id"))
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, value)
	})
	router.Patch("/nutrition/plans/{id}", func(writer http.ResponseWriter, request *http.Request) { renamePlan(writer, request, pool) })
	router.Delete("/nutrition/plans/{id}", func(writer http.ResponseWriter, request *http.Request) { deletePlan(writer, request, pool) })
	router.Post("/nutrition/plans/{id}/items", func(writer http.ResponseWriter, request *http.Request) { addPlanItem(writer, request, pool) })
	router.Patch("/nutrition/plans/{id}/items/{itemID}", func(writer http.ResponseWriter, request *http.Request) { updatePlanItem(writer, request, pool) })
	router.Delete("/nutrition/plans/{id}/items/{itemID}", func(writer http.ResponseWriter, request *http.Request) { deletePlanItem(writer, request, pool) })
	router.Post("/nutrition/plans/{id}/copy", func(writer http.ResponseWriter, request *http.Request) { copyPlan(writer, request, pool) })
	router.Post("/nutrition/plans/{id}/log", func(writer http.ResponseWriter, request *http.Request) { logPlan(writer, request, pool) })
}

func listPlans(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	query := request.URL.Query()
	if query.Get("template") == "true" {
		values, operationError := ListTemplates(request.Context(), pool)
		if operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, values)
		return
	}
	week := query.Get("week")
	if !validEntryDate(week) {
		core.Fail(writer, core.Invalid("Invalid week"))
		return
	}
	value, operationError := GetPlanForWeek(request.Context(), pool, mondayOf(week))
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, value)
}

func createPlan(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input PlanInput
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if input.WeekStart != nil {
		normalized := mondayOf(*input.WeekStart)
		input.WeekStart = &normalized
	}
	if operationError := validatePlanInput(input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (MealPlan, error) {
		return CreatePlan(request.Context(), transaction, input)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 201, value)
}

func renamePlan(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		Name string `json:"name"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if len(strings.TrimSpace(input.Name)) == 0 || len(input.Name) > 200 {
		core.Fail(writer, core.Invalid("Name is required and must fit the length limit"))
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (MealPlan, error) {
		return RenamePlan(request.Context(), transaction, chi.URLParam(request, "id"), input.Name)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, value)
}

func deletePlan(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
		if operationError := DeletePlan(request.Context(), transaction, chi.URLParam(request, "id")); operationError != nil {
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

func addPlanItem(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input PlanItemInput
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if operationError := validatePlanItemInput(input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (MealPlan, error) {
		plan, operationError := GetPlan(request.Context(), transaction, chi.URLParam(request, "id"))
		if operationError != nil {
			return MealPlan{}, operationError
		}
		unit, operationError := resolvePlanItemSource(request.Context(), transaction, input)
		if operationError != nil {
			return MealPlan{}, operationError
		}
		if operationError := InsertPlanItem(request.Context(), transaction, plan.ID, input, unit); operationError != nil {
			return MealPlan{}, operationError
		}
		return GetPlan(request.Context(), transaction, plan.ID)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 201, value)
}

func updatePlanItem(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		DayIndex *int     `json:"day_index"`
		Meal     *string  `json:"meal"`
		Quantity *float64 `json:"quantity"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (MealPlan, error) {
		plan, operationError := GetPlan(request.Context(), transaction, chi.URLParam(request, "id"))
		if operationError != nil {
			return MealPlan{}, operationError
		}
		itemID := chi.URLParam(request, "itemID")
		var current *PlanItem
		for index := range plan.Items {
			if plan.Items[index].ID == itemID {
				current = &plan.Items[index]
				break
			}
		}
		if current == nil {
			return MealPlan{}, core.Error{Status: 404, Message: "Resource not found"}
		}
		dayIndex := current.DayIndex
		if input.DayIndex != nil {
			dayIndex = *input.DayIndex
		}
		meal := current.Meal
		if input.Meal != nil {
			meal = *input.Meal
		}
		quantity := current.Quantity
		if input.Quantity != nil {
			quantity = *input.Quantity
		}
		if operationError := validatePlanItemInput(PlanItemInput{DayIndex: dayIndex, Meal: meal, RecipeID: current.RecipeID, FoodID: current.FoodID, Quantity: quantity}); operationError != nil {
			return MealPlan{}, operationError
		}
		if operationError := DeletePlannedDiaryEntries(request.Context(), transaction, []string{itemID}); operationError != nil {
			return MealPlan{}, operationError
		}
		if operationError := UpdatePlanItem(request.Context(), transaction, itemID, dayIndex, meal, quantity); operationError != nil {
			return MealPlan{}, operationError
		}
		return GetPlan(request.Context(), transaction, plan.ID)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, value)
}

func deletePlanItem(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	_, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (bool, error) {
		if operationError := DeletePlannedDiaryEntries(request.Context(), transaction, []string{chi.URLParam(request, "itemID")}); operationError != nil {
			return false, operationError
		}
		if operationError := DeletePlanItem(request.Context(), transaction, chi.URLParam(request, "itemID")); operationError != nil {
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

func copyPlan(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		WeekStart  *string `json:"week_start"`
		IsTemplate bool    `json:"is_template"`
		Name       string  `json:"name"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if !input.IsTemplate && (input.WeekStart == nil || !validEntryDate(*input.WeekStart)) {
		core.Fail(writer, core.Invalid("Invalid week"))
		return
	}
	if input.IsTemplate && (len(strings.TrimSpace(input.Name)) == 0 || len(input.Name) > 200) {
		core.Fail(writer, core.Invalid("A template name is required"))
		return
	}
	value, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (MealPlan, error) {
		source, operationError := GetPlan(request.Context(), transaction, chi.URLParam(request, "id"))
		if operationError != nil {
			return MealPlan{}, operationError
		}
		targetID := ""
		if input.IsTemplate {
			created, operationError := CreatePlan(request.Context(), transaction, PlanInput{Name: input.Name, IsTemplate: true})
			if operationError != nil {
				return MealPlan{}, operationError
			}
			targetID = created.ID
		} else {
			week := mondayOf(*input.WeekStart)
			target, operationError := GetPlanForWeek(request.Context(), transaction, week)
			if operationError != nil {
				return MealPlan{}, operationError
			}
			if target == nil {
				created, operationError := CreatePlan(request.Context(), transaction, PlanInput{Name: source.Name, WeekStart: &week})
				if operationError != nil {
					return MealPlan{}, operationError
				}
				targetID = created.ID
			} else {
				targetID = target.ID
			}
		}
		if operationError := CopyPlanItems(request.Context(), transaction, source.ID, targetID); operationError != nil {
			return MealPlan{}, operationError
		}
		return GetPlan(request.Context(), transaction, targetID)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, value)
}

func logPlan(writer http.ResponseWriter, request *http.Request, pool *pgxpool.Pool) {
	var input struct {
		DayIndex int     `json:"day_index"`
		Date     *string `json:"date"`
		Meal     *string `json:"meal"`
	}
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if input.DayIndex < 0 || input.DayIndex > 6 {
		core.Fail(writer, core.Invalid("Invalid day"))
		return
	}
	if input.Meal != nil && !oneOf(*input.Meal, meals) {
		core.Fail(writer, core.Invalid("Invalid meal"))
		return
	}
	result, operationError := core.Mutate(request.Context(), pool, func(transaction pgx.Tx) (logResult, error) {
		plan, operationError := GetPlan(request.Context(), transaction, chi.URLParam(request, "id"))
		if operationError != nil {
			return logResult{}, operationError
		}
		entryDate := ""
		if input.Date != nil {
			entryDate = *input.Date
		} else if plan.WeekStart != nil {
			entryDate = addDays(*plan.WeekStart, input.DayIndex)
		}
		if !validEntryDate(entryDate) {
			return logResult{}, core.Invalid("A valid date is required")
		}
		selected := make([]PlanItem, 0)
		for _, item := range plan.Items {
			if item.DayIndex != input.DayIndex {
				continue
			}
			if input.Meal != nil && item.Meal != *input.Meal {
				continue
			}
			selected = append(selected, item)
		}
		identifiers := make([]string, len(selected))
		for index, item := range selected {
			identifiers[index] = item.ID
		}
		if operationError := DeletePlannedDiaryEntries(request.Context(), transaction, identifiers); operationError != nil {
			return logResult{}, operationError
		}
		for _, item := range selected {
			if _, operationError := CreateDiaryEntry(request.Context(), transaction, diaryEntryFromPlanItem(item, entryDate)); operationError != nil {
				return logResult{}, operationError
			}
		}
		return logResult{Logged: len(selected), EntryDate: entryDate}, nil
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, struct {
		Logged    int    `json:"logged"`
		EntryDate string `json:"entry_date"`
	}{result.Logged, result.EntryDate})
}

func resolvePlanItemSource(requestContext context.Context, database core.Database, input PlanItemInput) (string, error) {
	if input.FoodID != nil && strings.TrimSpace(*input.FoodID) != "" {
		food, operationError := GetFood(requestContext, database, *input.FoodID)
		if errors.Is(operationError, pgx.ErrNoRows) {
			return "", core.Invalid("Unknown food")
		}
		if operationError != nil {
			return "", operationError
		}
		return food.BaseUnit, nil
	}
	_, operationError := GetRecipe(requestContext, database, *input.RecipeID)
	if errors.Is(operationError, pgx.ErrNoRows) {
		return "", core.Invalid("Unknown recipe")
	}
	if operationError != nil {
		return "", operationError
	}
	return "unit", nil
}

func diaryEntryFromPlanItem(item PlanItem, entryDate string) DiaryEntry {
	return DiaryEntry{
		EntryDate:      entryDate,
		Meal:           item.Meal,
		FoodID:         item.FoodID,
		PlanItemID:     &item.ID,
		Label:          item.Label,
		Quantity:       item.Quantity,
		Unit:           item.Unit,
		CaloriesKcal:   item.CaloriesKcal,
		ProteinG:       item.ProteinG,
		CarbsG:         item.CarbsG,
		FatG:           item.FatG,
		FiberG:         item.FiberG,
		SugarG:         item.SugarG,
		SaturatedFatG:  item.SaturatedFatG,
		SaltG:          item.SaltG,
		SodiumMg:       item.SodiumMg,
		Micronutrients: item.Micronutrients,
	}
}
