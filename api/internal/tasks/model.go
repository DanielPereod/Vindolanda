// Package tasks owns task scheduling, hierarchy, ordering and completion history.
package tasks

// Input contains writable task fields. Null references represent Inbox or no parent.
type Input struct {
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	ProjectID    *string  `json:"project_id"`
	SectionID    *string  `json:"section_id"`
	ParentTaskID *string  `json:"parent_task_id"`
	Priority     int      `json:"priority"`
	DueDate      *string  `json:"due_date"`
	DueTime      *string  `json:"due_time"`
	NoteIDs      []string `json:"note_ids"`
	LabelIDs     []string `json:"label_ids"`
}

// Task is a persisted task; status changes use explicit completion endpoints.
type Task struct {
	Input
	ID          string  `json:"id"`
	Position    float64 `json:"position"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	CompletedAt *string `json:"completed_at"`
}

// Completion records each explicit completion, including subsequent restorations.
type Completion struct {
	ID           string  `json:"id"`
	TaskID       string  `json:"task_id"`
	ScheduledFor *string `json:"scheduled_for"`
	CompletedAt  string  `json:"completed_at"`
}

// Query describes supported server-side task filters.
type Query struct {
	View       string
	ProjectID  string
	LabelID    string
	Search     string
	Status     string
	Days       int
	Sort       string
	Descending bool
	Timezone   string
}

// Reorder positions a task immediately before another sibling, or at the end.
type Reorder struct {
	BeforeID *string `json:"before_id"`
}
