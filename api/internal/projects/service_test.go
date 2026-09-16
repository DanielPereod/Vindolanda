package projects

import (
	"context"
	"testing"
)

func TestRejectEmptyName(testingContext *testing.T) {
	if validate(context.Background(), nil, "", Input{}) == nil {
		testingContext.Fatal("empty name accepted")
	}
}
