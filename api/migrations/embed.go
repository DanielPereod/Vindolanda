// Package migrations embeds the versioned PostgreSQL schema.
package migrations

import "embed"

// Files contains Goose SQL migrations shipped with the binary.
//
//go:embed *.sql
var Files embed.FS
