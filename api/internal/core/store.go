package core

import (
	"context"
	"encoding/json"
	"math"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Database is implemented by a pool or transaction. Callers own transaction boundaries.
type Database interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

// List reads rows encoded by PostgreSQL as JSON into typed domain values.
func List[Value any](requestContext context.Context, database Database, query string, arguments ...any) ([]Value, error) {
	rows, operationError := database.Query(requestContext, query, arguments...)
	if operationError != nil {
		return nil, operationError
	}
	defer rows.Close()
	values := make([]Value, 0)
	for rows.Next() {
		var raw []byte
		var value Value
		if operationError := rows.Scan(&raw); operationError != nil {
			return nil, operationError
		}
		if operationError := json.Unmarshal(raw, &value); operationError != nil {
			return nil, operationError
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

// One reads a single JSON-encoded row or returns pgx.ErrNoRows.
func One[Value any](requestContext context.Context, database Database, query string, arguments ...any) (Value, error) {
	var value Value
	var raw []byte
	if operationError := database.QueryRow(requestContext, query, arguments...).Scan(&raw); operationError != nil {
		return value, operationError
	}
	operationError := json.Unmarshal(raw, &value)
	return value, operationError
}

// Mutate serializes structural writes for the single account and commits atomically.
func Mutate[Value any](requestContext context.Context, pool *pgxpool.Pool, operation func(pgx.Tx) (Value, error)) (Value, error) {
	var zero Value
	transaction, operationError := pool.Begin(requestContext)
	if operationError != nil {
		return zero, operationError
	}
	defer func() { _ = transaction.Rollback(requestContext) }()
	if _, operationError := transaction.Exec(requestContext, "SELECT pg_advisory_xact_lock(75150915)"); operationError != nil {
		return zero, operationError
	}
	value, operationError := operation(transaction)
	if operationError != nil {
		return zero, operationError
	}
	if operationError := transaction.Commit(requestContext); operationError != nil {
		return zero, operationError
	}
	return value, nil
}

// Between returns a spaced position and indicates whether sibling rebalance is needed.
func Between(previous, next *float64) (float64, bool) {
	if previous == nil && next == nil {
		return 1024, false
	}
	if previous == nil {
		return *next - 1024, !finite(*next-1024) || *next-1024 == *next
	}
	if next == nil {
		return *previous + 1024, !finite(*previous+1024) || *previous+1024 == *previous
	}
	middle := *previous + (*next-*previous)/2
	return middle, !finite(middle) || middle <= *previous || middle >= *next
}
func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
