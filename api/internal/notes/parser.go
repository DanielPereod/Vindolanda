package notes

import "strings"

// ParseLinks extracts wiki references while excluding code, escaped syntax and comments.
// It performs a linear scan and returns occurrence offsets for incremental indexing.
func ParseLinks(content string) []Link {
	links := make([]Link, 0)
	fence := ""
	offset := 0
	commentEnd := ""
	for _, line := range strings.SplitAfter(content, "\n") {
		trimmed := strings.TrimLeft(line, " ")
		marker := fenceMarker(trimmed)
		if marker != "" && commentEnd == "" {
			if fence == "" {
				fence = marker
			} else if marker[0] == fence[0] && len(marker) >= len(fence) {
				fence = ""
			}
			offset += len(line)
			continue
		}
		if fence == "" && !strings.HasPrefix(line, "    ") && !strings.HasPrefix(line, "\t") {
			links = append(links, parseLineLinks(line, offset, &commentEnd)...)
		}
		offset += len(line)
	}
	return links
}

func fenceMarker(line string) string {
	if len(line) < 3 || (line[0] != '`' && line[0] != '~') {
		return ""
	}
	length := 0
	for length < len(line) && line[length] == line[0] {
		length++
	}
	if length < 3 {
		return ""
	}
	return line[:length]
}

func parseLineLinks(line string, offset int, commentEnd *string) []Link {
	links := make([]Link, 0)
	for position := 0; position < len(line); {
		if *commentEnd != "" {
			end := strings.Index(line[position:], *commentEnd)
			if end < 0 {
				break
			}
			position += end + len(*commentEnd)
			*commentEnd = ""
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
			continue
		}
		if line[position] == '`' {
			position = skipCode(line, position)
			continue
		}
		if !strings.HasPrefix(line[position:], "[[") {
			position++
			continue
		}
		end := strings.Index(line[position+2:], "]]")
		if end < 0 {
			break
		}
		value := line[position+2 : position+2+end]
		link := parseTarget(value)
		link.Position = offset + position
		link.Embed = position > 0 && line[position-1] == '!'
		if link.TargetTitle != "" && !strings.ContainsAny(value, "[\n") {
			links = append(links, link)
		}
		position += end + 4
	}
	return links
}

func skipCode(line string, position int) int {
	length := 1
	for position+length < len(line) && line[position+length] == '`' {
		length++
	}
	end := strings.Index(line[position+length:], strings.Repeat("`", length))
	if end < 0 {
		return len(line)
	}
	return position + length + end + length
}

func parseTarget(value string) Link {
	target, display, _ := strings.Cut(value, "|")
	title, fragment, _ := strings.Cut(target, "#")
	link := Link{TargetTitle: strings.TrimSpace(title), DisplayText: strings.TrimSpace(display)}
	if strings.HasPrefix(fragment, "^") {
		link.TargetBlock = strings.TrimPrefix(fragment, "^")
	} else {
		link.TargetHeading = fragment
	}
	return link
}
