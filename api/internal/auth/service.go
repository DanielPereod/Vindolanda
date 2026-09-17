package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"os"
	"personal-life/api/internal/core"
	"strconv"
	"strings"
)

// Provision creates the only account. It never overwrites an existing password.
func Provision(requestContext context.Context, pool *pgxpool.Pool, username, password string) error {
	if len(strings.TrimSpace(username)) == 0 || len(username) > 100 {
		return core.Invalid("Username must contain 1–100 characters")
	}
	if operationError := validatePassword(password); operationError != nil {
		return operationError
	}
	hash, operationError := bcrypt.GenerateFromPassword([]byte(password), 12)
	if operationError != nil {
		return operationError
	}
	_, operationError = core.Mutate(requestContext, pool, func(transaction pgx.Tx) (bool, error) {
		var userID string
		if operationError := transaction.QueryRow(requestContext, "INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id", username, string(hash)).Scan(&userID); operationError != nil {
			return false, operationError
		}
		_, operationError := transaction.Exec(requestContext, "INSERT INTO settings(user_id) VALUES($1)", userID)
		return true, operationError
	})
	return operationError
}

const (
	defaultPasswordMinBytes = 12
	maxPasswordBytes        = 72
)

// passwordMinBytes allows a self-hosted installation to opt into a different
// minimum through PASSWORD_MIN_LENGTH. It defaults to 12 bytes.
func passwordMinBytes() int {
	if value := os.Getenv("PASSWORD_MIN_LENGTH"); value != "" {
		if parsed, parseError := strconv.Atoi(value); parseError == nil && parsed >= 1 && parsed <= maxPasswordBytes {
			return parsed
		}
	}
	return defaultPasswordMinBytes
}

func validatePassword(password string) error {
	minimum := passwordMinBytes()
	if len(password) < minimum || len(password) > maxPasswordBytes {
		return core.Invalid(fmt.Sprintf("Password must contain %d–%d bytes", minimum, maxPasswordBytes))
	}
	return nil
}
func tokenHash(token string) string {
	digest := sha256.Sum256([]byte(token))
	return hex.EncodeToString(digest[:])
}
func newToken() (string, error) {
	buffer := make([]byte, 32)
	if _, operationError := rand.Read(buffer); operationError != nil {
		return "", operationError
	}
	return hex.EncodeToString(buffer), nil
}

type issuedSession struct {
	User  User
	Token string
}

func authenticate(requestContext context.Context, database core.Database, input credentials) (issuedSession, error) {
	var session issuedSession
	var hash string
	if operationError := database.QueryRow(requestContext, "SELECT id,username,password_hash FROM users LIMIT 1").Scan(&session.User.ID, &session.User.Username, &hash); operationError != nil {
		return session, core.Error{Status: 401, Message: "Invalid credentials"}
	}
	passwordErr := bcrypt.CompareHashAndPassword([]byte(hash), []byte(input.Password))
	if passwordErr != nil || session.User.Username != input.Username {
		return session, core.Error{Status: 401, Message: "Invalid credentials"}
	}
	token, operationError := newToken()
	if operationError != nil {
		return session, operationError
	}
	session.Token = token
	_, operationError = database.Exec(requestContext, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", tokenHash(token), session.User.ID)
	return session, operationError
}
