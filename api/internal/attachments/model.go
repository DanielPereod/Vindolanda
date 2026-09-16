// Package attachments stores and serves single-account image files.
package attachments

// MaxBytes bounds one stored attachment to 15 MiB.
const MaxBytes = 15 << 20

// Attachment is stored metadata plus the same-origin URL used by notes and canvases.
type Attachment struct {
	ID          string  `json:"id"`
	Filename    string  `json:"filename"`
	ContentType string  `json:"content_type"`
	Size        int     `json:"size"`
	URL         string  `json:"url"`
	CreatedAt   string  `json:"created_at"`
	DeletedAt   *string `json:"deleted_at,omitempty"`
}

// imageExtensions maps an allowlisted content type to its download extension.
// Only these types are ever stored, which keeps inline responses non-executable.
var imageExtensions = map[string]string{
	"image/png":  "png",
	"image/jpeg": "jpg",
	"image/gif":  "gif",
	"image/webp": "webp",
	"image/bmp":  "bmp",
	"image/avif": "avif",
}
