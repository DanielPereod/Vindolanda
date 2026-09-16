package attachments

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"personal-life/api/internal/core"
)

// Handler owns attachment persistence backed by the single account pool.
type Handler struct{ Pool *pgxpool.Pool }

// renameInput carries the new display name for a stored attachment.
type renameInput struct {
	Filename string `json:"filename"`
}

// Register attaches authenticated upload, listing, trash and byte-serving routes.
func Register(router chi.Router, pool *pgxpool.Pool) {
	handler := &Handler{Pool: pool}
	router.Get("/attachments", handler.list)
	router.Post("/attachments", handler.upload)
	router.Delete("/attachments/trash", handler.emptyTrash)
	router.Put("/attachments/{id}", handler.rename)
	router.Delete("/attachments/{id}", handler.trash)
	router.Post("/attachments/{id}/restore", handler.restore)
	router.Delete("/attachments/{id}/permanent", handler.permanent)
	router.Get("/attachments/{id}/{name}", handler.download)
}

// upload accepts one multipart image, sniffs its type and stores its bytes.
func (handler *Handler) upload(writer http.ResponseWriter, request *http.Request) {
	request.Body = http.MaxBytesReader(writer, request.Body, MaxBytes+(1<<20))
	if failure := request.ParseMultipartForm(4 << 20); failure != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(failure, &tooLarge) {
			core.Fail(writer, core.Error{Status: 413, Message: "Attachments are limited to 15 MiB"})
			return
		}
		core.Fail(writer, core.Error{Status: 400, Message: "Invalid multipart request"})
		return
	}
	if request.MultipartForm != nil {
		defer func() { _ = request.MultipartForm.RemoveAll() }()
	}
	file, header, failure := request.FormFile("file")
	if failure != nil {
		core.Fail(writer, core.Invalid("A file field is required"))
		return
	}
	defer file.Close()
	data, failure := io.ReadAll(io.LimitReader(file, MaxBytes+1))
	if failure != nil {
		core.Fail(writer, core.Error{Status: 400, Message: "Could not read the uploaded file"})
		return
	}
	if len(data) == 0 {
		core.Fail(writer, core.Invalid("The uploaded file is empty"))
		return
	}
	if len(data) > MaxBytes {
		core.Fail(writer, core.Error{Status: 413, Message: "Attachments are limited to 15 MiB"})
		return
	}
	contentType, extension, allowed := imageType(http.DetectContentType(data), header.Header.Get("Content-Type"))
	if !allowed {
		core.Fail(writer, core.Invalid("Only image attachments are supported"))
		return
	}
	filename := safeFilename(header.Filename, extension)
	var identifier string
	var createdAt time.Time
	failure = handler.Pool.QueryRow(request.Context(), "INSERT INTO attachments(filename,content_type,size_bytes,data) VALUES($1,$2,$3,$4) RETURNING id::text,created_at", filename, contentType, len(data), data).Scan(&identifier, &createdAt)
	if failure != nil {
		core.Fail(writer, failure)
		return
	}
	core.Write(writer, 201, buildAttachment(identifier, filename, contentType, len(data), createdAt, nil))
}

// list returns active attachments, or the trash when deleted is true. Bytes are omitted.
func (handler *Handler) list(writer http.ResponseWriter, request *http.Request) {
	deleted := request.URL.Query().Get("deleted") == "true"
	rows, failure := handler.Pool.Query(request.Context(), "SELECT id::text,filename,content_type,size_bytes,created_at,deleted_at FROM attachments WHERE (deleted_at IS NOT NULL)=$1 ORDER BY created_at DESC,id", deleted)
	if failure != nil {
		core.Fail(writer, failure)
		return
	}
	defer rows.Close()
	values := make([]Attachment, 0)
	for rows.Next() {
		attachment, failure := scanAttachment(rows)
		if failure != nil {
			core.Fail(writer, failure)
			return
		}
		values = append(values, attachment)
	}
	if failure := rows.Err(); failure != nil {
		core.Fail(writer, failure)
		return
	}
	core.Write(writer, 200, values)
}

// rename changes only the display name of an active attachment.
func (handler *Handler) rename(writer http.ResponseWriter, request *http.Request) {
	identifier := chi.URLParam(request, "id")
	if !core.ValidID(identifier) {
		core.Fail(writer, core.Error{Status: 404, Message: "Resource not found"})
		return
	}
	var input renameInput
	if failure := core.Decode(writer, request, &input); failure != nil {
		core.Fail(writer, failure)
		return
	}
	filename := truncateName(sanitizeName(input.Filename), 180)
	if filename == "" {
		core.Fail(writer, core.Invalid("A filename is required"))
		return
	}
	row := handler.Pool.QueryRow(request.Context(), "UPDATE attachments SET filename=$2 WHERE id=$1 AND deleted_at IS NULL RETURNING id::text,filename,content_type,size_bytes,created_at,deleted_at", identifier, filename)
	attachment, failure := scanAttachment(row)
	if failure != nil {
		core.Fail(writer, failure)
		return
	}
	core.Write(writer, 200, attachment)
}

// trash soft-deletes an active attachment so its URL stops serving.
func (handler *Handler) trash(writer http.ResponseWriter, request *http.Request) {
	handler.transition(writer, request, "UPDATE attachments SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL")
}

// restore brings a trashed attachment back by identity.
func (handler *Handler) restore(writer http.ResponseWriter, request *http.Request) {
	handler.transition(writer, request, "UPDATE attachments SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL")
}

