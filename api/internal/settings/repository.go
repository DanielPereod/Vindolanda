package settings

import (
	"context"
	"personal-life/api/internal/core"
)

// Get reads the single account's preferences.
func Get(requestContext context.Context, database core.Database) (Settings, error) {
	return core.One[Settings](requestContext, database, "SELECT to_jsonb(settings)-'user_id' FROM settings")
}

// Save persists all validated preferences.
func Save(requestContext context.Context, database core.Database, value Settings) (Settings, error) {
	return core.One[Settings](requestContext, database, `UPDATE settings SET timezone=$1,language=$2,week_start=$3,hour_format=$4,date_format=$5,theme=$6,accent_color=$7,default_sort=$8,browser_notifications=$9 RETURNING to_jsonb(settings)-'user_id'`, value.Timezone, value.Language, value.WeekStart, value.HourFormat, value.DateFormat, value.Theme, value.AccentColor, value.DefaultSort, value.BrowserNotifications)
}
