SHELL := /bin/bash
ifneq (,$(wildcard .env))
include .env
export
endif
.PHONY: verify integration e2e format dev-api dev-web migrate provision
verify:
	@test -z "$$(gofmt -l api)" || (echo 'Run make format'; exit 1)
	cd api && go vet ./... && go test -race ./...
	cd web && npm run lint && npm test && npm run build
integration:
	@test -n "$(TEST_DATABASE_URL)" || (echo 'Set TEST_DATABASE_URL to an isolated database ending in _test'; exit 1)
	cd api && go test -race -count=1 ./...
e2e:
	cd web && npm run e2e
format:
	gofmt -w api
	cd web && npx prettier --write src e2e '*.{json,ts,js,html}'
dev-api:
	cd api && go run ./cmd/api serve
dev-web:
	cd web && npm run dev
migrate:
	cd api && go run ./cmd/api migrate
provision:
	@if [ -z "$$INITIAL_PASSWORD" ]; then \
		read -rsp 'Initial password (12–72 bytes): ' INITIAL_PASSWORD; echo; \
		export INITIAL_PASSWORD="$$INITIAL_PASSWORD"; \
		cd api && go run ./cmd/api provision; \
	else \
		cd api && go run ./cmd/api provision; \
	fi
