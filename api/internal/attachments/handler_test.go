package attachments

import "testing"

func TestImageType(t *testing.T) {
	cases := []struct {
		name              string
		sniffed, declared string
		contentType       string
		extension         string
		allowed           bool
	}{
		{"sniffed png wins", "image/png", "application/octet-stream", "image/png", "png", true},
		{"sniffed jpeg", "image/jpeg", "", "image/jpeg", "jpg", true},
		{"declared fallback for opaque container", "application/octet-stream", "image/webp", "image/webp", "webp", true},
		{"declared type with parameters", "application/octet-stream", "image/jpg; charset=binary", "image/jpeg", "jpg", true},
		{"svg is rejected", "text/xml; charset=utf-8", "image/svg+xml", "", "", false},
		{"html is rejected", "text/html; charset=utf-8", "text/html", "", "", false},
		{"pdf is rejected", "application/pdf", "application/pdf", "", "", false},
		{"empty is rejected", "", "", "", "", false},
	}
	for _, testCase := range cases {
		contentType, extension, allowed := imageType(testCase.sniffed, testCase.declared)
		if contentType != testCase.contentType || extension != testCase.extension || allowed != testCase.allowed {
			t.Fatalf("%s: got (%q,%q,%v)", testCase.name, contentType, extension, allowed)
		}
	}
}

func TestSafeFilename(t *testing.T) {
	cases := []struct {
		name      string
		value     string
		extension string
		expected  string
	}{
		{"keeps a plain name", "photo.png", "png", "photo.png"},
		{"strips directory traversal", "../../etc/passwd", "png", "passwd.png"},
		{"strips windows separators", `C:\Users\me\photo.jpg`, "jpg", "photo.jpg"},
		{"removes quotes and control characters", "bad\"na\nme.png", "png", "badname.png"},
		{"falls back when empty", "", "webp", "attachment.webp"},
		{"appends a missing extension", "screenshot", "png", "screenshot.png"},
	}
	for _, testCase := range cases {
		if result := safeFilename(testCase.value, testCase.extension); result != testCase.expected {
			t.Fatalf("%s: got %q want %q", testCase.name, result, testCase.expected)
		}
	}
	longest := make([]rune, 400)
	for index := range longest {
		longest[index] = 'a'
	}
	if result := safeFilename(string(longest)+".png", "png"); len([]rune(result)) != 180 {
		t.Fatalf("long filename was not truncated: %d", len([]rune(result)))
	}
}

func TestAttachmentURL(t *testing.T) {
	if result := attachmentURL("11111111-1111-1111-1111-111111111111", "png"); result != "/api/v1/attachments/11111111-1111-1111-1111-111111111111/11111111-1111-1111-1111-111111111111.png" {
		t.Fatalf("unexpected URL %q", result)
	}
}

func TestSanitizeName(t *testing.T) {
	cases := []struct {
		name     string
		value    string
		expected string
	}{
		{"trims a plain name", "  holiday  ", "holiday"},
		{"strips traversal", "../../etc/passwd", "passwd"},
		{"strips windows path", `C:\photos\beach.jpg`, "beach.jpg"},
		{"removes quotes and control characters", "a\"b\nc", "abc"},
		{"rejects only invalid characters", "///", ""},
	}
	for _, testCase := range cases {
		if result := sanitizeName(testCase.value); result != testCase.expected {
			t.Fatalf("%s: got %q want %q", testCase.name, result, testCase.expected)
		}
	}
}

func TestExtensionFor(t *testing.T) {
	if result := extensionFor("image/jpeg"); result != "jpg" {
		t.Fatalf("unexpected jpeg extension %q", result)
	}
	if result := extensionFor("application/pdf"); result != "bin" {
		t.Fatalf("unexpected fallback extension %q", result)
	}
}
