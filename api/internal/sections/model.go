// Package sections owns sections independently of other application domains.
package sections

// Input is the editable representation of a section.
type Input struct {
	Name      string `json:"name"`
	ProjectID string `json:"project_id"`
}

// Section includes stable identity and server-managed metadata.
type Section struct {
	Input
	ID        string  `json:"id"`
	Position  float64 `json:"position"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}
