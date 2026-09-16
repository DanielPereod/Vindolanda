package tasks

import (
	"context"
	"personal-life/api/internal/core"
	"strings"
	"time"
)

func same(left, right *string) bool {
	return left == nil && right == nil || left != nil && right != nil && *left == *right
}
func validate(requestContext context.Context, database core.Database, identifier string, value Input) error {
	if strings.TrimSpace(value.Title) == "" || len(value.Title) > 500 || len(value.Description) > 100000 {
		return core.Invalid("Title is required (maximum 500 characters) and description must fit 100000 characters")
	}
	if value.Priority < 1 || value.Priority > 4 {
		return core.Invalid("Priority must be between 1 and 4")
	}
	if value.DueDate != nil {
		if _, operationError := time.Parse("2006-01-02", *value.DueDate); operationError != nil {
			return core.Invalid("Invalid scheduled date")
		}
	}
	if value.DueTime != nil {
		if value.DueDate == nil {
			return core.Invalid("A time requires a date")
		}
		layout := "15:04"
		if len(*value.DueTime) == 8 {
			layout = "15:04:05"
		}
		if _, operationError := time.Parse(layout, *value.DueTime); operationError != nil {
			return core.Invalid("Invalid scheduled time")
		}

	}
	if operationError := validateSection(requestContext, database, value); operationError != nil {
		return operationError
	}
	if value.ParentTaskID == nil {
		return nil
	}
	parent, operationError := Get(requestContext, database, *value.ParentTaskID)
	if operationError != nil {
		return operationError
	}
	if !same(parent.ProjectID, value.ProjectID) || !same(parent.SectionID, value.SectionID) {
		return core.Invalid("A subtask must share its parent's project and section")
	}
	var cycle bool
	if operationError := database.QueryRow(requestContext, `WITH RECURSIVE ancestors AS(SELECT id,parent_task_id FROM tasks WHERE id=$1 UNION SELECT t.id,t.parent_task_id FROM tasks t JOIN ancestors a ON t.id=a.parent_task_id) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id::text=$2)`, *value.ParentTaskID, identifier).Scan(&cycle); operationError != nil {
		return operationError
	}
	if cycle {
		return core.Invalid("Task hierarchy cannot contain a cycle")
	}
	return nil
}
func validateSection(requestContext context.Context, database core.Database, value Input) error {
	if value.SectionID == nil {
		return nil
	}
	if value.ProjectID == nil {
		return core.Invalid("An Inbox task cannot belong to a project section")
	}
	var matches bool
	if operationError := database.QueryRow(requestContext, "SELECT EXISTS(SELECT 1 FROM sections WHERE id=$1 AND project_id=$2)", *value.SectionID, *value.ProjectID).Scan(&matches); operationError != nil {
		return operationError
	}
	if !matches {
		return core.Invalid("Section must belong to the task project")
	}
	return nil
}

// Save validates a task and moves descendants atomically when its location changes.
func Save(requestContext context.Context, database core.Database, identifier string, value Input) (Task, error) {
	if operationError := validate(requestContext, database, identifier, value); operationError != nil {
		return Task{}, operationError
	}
	if identifier == "" {
		task, operationError := insert(requestContext, database, value)
		if operationError != nil {
			return task, operationError
		}
		return task, activity(requestContext, database, task, "task.created")
	}
	previous, operationError := Get(requestContext, database, identifier)
	if operationError != nil {
		return Task{}, operationError
	}
	moved := !same(previous.ProjectID, value.ProjectID) || !same(previous.SectionID, value.SectionID)
	if moved {
		_, operationError := database.Exec(requestContext, `WITH RECURSIVE descendants AS(SELECT id FROM tasks WHERE parent_task_id=$1 UNION ALL SELECT t.id FROM tasks t JOIN descendants d ON t.parent_task_id=d.id) UPDATE tasks SET project_id=$2,section_id=$3,updated_at=now() WHERE id IN(SELECT id FROM descendants)`, identifier, value.ProjectID, value.SectionID)
		if operationError != nil {
			return Task{}, operationError
		}
	}
	task, operationError := update(requestContext, database, identifier, value)
	if operationError != nil {
		return task, operationError
	}
	event := "task.updated"
	if moved {
		event = "task.moved"
	}
	return task, activity(requestContext, database, task, event)
}

// Complete changes state once and retains completion history after restoration.
func Complete(requestContext context.Context, database core.Database, identifier string, completed bool) (Task, error) {
	task, operationError := Get(requestContext, database, identifier)
	if operationError != nil {
		return task, operationError
	}
	if (task.Status == "completed") == completed {
		return task, core.Error{Status: 409, Message: "Task already has that status"}
	}
	status, event := "pending", "task.uncompleted"
	if completed {
		status, event = "completed", "task.completed"
		if _, operationError := database.Exec(requestContext, "INSERT INTO task_completions(task_id,scheduled_for) VALUES($1,$2)", identifier, task.DueDate); operationError != nil {
			return task, operationError
		}
	}
	if _, operationError := database.Exec(requestContext, "UPDATE tasks SET status=$2,completed_at=CASE WHEN $2='completed' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1", identifier, status); operationError != nil {
		return task, operationError
	}
	if operationError := activity(requestContext, database, task, event); operationError != nil {
		return task, operationError
	}
	return Get(requestContext, database, identifier)
}

// MoveBefore inserts a task before a sibling, rebalancing only exhausted positions.
func MoveBefore(requestContext context.Context, database core.Database, identifier string, input Reorder) (Task, error) {
	task, operationError := Get(requestContext, database, identifier)
	if operationError != nil {
		return task, operationError
	}
	siblings, operationError := core.List[Task](requestContext, database, "SELECT to_jsonb(t) FROM tasks t WHERE project_id IS NOT DISTINCT FROM $1::uuid AND section_id IS NOT DISTINCT FROM $2::uuid AND parent_task_id IS NOT DISTINCT FROM $3::uuid AND status=$4 AND id!=$5 ORDER BY position,id", task.ProjectID, task.SectionID, task.ParentTaskID, task.Status, identifier)
	if operationError != nil {
		return task, operationError
	}
	index := len(siblings)
	if input.BeforeID != nil {
		index = -1
		for siblingIndex, sibling := range siblings {
			if sibling.ID == *input.BeforeID {
				index = siblingIndex
				break
			}
		}
		if index < 0 {
			return task, core.Invalid("Reorder target must be a different sibling")
		}
	}
	var previous, next *float64
	if index > 0 {
		previous = &siblings[index-1].Position
	}
	if index < len(siblings) {
		next = &siblings[index].Position
	}
	position, rebalance := core.Between(previous, next)
	if rebalance {
		for siblingIndex, sibling := range siblings {
			if _, operationError := database.Exec(requestContext, "UPDATE tasks SET position=$2 WHERE id=$1", sibling.ID, float64(siblingIndex+1)*1024); operationError != nil {
				return task, operationError
			}
		}
		position = float64(index)*1024 + 512
	}
	if _, operationError := database.Exec(requestContext, "UPDATE tasks SET position=$2,updated_at=now() WHERE id=$1", identifier, position); operationError != nil {
		return task, operationError
	}
	return Get(requestContext, database, identifier)
}
