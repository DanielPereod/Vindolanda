package auth

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"personal-life/api/internal/core"
	"sync"
	"time"
)

// Handler owns a concurrent-safe login throttle and session transport configuration.
type Handler struct {
	Pool     *pgxpool.Pool
	Secure   bool
	mutex    sync.Mutex
	attempts int
	window   time.Time
}

func (handler *Handler) cookie(writer http.ResponseWriter, token string, age int) {
	http.SetCookie(writer, &http.Cookie{Name: "personal_life_session", Value: token, Path: "/", HttpOnly: true, Secure: handler.Secure, SameSite: http.SameSiteStrictMode, MaxAge: age})
}
func (handler *Handler) allowed() bool {
	handler.mutex.Lock()
	defer handler.mutex.Unlock()
	if time.Since(handler.window) > time.Minute {
		handler.window = time.Now()
		handler.attempts = 0
	}
	handler.attempts++
	return handler.attempts <= 10
}

// Register exposes login and authenticated account endpoints without registration.
func (handler *Handler) Register(router chi.Router) {
	router.Post("/auth/login", handler.login)
	router.Group(func(private chi.Router) {
		private.Use(handler.Require)
		private.Get("/auth/me", handler.me)
		private.Post("/auth/logout", handler.logout)
		private.Put("/auth/password", handler.password)
		private.Delete("/auth/sessions", handler.revoke)
	})
}

// Require validates a session before passing a request to a protected domain.
func (handler *Handler) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		cookie, operationError := request.Cookie("personal_life_session")
		if operationError != nil {
			core.Fail(writer, core.Error{Status: 401, Message: "Authentication required"})
			return
		}
		if _, operationError := Session(request.Context(), handler.Pool, tokenHash(cookie.Value)); operationError != nil {
			core.Fail(writer, core.Error{Status: 401, Message: "Session expired"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}
func (handler *Handler) login(writer http.ResponseWriter, request *http.Request) {
	if !handler.allowed() {
		core.Fail(writer, core.Error{Status: 429, Message: "Too many login attempts; retry in one minute"})
		return
	}
	var input credentials
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}

	session, operationError := core.Mutate(request.Context(), handler.Pool, func(transaction pgx.Tx) (issuedSession, error) {
		return authenticate(request.Context(), transaction, input)
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	handler.cookie(writer, session.Token, 30*24*60*60)
	core.Write(writer, 200, session.User)
}

func (handler *Handler) me(writer http.ResponseWriter, request *http.Request) {
	cookie, operationError := request.Cookie("personal_life_session")
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	user, operationError := Session(request.Context(), handler.Pool, tokenHash(cookie.Value))
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	core.Write(writer, 200, user)
}
func (handler *Handler) logout(writer http.ResponseWriter, request *http.Request) {
	cookie, operationError := request.Cookie("personal_life_session")
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if _, operationError := handler.Pool.Exec(request.Context(), "DELETE FROM sessions WHERE token_hash=$1", tokenHash(cookie.Value)); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	handler.cookie(writer, "", -1)
	writer.WriteHeader(204)
}
func (handler *Handler) revoke(writer http.ResponseWriter, request *http.Request) {
	if _, operationError := handler.Pool.Exec(request.Context(), "DELETE FROM sessions"); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	handler.cookie(writer, "", -1)
	writer.WriteHeader(204)
}
func (handler *Handler) password(writer http.ResponseWriter, request *http.Request) {
	var input passwordChange
	if operationError := core.Decode(writer, request, &input); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	if operationError := validatePassword(input.NewPassword); operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	_, operationError := core.Mutate(request.Context(), handler.Pool, func(transaction pgx.Tx) (bool, error) {
		var oldHash string
		if operationError := transaction.QueryRow(request.Context(), "SELECT password_hash FROM users FOR UPDATE").Scan(&oldHash); operationError != nil {
			return false, operationError
		}
		if bcrypt.CompareHashAndPassword([]byte(oldHash), []byte(input.CurrentPassword)) != nil {
			return false, core.Error{Status: 401, Message: "Current password is incorrect"}
		}
		newHash, operationError := bcrypt.GenerateFromPassword([]byte(input.NewPassword), 12)
		if operationError != nil {
			return false, operationError
		}
		if _, operationError := transaction.Exec(request.Context(), "UPDATE users SET password_hash=$1", string(newHash)); operationError != nil {
			return false, operationError
		}
		_, operationError = transaction.Exec(request.Context(), "DELETE FROM sessions")
		return true, operationError
	})
	if operationError != nil {
		core.Fail(writer, operationError)
		return
	}
	handler.cookie(writer, "", -1)
	writer.WriteHeader(204)
}
