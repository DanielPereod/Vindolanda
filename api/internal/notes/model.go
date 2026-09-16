// Package notes owns Markdown documents, saved property views and canvas layouts.
package notes

// Node is a canvas card. Type is note (a reference), text (canvas-only Markdown)
// or media (image/video URL). Notes use NoteID; text uses Text; media uses URL.
type Node struct {
	ID     string  `json:"id"`
	Type   string  `json:"type"`
	NoteID string  `json:"note_id,omitempty"`
	Text   string  `json:"text,omitempty"`
	URL    string  `json:"url,omitempty"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width,omitempty"`
	Height float64 `json:"height,omitempty"`
	Color  string  `json:"color,omitempty"`
}

// Edge connects two node identifiers in the same canvas. FromSide and ToSide
// are optional card sides (top, right, bottom, left) used as arrow anchors.
type Edge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	FromSide string `json:"fromSide,omitempty"`
	ToSide   string `json:"toSide,omitempty"`
}

// Input is a complete editable document. Kind is note, base or canvas.
type Input struct {
	Title      string            `json:"title"`
	Kind       string            `json:"kind"`
	Content    string            `json:"content"`
	Properties map[string]string `json:"properties"`
	Nodes      []Node            `json:"nodes"`
	Edges      []Edge            `json:"edges"`
	Filter     string            `json:"filter"`
	Sort       string            `json:"sort"`
	FolderID   *string           `json:"folder_id"`
}

// Note exposes stable identity and database-managed timestamps.
type Note struct {
	Input
	ID        string  `json:"id"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
	DeletedAt *string `json:"deleted_at"`
}

// FolderInput names a virtual folder and optionally its parent. Nil means root.
type FolderInput struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id"`
}

// Folder is a database-owned hierarchy node; deleting a nonempty folder is rejected.
type Folder struct {
	FolderInput
	ID        string `json:"id"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// Link records an occurrence and its stable target, with nullable unresolved identity.
// Position is a UTF-8 byte offset in the source Markdown, not a browser cursor offset.
type Link struct {
	ID            string  `json:"id"`
	SourceNoteID  string  `json:"source_note_id"`
	TargetNoteID  *string `json:"target_note_id"`
	TargetTitle   string  `json:"target_title"`
	TargetHeading string  `json:"target_heading"`
	TargetBlock   string  `json:"target_block"`
	DisplayText   string  `json:"display_text"`
	Position      int     `json:"position"`
	Embed         bool    `json:"embed"`
	CurrentTitle  string  `json:"current_title"`
	SourceTitle   string  `json:"source_title"`
	Context       string  `json:"context"`
	TargetDeleted bool    `json:"target_deleted"`
}
