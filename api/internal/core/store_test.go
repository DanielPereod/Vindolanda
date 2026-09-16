package core

import "testing"

func TestBetween(testingContext *testing.T) {
	previous, next := 1024.0, 2048.0
	position, rebalance := Between(&previous, &next)
	if position != 1536 || rebalance {
		testingContext.Fatal(position, rebalance)
	}
	next = previous
	_, rebalance = Between(&previous, &next)
	if !rebalance {
		testingContext.Fatal("equal positions need rebalance")
	}
}
