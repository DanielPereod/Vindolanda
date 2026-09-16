package notes

import (
	"context"
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"personal-life/api/internal/core"
)

// Tag is a normalized hierarchical label. Count includes descendants and excludes trash.
type Tag struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id"`
	Count    int     `json:"count"`
}

var tagPattern = regexp.MustCompile(`(?:^|[\s(])#([\p{L}\p{N}_/-]+)`)

func validTag(name string) bool {
	if len(name) == 0 || len(name) > 200 || strings.HasPrefix(name, "/") || strings.HasSuffix(name, "/") || strings.Contains(name, "//") {
		return false
	}
	hasLetter := false
	for _, character := range name {
		if unicode.IsLetter(character) {
			hasLetter = true
			continue
		}
		if !unicode.IsDigit(character) && character != '_' && character != '-' && character != '/' {
			return false
		}
	}
	return hasLetter
}

// ParseTags extracts unique lowercase tags from prose, excluding code, comments and wiki targets.
func ParseTags(content string) []string {
	visible := visibleMarkdown(content)
	values := make(map[string]bool)
	for _, match := range tagPattern.FindAllStringSubmatch(visible, -1) {
		name := strings.ToLower(match[1])
		if validTag(name) {
			values[name] = true
		}
	}
	result := make([]string, 0, len(values))
	for name := range values {
		result = append(result, name)
	}
	sort.Strings(result)
	return result
}

func visibleMarkdown(content string) string {
	var result strings.Builder
	fence := ""
	commentEnd := ""
	for _, line := range strings.SplitAfter(content, "\n") {
		marker := fenceMarker(strings.TrimLeft(line, " "))
		if marker != "" && commentEnd == "" {
			if fence == "" {
				fence = marker
			} else if marker[0] == fence[0] && len(marker) >= len(fence) {
				fence = ""
			}
			result.WriteByte('\n')
			continue
		}
		if fence != "" || strings.HasPrefix(line, "    ") || strings.HasPrefix(line, "\t") {
			result.WriteByte('\n')
			continue
		}
		result.WriteString(visibleLine(line, &commentEnd))
	}
	return result.String()
}

func visibleLine(line string, commentEnd *string) string {
	var result strings.Builder
	for position := 0; position < len(line); {
		if *commentEnd != "" {
			end := strings.Index(line[position:], *commentEnd)
			if end < 0 {
				break
			}
			position += end + len(*commentEnd)
			*commentEnd = ""
			result.WriteByte(' ')
			continue
		}
		if strings.HasPrefix(line[position:], "<!--") {
			*commentEnd = "-->"
			position += 4
			continue
		}
		if strings.HasPrefix(line[position:], "%%") {
			*commentEnd = "%%"
			position += 2
			continue
		}
		if line[position] == '\\' {
			position += 2
			result.WriteByte('x')
			continue
		}
		if line[position] == '`' {
			position = skipCode(line, position)
			result.WriteByte(' ')
			continue
		}
		if strings.HasPrefix(line[position:], "[[") {
			end := strings.Index(line[position+2:], "]]")
			if end >= 0 {
				position += end + 4
				result.WriteByte(' ')
				continue
			}
		}
		result.WriteByte(line[position])
		position++
	}
	return result.String()
}

func indexTags(requestContext context.Context, database core.Database, note Note) error {
	names := ParseTags(note.Content)
	properties, failure := ListNoteProperties(requestContext, database, note.ID)
	if failure != nil {
		return failure
	}
	for _, property := range properties {
		if property.Type != "tag" {
			continue
		}
		var values []string
		if failure = json.Unmarshal(property.Value, &values); failure != nil {
			return failure
		}
		names = append(names, values...)
	}
	hierarchy := tagAncestors(names)
	_, failure = database.Exec(requestContext, "INSERT INTO tags(name) SELECT unnest($1::text[]) ON CONFLICT(name) DO NOTHING", hierarchy)
	if failure != nil {
		return failure
	}
	_, failure = database.Exec(requestContext, `UPDATE tags child SET parent_id=parent.id FROM tags parent WHERE child.name=ANY($1::text[]) AND child.name LIKE '%/%' AND parent.name=regexp_replace(child.name,'/[^/]+$','') AND child.parent_id IS DISTINCT FROM parent.id`, hierarchy)
	if failure != nil {
		return failure
	}
	if _, failure = database.Exec(requestContext, "DELETE FROM note_tags WHERE note_id=$1", note.ID); failure != nil {
		return failure
	}
	if _, failure = database.Exec(requestContext, "INSERT INTO note_tags(note_id,tag_id) SELECT $1,id FROM tags WHERE name=ANY($2::text[])", note.ID, hierarchy); failure != nil {
		return failure
	}
	_, failure = database.Exec(requestContext, "UPDATE notes SET metadata_version=2 WHERE id=$1", note.ID)
	return failure
}

func tagAncestors(names []string) []string {
	hierarchy := make(map[string]bool)
	for _, name := range names {
		current := strings.ToLower(name)
		for current != "" {
			hierarchy[current] = true
			separator := strings.LastIndex(current, "/")
			if separator < 0 {
				break
			}
			current = current[:separator]
		}
	}
	result := make([]string, 0, len(hierarchy))
	for name := range hierarchy {
		result = append(result, name)
	}
	return result
}

// ListTags returns indexed usage counts for the complete hierarchy, including unused tags.
func ListTags(requestContext context.Context, database core.Database) ([]Tag, error) {
	return core.List[Tag](requestContext, database, `SELECT to_jsonb(tag)||jsonb_build_object('count',count(note.id)) FROM tags tag LEFT JOIN note_tags assignment ON assignment.tag_id=tag.id LEFT JOIN notes note ON note.id=assignment.note_id AND note.deleted_at IS NULL GROUP BY tag.id ORDER BY tag.name`)
}

// NotesWithTag returns at most 100 matching active notes, including descendant tags.
func NotesWithTag(requestContext context.Context, database core.Database, identifier string) ([]Note, error) {
	return core.List[Note](requestContext, database, `SELECT to_jsonb(note)-'search_vector' FROM note_tags assignment JOIN notes note ON note.id=assignment.note_id WHERE assignment.tag_id=$1 AND note.deleted_at IS NULL ORDER BY note.updated_at DESC,note.id LIMIT 100`, identifier)
}
