package notes

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

// Service owns note invariants and transaction boundaries. It is safe for concurrent use.
// All mutations serialize structural changes and roll back both content and derived links.
type Service struct{ Pool *pgxpool.Pool }

// Purge permanently removes trashed notes. Nil selects the complete trash.
// Canvas references are removed in the same transaction; source links and task links
// cascade through foreign keys, while incoming references become unresolved.
func (service Service) Purge(requestContext context.Context, identifier *string) error {
	_, failure := core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (bool, error) {
		if identifier != nil {
			var eligible bool
			failure := transaction.QueryRow(requestContext, "SELECT EXISTS(SELECT 1 FROM notes WHERE id=$1 AND deleted_at IS NOT NULL)", *identifier).Scan(&eligible)
			if failure != nil {
				return false, failure
			}
			if !eligible {
				return false, core.Invalid("Only trashed notes can be permanently deleted")
			}
		}
		_, failure := transaction.Exec(requestContext, `WITH targets AS (SELECT id::text FROM notes WHERE deleted_at IS NOT NULL AND ($1::uuid IS NULL OR id=$1)),
  affected AS (SELECT canvas.id,array_agg(node->>'id') AS node_ids FROM notes canvas CROSS JOIN LATERAL jsonb_array_elements(canvas.nodes) node JOIN targets ON node->>'note_id'=targets.id GROUP BY canvas.id)
  UPDATE notes canvas SET nodes=COALESCE((SELECT jsonb_agg(node) FROM jsonb_array_elements(canvas.nodes) node WHERE NOT (node->>'id'=ANY(affected.node_ids))),'[]'::jsonb),
  edges=COALESCE((SELECT jsonb_agg(edge) FROM jsonb_array_elements(canvas.edges) edge WHERE NOT (edge->>'from'=ANY(affected.node_ids) OR edge->>'to'=ANY(affected.node_ids))),'[]'::jsonb),updated_at=now()
  FROM affected WHERE canvas.id=affected.id`, identifier)
		if failure != nil {
			return false, failure
		}
		_, failure = transaction.Exec(requestContext, "DELETE FROM notes WHERE deleted_at IS NOT NULL AND ($1::uuid IS NULL OR id=$1)", identifier)
		return failure == nil, failure
	})
	return failure
}

// Save creates or replaces an active document, reindexing only changed Markdown.
func (service Service) Save(requestContext context.Context, identifier string, input Input) (Note, error) {
	propertiesProvided := input.Properties != nil
	input = normalize(input)
	if failure := validate(input); failure != nil {
		return Note{}, failure
	}
	return core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (Note, error) {
		var previous Note
		if identifier != "" {
			value, failure := Get(requestContext, transaction, identifier)
			if failure != nil {
				return Note{}, failure
			}
			previous = value
			if !propertiesProvided {
				input.Properties = previous.Properties
			}
		}
		if failure := validateNoteReferences(requestContext, transaction, input); failure != nil {
			return Note{}, failure
		}
		note, failure := writeNote(requestContext, transaction, identifier, input)
		if failure != nil {
			return Note{}, failure
		}
		if propertiesProvided {
			if failure = syncLegacyProperties(requestContext, transaction, note); failure != nil {
				return Note{}, failure
			}
		}
		if identifier == "" || previous.Content != note.Content {
			if failure = indexLinks(requestContext, transaction, note); failure != nil {
				return Note{}, failure
			}
		}
		if failure = resolveLinks(requestContext, transaction, note); failure != nil {
			return Note{}, failure
		}
		if identifier == "" || previous.Content != note.Content || propertiesProvided {
			if failure = indexTags(requestContext, transaction, note); failure != nil {
				return Note{}, failure
			}
		}
		return Get(requestContext, transaction, note.ID)
	})
}

func normalize(input Input) Input {
	input.Title = strings.TrimSpace(input.Title)
	if input.Properties == nil {
		input.Properties = map[string]string{}
	}
	if input.Nodes == nil {
		input.Nodes = []Node{}
	}
	for index := range input.Nodes {
		input.Nodes[index].Type = normalizeNodeType(input.Nodes[index].Type)
	}
	if input.Edges == nil {
		input.Edges = []Edge{}
	}
	return input
}

