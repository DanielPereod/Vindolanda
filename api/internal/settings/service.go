package settings

import (
	"personal-life/api/internal/core"
	"slices"
	"time"
	_ "time/tzdata" // Keep IANA timezone validation available in minimal container images.
)

// Validate rejects unsupported timezones and preference values.
func Validate(value Settings) error {
	if _, operationError := time.LoadLocation(value.Timezone); operationError != nil {
		return core.Invalid("Invalid timezone")
	}
	if value.Language != "es" {
		return core.Invalid("The MVP interface supports Spanish")
	}
	if value.WeekStart != 0 && value.WeekStart != 1 {
		return core.Invalid("Invalid first weekday")
	}
	if !slices.Contains([]string{"12", "24"}, value.HourFormat) || !slices.Contains([]string{"DD/MM/YYYY", "YYYY-MM-DD"}, value.DateFormat) {
		return core.Invalid("Invalid date or time format")
	}
	if !slices.Contains([]string{"light", "dark", "system"}, value.Theme) || !slices.Contains([]string{"manual", "date", "priority", "created", "name"}, value.DefaultSort) {
		return core.Invalid("Invalid appearance or sort preference")
	}
	if !slices.Contains([]string{"#2563eb", "#7c3aed", "#15803d", "#c2410c", "#be123c"}, value.AccentColor) {
		return core.Invalid("Invalid accent color")
	}
	return nil
}
