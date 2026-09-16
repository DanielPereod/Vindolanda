FROM golang:1.27-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/personal-life-api ./cmd/api

FROM alpine:3.22

RUN adduser -D -H -u 10001 appuser
COPY --from=build /out/personal-life-api /usr/local/bin/personal-life-api
USER appuser
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/personal-life-api"]
CMD ["serve"]
