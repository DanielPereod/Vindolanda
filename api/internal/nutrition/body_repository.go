package nutrition

import (
	"context"
	"personal-life/api/internal/core"
)

// ListMeasurements returns body measurements newest first.
func ListMeasurements(requestContext context.Context, database core.Database) ([]Measurement, error) {
	return core.List[Measurement](requestContext, database, "SELECT to_jsonb(measurement) FROM body_measurements measurement ORDER BY measurement.measured_on DESC, measurement.id")
}

// GetMeasurement returns one body measurement.
func GetMeasurement(requestContext context.Context, database core.Database, identifier string) (Measurement, error) {
	return core.One[Measurement](requestContext, database, "SELECT to_jsonb(measurement) FROM body_measurements measurement WHERE measurement.id=$1", identifier)
}

// CreateMeasurement stores one body measurement.
func CreateMeasurement(requestContext context.Context, database core.Database, value MeasurementInput) (Measurement, error) {
	return core.One[Measurement](requestContext, database, `INSERT INTO body_measurements(measured_on,weight_kg,body_fat_pct,waist_cm,hip_cm,chest_cm,neck_cm,arm_cm,thigh_cm,notes)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING to_jsonb(body_measurements)`, value.MeasuredOn, value.WeightKg, value.BodyFatPct, value.WaistCm, value.HipCm, value.ChestCm, value.NeckCm, value.ArmCm, value.ThighCm, value.Notes)
}

// UpdateMeasurement replaces the editable fields of a body measurement.
func UpdateMeasurement(requestContext context.Context, database core.Database, identifier string, value MeasurementInput) (Measurement, error) {
	return core.One[Measurement](requestContext, database, `UPDATE body_measurements SET measured_on=$2,weight_kg=$3,body_fat_pct=$4,waist_cm=$5,hip_cm=$6,chest_cm=$7,neck_cm=$8,arm_cm=$9,thigh_cm=$10,notes=$11,updated_at=now()
 WHERE id=$1 RETURNING to_jsonb(body_measurements)`, identifier, value.MeasuredOn, value.WeightKg, value.BodyFatPct, value.WaistCm, value.HipCm, value.ChestCm, value.NeckCm, value.ArmCm, value.ThighCm, value.Notes)
}

// DeleteMeasurement removes a body measurement.
func DeleteMeasurement(requestContext context.Context, database core.Database, identifier string) error {
	tag, operationError := database.Exec(requestContext, "DELETE FROM body_measurements WHERE id=$1", identifier)
	if operationError != nil {
		return operationError
	}
	if tag.RowsAffected() == 0 {
		return core.Error{Status: 404, Message: "Resource not found"}
	}
	return nil
}
