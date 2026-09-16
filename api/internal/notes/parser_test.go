package notes

import "testing"

func TestParseLinks(testingContext *testing.T) {
	content := "[[Target|Alias]] [[Target#Heading]] ![[Other#^block]]\n`[[inline]]`\n~~~md\n[[fenced]]\n~~~\n\\[[escaped]] [[Missing]]"
	links := ParseLinks(content)
	if len(links) != 4 {
		testingContext.Fatalf("expected four references, got %#v", links)
	}
	if links[0].TargetTitle != "Target" || links[0].DisplayText != "Alias" || links[1].TargetHeading != "Heading" || links[2].TargetBlock != "block" || !links[2].Embed || links[3].TargetTitle != "Missing" {
		testingContext.Fatalf("incorrect metadata: %#v", links)
	}
}

func TestParseLinksIgnoresCodeAndComments(testingContext *testing.T) {
	for _, content := range []string{"`` [[code]] ``", "```\n[[code]]", "<!-- [[comment]] -->", "    [[indented]]", "%% [[comment]] %%"} {
		if links := ParseLinks(content); len(links) != 0 {
			testingContext.Errorf("parsed non-content %q: %#v", content, links)
		}
	}
}
