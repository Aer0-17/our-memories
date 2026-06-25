FROM golang:1.22-alpine AS builder

WORKDIR /src

RUN apk add --no-cache ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/our-memories-api ./main.go

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
  && addgroup -S app \
  && adduser -S app -G app \
  && mkdir -p /app/data \
  && chown -R app:app /app

WORKDIR /app

COPY --from=builder /out/our-memories-api ./our-memories-api

ENV PORT=8080 \
  DATABASE_PATH=/app/data/ourMemories.db \
  PUBLIC_DIR=/app/public \
  AUTO_SEED=true

USER app

EXPOSE 8080
VOLUME ["/app/data"]

CMD ["./our-memories-api"]
