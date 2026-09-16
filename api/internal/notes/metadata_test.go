package notes

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestParseTags(testingContext *testing.T) {
	content := "# Heading\n#Programming/Go #programming/go #café\n`#ignored` \\#escaped [[Some #reference]]\n~~~\n#code\n~~~\n<!-- #comment --> %% #hidden %%\n    #indented\nhttps://example.test/#fragment"
	expected := []string{"café", "programming/go"}
	if actual := ParseTags(content); !reflect.DeepEqual(actual, expected) {
		testingContext.Fatalf("tags = %#v; want %#v", actual, expected)
	}
}

func TestPropertyValidation(testingContext *testing.T) {
	cases := []struct {
		kind, value string
		valid       bool
	}{
		{"text", `"hello"`, true}, {"text", `23`, false},
		{"number", `2.5`, true}, {"number", `"2.5"`, false},
		{"boolean", `false`, true}, {"boolean", `"false"`, false},
		{"list", `["a","b"]`, true}, {"list", `[1]`, false},
		{"date", `"2026-02-28"`, true}, {"date", `"2026-02-30"`, false},
		{"datetime", `"2026-09-16T12:00:00Z"`, true}, {"datetime", `"yesterday"`, false},
		{"relation", `"00000000-0000-0000-0000-000000000001"`, true}, {"relation", `"name"`, false},
		{"tag", `["programming/go"]`, true}, {"tag", `["bad tag"]`, false},
		{"unknown", `null`, false}, {"number", `null`, true},
	}
	for _, scenario := range cases {
		if failure := ValidatePropertyValue(scenario.kind, json.RawMessage(scenario.value)); (failure == nil) != scenario.valid {
			testingContext.Errorf("%s %s: %v", scenario.kind, scenario.value, failure)
		}
	}
}
