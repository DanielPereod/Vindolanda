package tasks

import (
	"context"
	"personal-life/api/internal/core"
)

const taskJSON = `to_jsonb(t)||jsonb_build_object('note_ids',COALESCE((SELECT jsonb_agg(note_id ORDER BY note_id) FROM task_notes WHERE task_id=t.id),'[]'::jsonb))||jsonb_build_object('label_ids',COALESCE((SELECT jsonb_agg(label_id ORDER BY label_id) FROM task_labels WHERE task_id=t.id),'[]'::jsonb))`

// Get reads a task and its global label references.
func Get(requestContext context.Context, database core.Database, identifier string) (Task, error) {
	return core.One[Task](requestContext, database, "SELECT "+taskJSON+" FROM tasks t WHERE t.id=$1", identifier)
}

// List computes views from the same task table using account-local calendar dates.
func List(requestContext context.Context, database core.Database, query Query) ([]Task, error) {
	order := "t.position,t.id"
	switch query.Sort {
	case "date":
		order = "t.due_date,t.due_time,t.priority,t.id"
	case "priority":
		order = "t.priority,t.due_date,t.id"
	case "created":
		order = "t.created_at,t.id"
	case "name":
		order = "lower(t.title),t.id"
	}
	if query.Descending {
		switch query.Sort {
		case "date":
			order = "t.due_date DESC NULLS LAST,t.due_time DESC NULLS LAST,t.id"
		case "priority":
			order = "t.priority DESC,t.id"
		case "created":
			order = "t.created_at DESC,t.id"
		case "name":
			order = "lower(t.title) DESC,t.id"
		default:
			order = "t.position DESC,t.id"
		}
	}
	if query.View == "today" || query.View == "upcoming" {
		order = "t.due_date,t.due_time NULLS LAST,t.priority,t.position,t.id"
	}
	if query.View == "completed" {
		order = "t.completed_at DESC,t.id"
	}
	return core.List[Task](requestContext, database, `SELECT `+taskJSON+` FROM tasks t LEFT JOIN projects p ON p.id=t.project_id
 WHERE ($1='' OR t.project_id::text=$1)
 AND ($2='' OR EXISTS(SELECT 1 FROM task_labels WHERE task_id=t.id AND label_id::text=$2))
 AND ($3='' OR t.title ILIKE '%'||$3||'%' OR t.description ILIKE '%'||$3||'%' OR p.name ILIKE '%'||$3||'%' OR EXISTS(SELECT 1 FROM task_labels tl JOIN labels l ON l.id=tl.label_id WHERE tl.task_id=t.id AND l.name ILIKE '%'||$3||'%'))
 AND (CASE WHEN $4='completed' THEN t.status='completed' ELSE t.status=$5 END)
 AND ($4 NOT IN ('inbox','today','upcoming') OR NOT COALESCE(p.archived,false))
 AND ($4!='inbox' OR t.project_id IS NULL)
 AND ($4!='today' OR t.due_date<=(now() AT TIME ZONE $6)::date)
 AND ($4!='upcoming' OR t.due_date BETWEEN (now() AT TIME ZONE $6)::date AND (now() AT TIME ZONE $6)::date+($7::integer-1))
 ORDER BY `+order, query.ProjectID, query.LabelID, query.Search, query.View, query.Status, query.Timezone, query.Days)
}
func insert(requestContext context.Context, database core.Database, value Input) (Task, error) {
	var identifier string
	operationError := database.QueryRow(requestContext, `INSERT INTO tasks(title,description,project_id,section_id,parent_task_id,priority,due_date,due_time,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE((SELECT max(position)+1024 FROM tasks),1024)) RETURNING id`, value.Title, value.Description, value.ProjectID, value.SectionID, value.ParentTaskID, value.Priority, value.DueDate, value.DueTime).Scan(&identifier)
	if operationError != nil {
		return Task{}, operationError
	}
	if operationError := replaceLabels(requestContext, database, identifier, value.LabelIDs); operationError != nil {
		return Task{}, operationError
	}
	if operationError := replaceNotes(requestContext, database, identifier, value.NoteIDs); operationError != nil {
		return Task{}, operationError
	}
	return Get(requestContext, database, identifier)
}
func update(requestContext context.Context, database core.Database, identifier string, value Input) (Task, error) {
	_, operationError := database.Exec(requestContext, `UPDATE tasks SET title=$2,description=$3,project_id=$4,section_id=$5,parent_task_id=$6,priority=$7,due_date=$8,due_time=$9,updated_at=now() WHERE id=$1`, identifier, value.Title, value.Description, value.ProjectID, value.SectionID, value.ParentTaskID, value.Priority, value.DueDate, value.DueTime)
	if operationError != nil {
		return Task{}, operationError
	}
	if operationError := replaceLabels(requestContext, database, identifier, value.LabelIDs); operationError != nil {
		return Task{}, operationError
	}
	if operationError := replaceNotes(requestContext, database, identifier, value.NoteIDs); operationError != nil {
		return Task{}, operationError
	}
	return Get(requestContext, database, identifier)
}
func replaceLabels(requestContext context.Context, database core.Database, identifier string, labels []string) error {
	if _, operationError := database.Exec(requestContext, "DELETE FROM task_labels WHERE task_id=$1", identifier); operationError != nil {
		return operationError
	}
	for _, labelID := range labels {
		if _, operationError := database.Exec(requestContext, "INSERT INTO task_labels(task_id,label_id) VALUES($1,$2) ON CONFLICT DO NOTHING", identifier, labelID); operationError != nil {
			return operationError
		}
	}
	return nil
}
func activity(requestContext context.Context, database core.Database, task Task, event string) error {
	_, operationError := database.Exec(requestContext, "INSERT INTO activity_log(task_id,title,event) VALUES($1,$2,$3)", task.ID, task.Title, event)
	return operationError
}

func replaceNotes(requestContext context.Context, database core.Database, identifier string, noteIDs []string) error {
	if _, failure := database.Exec(requestContext, "DELETE FROM task_notes WHERE task_id=$1", identifier); failure != nil {
		return failure
	}
	for _, noteID := range noteIDs {
		if _, failure := database.Exec(requestContext, "INSERT INTO task_notes(task_id,note_id) VALUES($1,$2) ON CONFLICT DO NOTHING", identifier, noteID); failure != nil {
			return failure
		}
	}
	return nil
}
