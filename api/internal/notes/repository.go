package notes

import (
	"context"
	"personal-life/api/internal/core"
	"strings"
)

// Get reads an active document by stable identity. Trashed documents are not editable.
func Get(requestContext context.Context, database core.Database, identifier string) (Note, error) {
	return core.One[Note](requestContext, database, "SELECT to_jsonb(item) FROM notes item WHERE id=$1 AND deleted_at IS NULL", identifier)
}

// List returns active documents, or the trash when deleted is true.
func List(requestContext context.Context, database core.Database, deleted bool) ([]Note, error) {
	return core.List[Note](requestContext, database, "SELECT to_jsonb(item) FROM notes item WHERE (deleted_at IS NOT NULL)=$1 ORDER BY updated_at DESC,id", deleted)
}

func writeNote(requestContext context.Context, database core.Database, identifier string, input Input) (Note, error) {
	if identifier == "" {
		return core.One[Note](requestContext, database, `INSERT INTO notes(title,kind,content,properties,nodes,edges,filter,sort,folder_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING to_jsonb(notes)`, input.Title, input.Kind, input.Content, input.Properties, input.Nodes, input.Edges, input.Filter, input.Sort, input.FolderID)
	}
	return core.One[Note](requestContext, database, `UPDATE notes SET title=$2,kind=$3,content=$4,properties=$5,nodes=$6,edges=$7,filter=$8,sort=$9,folder_id=$10,updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING to_jsonb(notes)`, identifier, input.Title, input.Kind, input.Content, input.Properties, input.Nodes, input.Edges, input.Filter, input.Sort, input.FolderID)
}

// ListLinks queries normalized edges with current titles and reference context.
// Incoming excludes deleted sources; outgoing retains deleted targets for restoration.
func ListLinks(requestContext context.Context, database core.Database, identifier string, incoming bool) ([]Link, error) {
	condition := "link.source_note_id=$1"
	if incoming {
		condition = "link.target_note_id=$1"
	}
	return core.List[Link](requestContext, database, `SELECT to_jsonb(link) || jsonb_build_object('current_title',COALESCE(target.title,link.target_title),'source_title',source.title,'target_deleted',COALESCE(target.deleted_at IS NOT NULL,false),'context',substring(source.content FROM greatest(1,length(convert_from(substring(convert_to(source.content,'UTF8') FROM 1 FOR link.position),'UTF8'))-60) FOR 200)) FROM note_links link JOIN notes source ON source.id=link.source_note_id LEFT JOIN notes target ON target.id=link.target_note_id WHERE `+condition+` AND source.deleted_at IS NULL ORDER BY link.position,link.id`, identifier)
}

func indexLinks(requestContext context.Context, database core.Database, note Note) error {
	previous, failure := ListLinks(requestContext, database, note.ID, false)
	if failure != nil {
		return failure
	}
	targets := make(map[string]*string)
	for _, link := range previous {
		targets[strings.ToLower(link.TargetTitle)] = link.TargetNoteID
	}
	links := ParseLinks(note.Content)
	for index := range links {
		links[index].TargetNoteID = targets[strings.ToLower(links[index].TargetTitle)]
	}
	if _, failure = database.Exec(requestContext, "DELETE FROM note_links WHERE source_note_id=$1", note.ID); failure != nil {
		return failure
	}
	_, failure = database.Exec(requestContext, `INSERT INTO note_links(source_note_id,target_note_id,target_title,target_heading,target_block,display_text,position,embed)
 SELECT $1,COALESCE(entry.target_note_id,target.id),entry.target_title,entry.target_heading,entry.target_block,entry.display_text,entry.position,entry.embed
 FROM jsonb_to_recordset($2::jsonb) AS entry(target_note_id uuid,target_title text,target_heading text,target_block text,display_text text,position integer,embed boolean)
 LEFT JOIN notes target ON lower(trim(target.title))=lower(entry.target_title) AND target.deleted_at IS NULL AND target.kind='note'`, note.ID, links)
	if failure != nil {
		return failure
	}
	_, failure = database.Exec(requestContext, "UPDATE notes SET metadata_version=1 WHERE id=$1", note.ID)
	return failure
}

func resolveLinks(requestContext context.Context, database core.Database, note Note) error {
	if note.Kind != "note" {
		return nil
	}
	_, failure := database.Exec(requestContext, "UPDATE note_links SET target_note_id=$1 WHERE target_note_id IS NULL AND lower(target_title)=lower($2)", note.ID, note.Title)
	return failure
}

// ListFolders returns virtual folders in deterministic alphabetical order.
func ListFolders(requestContext context.Context, database core.Database) ([]Folder, error) {
	return core.List[Folder](requestContext, database, "SELECT to_jsonb(folder) FROM note_folders folder ORDER BY lower(name),id")
}

func writeFolder(requestContext context.Context, database core.Database, identifier string, input FolderInput) (Folder, error) {
	if identifier == "" {
		return core.One[Folder](requestContext, database, "INSERT INTO note_folders(name,parent_id) VALUES($1,$2) RETURNING to_jsonb(note_folders)", input.Name, input.ParentID)
	}
	return core.One[Folder](requestContext, database, "UPDATE note_folders SET name=$2,parent_id=$3,updated_at=now() WHERE id=$1 RETURNING to_jsonb(note_folders)", identifier, input.Name, input.ParentID)
}
