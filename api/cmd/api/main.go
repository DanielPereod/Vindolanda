// Command api serves the Personal Life API or runs installation commands.
package main

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"personal-life/api/internal/server"
	"syscall"
	"time"
)

func main() {
	if operationError := run(); operationError != nil {
		slog.Error("application stopped", "error", operationError)
		os.Exit(1)
	}
}
func run() error {
	requestContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	if command == "migrate" {
		return server.Migrate(requestContext, databaseURL)
	}
	pool, operationError := pgxpool.New(requestContext, databaseURL)
	if operationError != nil {
		return operationError
	}
	defer pool.Close()
	if operationError := pool.Ping(requestContext); operationError != nil {
		return operationError
	}
	if command == "provision" {
		return server.Provision(requestContext, pool, os.Getenv("INITIAL_USERNAME"), os.Getenv("INITIAL_PASSWORD"))
	}
	if command != "serve" {
		return errors.New("expected serve, migrate or provision")
	}
	origin := os.Getenv("APP_ORIGIN")
	if origin == "" {
		origin = "http://localhost:5173"
	}
	address := os.Getenv("LISTEN_ADDR")
	if address == "" {
		address = "127.0.0.1:8080"
	}
	secure := os.Getenv("COOKIE_SECURE") != "false"
	httpServer := &http.Server{Addr: address, Handler: server.New(pool, server.Config{Origin: origin, SecureCookies: secure}), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	failures := make(chan error, 1)
	go func() { slog.Info("API listening", "address", address); failures <- httpServer.ListenAndServe() }()
	select {
	case operationError := <-failures:
		if errors.Is(operationError, http.ErrServerClosed) {
			return nil
		}
		return operationError
	case <-requestContext.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdown)
	}
}
