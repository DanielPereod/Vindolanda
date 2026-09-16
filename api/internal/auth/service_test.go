package auth

import (
	"sync"
	"testing"
)

func TestPasswordBounds(testingContext *testing.T) {
	if validatePassword("short") == nil {
		testingContext.Fatal("short password accepted")
	}
	if validatePassword("a-long-enough-password") != nil {
		testingContext.Fatal("valid password rejected")
	}
}
func TestSessionToken(testingContext *testing.T) {
	first, operationError := newToken()
	if operationError != nil {
		testingContext.Fatal(operationError)
	}
	second, operationError := newToken()
	if operationError != nil {
		testingContext.Fatal(operationError)
	}
	if first == second || len(first) != 64 || first == tokenHash(first) {
		testingContext.Fatal("invalid session token generation")
	}
}
func TestConcurrentThrottle(testingContext *testing.T) {
	handler := Handler{}
	var workers sync.WaitGroup
	results := make(chan bool, 20)
	for range 20 {
		workers.Go(func() { results <- handler.allowed() })
	}
	workers.Wait()
	close(results)
	allowed := 0
	for result := range results {
		if result {
			allowed++
		}
	}
	if allowed != 10 {
		testingContext.Fatalf("got %d accepted requests", allowed)
	}
}
