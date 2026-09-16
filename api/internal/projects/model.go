// Package projects owns projects independently of other application domains.
package projects

// Input is the editable representation of a project.
type Input struct {
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	Color           string  `json:"color"`
	Icon            string  `json:"icon"`
	ParentProjectID *string `json:"parent_project_id"`
	Favorite        bool    `json:"favorite"`
	Archived        bool    `json:"archived"`
	DefaultView     string  `json:"default_view"`
}

// Project includes stable identity and server-managed metadata.
type Project struct {
	Input
	ID        string  `json:"id"`
	Position  float64 `json:"position"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}