// permanent removes a trashed attachment and its bytes.
func (handler *Handler) permanent(writer http.ResponseWriter, request *http.Request) {
	identifier := chi.URLParam(request, "id")
	if !core.ValidID(identifier) {
		core.Fail(writer, core.Error{Status: 404, Message: "Resource not found"})
		return
	}
	result, failure := handler.Pool.Exec(request.Context(), "DELETE FROM attachments WHERE id=$1 AND deleted_at IS NOT NULL", identifier)
	if failure != nil {
		core.Fail(writer, failure)
		return
	}
	if result.RowsAffected() == 0 {
		core.Fail(writer, core.Error{Status: 404, Message: "Resource not found"})
		return
	}
	writer.WriteHeader(204)
}

// emptyTrash removes every trashed attachment.
func (handler *Handler) emptyTrash(writer http.ResponseWriter, request *http.Request) {
	if _, failure := handler.Pool.Exec(request.Context(), "DELETE FROM attachments WHERE deleted_at IS NOT NULL"); failure != nil {
		core.Fail(writer, failure)
		return
	}
	writer.WriteHeader(204)
}

func (handler *Handler) transition(writer http.ResponseWriter, request *http.Request, statement string) {
	identifier := chi.URLParam(request, "id")
	if !core.ValidID(identifier) {
		core.Fail(writer, core.Error{Status: 404, Message: "Resource not found"})
		return
	}
	result, failure := handler.Pool.Exec(request.Context(), statement, identifier)
	if failure != nil {
		core.Fail(writer, failure)
		return
	}
	if result.RowsAffected() == 0 {
		core.Fail(writer, core.Error{Status: 404, Message: "Resource not found"})
		return
	}
	writer.WriteHeader(204)
}

// download streams stored bytes with an inline, privately cacheable response.
// Trashed attachments are not served so deletion takes effect immediately.
func (handler *Handler) download(writer http.ResponseWriter, request *http.Request) {
	identifier := chi.URLParam(request, "id")
	if !core.ValidID(identifier) {
		core.Fail(writer, core.Error{Status: 404, Message: "Resource not found"})
		return
	}
	var filename, contentType string
	var size int
	var data []byte
	failure := handler.Pool.QueryRow(request.Context(), "SELECT filename,content_type,size_bytes,data FROM attachments WHERE id=$1 AND deleted_at IS NULL", identifier).Scan(&filename, &contentType, &size, &data)
	if failure != nil {
		core.Fail(writer, failure)
		return
	}
	writer.Header().Set("Content-Type", contentType)
	writer.Header().Set("Content-Length", strconv.Itoa(size))
	writer.Header().Set("Content-Disposition", "inline; filename=\""+filename+"\"")
	writer.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	writer.WriteHeader(200)
	if _, failure = writer.Write(data); failure != nil {
		return
	}
}

// row is the subset of pgx.Row needed to read attachment metadata.
type row interface {
	Scan(...any) error
}

func scanAttachment(source row) (Attachment, error) {
	var identifier, filename, contentType string
	var size int
	var createdAt time.Time
	var deletedAt *time.Time
	if failure := source.Scan(&identifier, &filename, &contentType, &size, &createdAt, &deletedAt); failure != nil {
		return Attachment{}, failure
	}
	return buildAttachment(identifier, filename, contentType, size, createdAt, deletedAt), nil
}

func buildAttachment(identifier, filename, contentType string, size int, createdAt time.Time, deletedAt *time.Time) Attachment {
	attachment := Attachment{ID: identifier, Filename: filename, ContentType: contentType, Size: size, URL: attachmentURL(identifier, extensionFor(contentType)), CreatedAt: createdAt.UTC().Format(time.RFC3339)}
	if deletedAt != nil {
		formatted := deletedAt.UTC().Format(time.RFC3339)
		attachment.DeletedAt = &formatted
	}
	return attachment
}

// imageType resolves a stored image type from sniffed or declared media types.
// Sniffed bytes win; the declared type is only a fallback for containers the
// sniffer cannot label, and the result must stay inside the image allowlist.
func imageType(sniffed, declared string) (string, string, bool) {
	for _, candidate := range []string{sniffed, declared} {
		contentType := normalizeMediaType(candidate)
		if extension, allowed := imageExtensions[contentType]; allowed {
			return contentType, extension, true
		}
	}
	return "", "", false
}

func normalizeMediaType(value string) string {
	if separator := strings.IndexByte(value, ';'); separator >= 0 {
		value = value[:separator]
	}
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "image/jpg" {
		return "image/jpeg"
	}
	return value
}

// extensionFor returns the download extension of a stored image type.
func extensionFor(contentType string) string {
	if extension, allowed := imageExtensions[contentType]; allowed {
		return extension
	}
	return "bin"
}

// sanitizeName strips any path, quotes or control characters from a display name.
func sanitizeName(value string) string {
	value = strings.ReplaceAll(value, "\\", "/")
	if slash := strings.LastIndexByte(value, '/'); slash >= 0 {
		value = value[slash+1:]
	}
	var builder strings.Builder
	for _, character := range value {
		if character >= 0x20 && character != 0x7f && character != '"' {
			builder.WriteRune(character)
		}
	}
	return strings.TrimSpace(builder.String())
}

func truncateName(value string, limit int) string {
	if runes := []rune(value); len(runes) > limit {
		return string(runes[:limit])
	}
	return value
}

// safeFilename returns a header-safe upload name, adding the stored extension.
func safeFilename(value, extension string) string {
	cleaned := sanitizeName(value)
	if cleaned == "" {
		cleaned = "attachment"
	}
	if !strings.Contains(cleaned, ".") {
		cleaned += "." + extension
	}
	return truncateName(cleaned, 180)
}

func attachmentURL(identifier, extension string) string {
	return "/api/v1/attachments/" + identifier + "/" + identifier + "." + extension
}