func validateNoteReferences(requestContext context.Context, database core.Database, input Input) error {
	identifiers := make([]string, 0, len(input.Nodes))
	for _, node := range input.Nodes {
		if normalizeNodeType(node.Type) == nodeTypeNote {
			identifiers = append(identifiers, node.NoteID)
		}
	}
	if len(identifiers) == 0 {
		return nil
	}
	var valid bool
	failure := database.QueryRow(requestContext, `SELECT NOT EXISTS(SELECT 1 FROM unnest($1::uuid[]) requested(id) WHERE NOT EXISTS(SELECT 1 FROM notes WHERE notes.id=requested.id AND kind='note' AND deleted_at IS NULL))`, identifiers).Scan(&valid)
	if failure != nil {
		return failure
	}
	if !valid {
		return core.Invalid("Canvas cards must reference an active note")
	}
	return nil
}

// SaveFolder creates or changes a folder. Missing parents and ancestor cycles are rejected.
func (service Service) SaveFolder(requestContext context.Context, identifier string, input FolderInput) (Folder, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len(input.Name) > 200 {
		return Folder{}, core.Invalid("Folder name is required and must fit 200 bytes")
	}
	return core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (Folder, error) {
		if input.ParentID != nil {
			var cycle bool
			failure := transaction.QueryRow(requestContext, `WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM note_folders WHERE id=$1 UNION SELECT folder.id,folder.parent_id FROM note_folders folder JOIN ancestors ON folder.id=ancestors.parent_id) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id::text=$2)`, *input.ParentID, identifier).Scan(&cycle)
			if failure != nil {
				return Folder{}, failure
			}
			if cycle {
				return Folder{}, core.Invalid("Folder hierarchy cannot contain a cycle")
			}
		}
		return writeFolder(requestContext, transaction, identifier, input)
	})
}

// DeleteFolder removes only empty folders; notes, including trash, are never cascaded away.
func (service Service) DeleteFolder(requestContext context.Context, identifier string) error {
	_, failure := core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (bool, error) {
		result, failure := transaction.Exec(requestContext, "DELETE FROM note_folders WHERE id=$1", identifier)
		if failure != nil {
			return false, failure
		}
		if result.RowsAffected() == 0 {
			return false, pgx.ErrNoRows
		}
		return true, nil
	})
	return failure
}

// Trash soft-deletes or restores a note without losing its ID, links or folder.
func (service Service) Trash(requestContext context.Context, identifier string, restore bool) error {
	_, failure := core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (Note, error) {
		statement := "UPDATE notes SET deleted_at=now(),updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING to_jsonb(notes)"
		if restore {
			statement = "UPDATE notes SET deleted_at=NULL,updated_at=now() WHERE id=$1 AND deleted_at IS NOT NULL RETURNING to_jsonb(notes)"
		}
		note, failure := core.One[Note](requestContext, transaction, statement, identifier)
		if failure != nil {
			return Note{}, failure
		}
		if restore {
			failure = resolveLinks(requestContext, transaction, note)
		}
		return note, failure
	})
	return failure
}

// BackfillLinks upgrades preexisting notes in bounded batches before serving traffic.
// Completed batches survive interruption; rerunning resumes without rewriting content.
func (service Service) BackfillLinks(requestContext context.Context) error {
	for {
		count, failure := core.Mutate(requestContext, service.Pool, func(transaction pgx.Tx) (int, error) {
			batch, failure := core.List[Note](requestContext, transaction, "SELECT to_jsonb(note) FROM notes note WHERE metadata_version<2 ORDER BY id LIMIT 100")
			if failure != nil {
				return 0, failure
			}
			for _, note := range batch {
				if failure = indexLinks(requestContext, transaction, note); failure != nil {
					return 0, failure
				}
				if failure = indexTags(requestContext, transaction, note); failure != nil {
					return 0, failure
				}
			}
			return len(batch), nil
		})
		if failure != nil {
			return failure
		}
		if count == 0 {
			return nil
		}
	}
}
