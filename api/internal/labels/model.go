// Package labels owns labels independently of other application domains.
package labels

// Input is the editable representation of a label.
type Input struct {
	Name     string `json:"name"`
	Color    string `json:"color"`
	Favorite bool   `json:"favorite"`
}

// Label includes stable identity and server-managed metadata.
type Label struct {
	Input
	ID        string  `json:"id"`
	Position  float64 `json:"position"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}
