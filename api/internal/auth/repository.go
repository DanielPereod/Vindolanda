package auth

import (
	"context"
	"personal-life/api/internal/core"
)

// Session resolves an unexpired hashed session token.
func Session(requestContext context.Context, database core.Database, hash string) (User, error) {
	return core.One[User](requestContext, database, `SELECT jsonb_build_object('id',u.id,'username',u.username) FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()`, hash)
}
