package nutrition

import (
	"personal-life/api/internal/core"
)

const maxMeasurementValue = 1000
const maxNotesLength = 500

// MeasurementInput is the editable representation of one body measurement.
type MeasurementInput struct {
	MeasuredOn string   `json:"measured_on"`
	WeightKg   *float64 `json:"weight_kg"`
	BodyFatPct *float64 `json:"body_fat_pct"`
	WaistCm    *float64 `json:"waist_cm"`
	HipCm      *float64 `json:"hip_cm"`
	ChestCm    *float64 `json:"chest_cm"`
	NeckCm     *float64 `json:"neck_cm"`
	ArmCm      *float64 `json:"arm_cm"`
	ThighCm    *float64 `json:"thigh_cm"`
	Notes      string   `json:"notes"`
}

// Measurement includes stable identity and server-managed metadata.
type Measurement struct {
	MeasurementInput
	ID        string `json:"id"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// validateMeasurement enforces the body measurement invariants.
func validateMeasurement(value MeasurementInput) error {
	if !validEntryDate(value.MeasuredOn) {
		return core.Invalid("A valid measurement date is required")
	}
	metrics := []struct {
		value *float64
		limit float64
	}{
		{value.WeightKg, maxMeasurementValue},
		{value.BodyFatPct, 100},
		{value.WaistCm, maxMeasurementValue},
		{value.HipCm, maxMeasurementValue},
		{value.ChestCm, maxMeasurementValue},
		{value.NeckCm, maxMeasurementValue},
		{value.ArmCm, maxMeasurementValue},
		{value.ThighCm, maxMeasurementValue},
	}
	present := false
	for _, metric := range metrics {
		if metric.value == nil {
			continue
		}
		present = true
		if *metric.value < 0 || *metric.value > metric.limit {
			return core.Invalid("Measurement values are out of range")
		}
	}
	if !present {
		return core.Invalid("At least one measurement is required")
	}
	if len(value.Notes) > maxNotesLength {
		return core.Invalid("Notes must fit the length limit")
	}
	return nil
}
