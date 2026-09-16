// Package settings owns account preferences and local calendar interpretation.
package settings

// Settings describes the supported MVP preferences.
type Settings struct {
	Timezone             string `json:"timezone"`
	Language             string `json:"language"`
	WeekStart            int    `json:"week_start"`
	HourFormat           string `json:"hour_format"`
	DateFormat           string `json:"date_format"`
	Theme                string `json:"theme"`
	AccentColor          string `json:"accent_color"`
	DefaultSort          string `json:"default_sort"`
	BrowserNotifications bool   `json:"browser_notifications"`
}
