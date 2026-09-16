// Package server composes domain modules into the versioned application API.
package server

import (
	"context"
	"database/sql"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"net/http"
	"personal-life/api/internal/attachments"
	"personal-life/api/internal/auth"
	"personal-life/api/internal/core"
	"personal-life/api/internal/labels"
	"personal-life/api/internal/notes"
	"personal-life/api/internal/nutrition"
	"personal-life/api/internal/projects"
	"personal-life/api/internal/sections"
	"personal-life/api/internal/settings"
	"personal-life/api/internal/tasks"
	"personal-life/api/migrations"
)

// Config describes the one trusted browser origin and cookie transport policy.
type Config struct {
	Origin        string
	SecureCookies bool
	// OpenFoodFactsUserAgent identifies the installation to Open Food Facts.
	OpenFoodFactsUserAgent string
	// OpenFoodFactsClient overrides the upstream client, primarily for tests.
	OpenFoodFactsClient nutrition.OpenFoodFactsClient
}

// New returns a concurrent-safe HTTP handler backed by the supplied pool.
func New(pool *pgxpool.Pool, config Config) http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID, middleware.Recoverer)
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			writer.Header().Set("X-Content-Type-Options", "nosniff")
			writer.Header().Set("Cache-Control", "no-store")
			origin := request.Header.Get("Origin")
			if request.Method != "GET" && request.Method != "HEAD" && request.Method != "OPTIONS" && origin != config.Origin {
				core.Fail(writer, core.Error{Status: 403, Message: "Untrusted request origin"})
				return
			}
			if origin == config.Origin {
				writer.Header().Set("Access-Control-Allow-Origin", origin)
				writer.Header().Set("Access-Control-Allow-Credentials", "true")
				writer.Header().Set("Vary", "Origin")
				writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				writer.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
			}
			if request.Method == "OPTIONS" {
				writer.WriteHeader(204)
				return
			}
			next.ServeHTTP(writer, request)
		})
	})
	router.Get("/health", func(writer http.ResponseWriter, request *http.Request) {
		if operationError := pool.Ping(request.Context()); operationError != nil {
			core.Fail(writer, operationError)
			return
		}
		core.Write(writer, 200, struct {
			Status string `json:"status"`
		}{"ok"})
	})
	authentication := &auth.Handler{Pool: pool, Secure: config.SecureCookies}
	foods := config.OpenFoodFactsClient
	if foods == nil {
		foods = nutrition.NewOpenFoodFactsClient(config.OpenFoodFactsUserAgent)
	}
	router.Route("/api/v1", func(api chi.Router) {
		authentication.Register(api)
		api.Group(func(private chi.Router) {
			private.Use(authentication.Require)
			settings.Register(private, pool)
			projects.Register(private, pool)
			sections.Register(private, pool)
			labels.Register(private, pool)
			tasks.Register(private, pool)
			notes.Register(private, pool)
			attachments.Register(private, pool)
			nutrition.Register(private, pool, foods)
		})
	})
	return router
}

// Migrate applies embedded Goose migrations. Run before accepting HTTP traffic.
func Migrate(requestContext context.Context, databaseURL string) error {
	database, operationError := sql.Open("pgx", databaseURL)
	if operationError != nil {
		return operationError
	}
	defer database.Close()
	provider, operationError := goose.NewProvider(goose.DialectPostgres, database, migrations.Files)
	if operationError != nil {
		return operationError
	}
	_, operationError = provider.Up(requestContext)
	if operationError != nil {
		return operationError
	}
	pool, operationError := pgxpool.New(requestContext, databaseURL)
	if operationError != nil {
		return operationError
	}
	defer pool.Close()
	return (notes.Service{Pool: pool}).BackfillLinks(requestContext)
}

// Provision creates the initial account without exposing a registration endpoint.
func Provision(requestContext context.Context, pool *pgxpool.Pool, username, password string) error {
	return auth.Provision(requestContext, pool, username, password)
}
