FROM node:22-alpine AS web-builder

WORKDIR /src

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @map-of-us/web --workspace @map-of-us/shared --include-workspace-root=false

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build:shared
RUN npm run build -w @map-of-us/web

FROM node:22-alpine AS admin-builder

WORKDIR /src

COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/package.json
RUN npm ci --workspace @map-of-us/admin --include-workspace-root=false

COPY apps/admin apps/admin
RUN npm run build -w @map-of-us/admin

FROM golang:1.22-alpine AS builder

WORKDIR /src/backend

RUN apk add --no-cache ca-certificates tzdata

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/our-memories-api ./main.go \
  && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/our-memories-backupctl ./cmd/backupctl

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
  && addgroup -S app \
  && adduser -S app -G app \
  && mkdir -p /app/data /app/backups /app/backup-replica \
  && chown -R app:app /app

WORKDIR /app

COPY --from=builder /out/our-memories-api ./our-memories-api
COPY --from=builder /out/our-memories-backupctl ./our-memories-backupctl
COPY --from=web-builder /src/apps/web/out ./public/web
COPY --from=admin-builder /src/apps/admin/out ./public/admin

ENV PORT=8080 \
  DATABASE_PATH=/app/data/ourMemories.db \
  PUBLIC_DIR=/app/public \
  DEFAULT_SPACE_CODE=our-space-2026 \
  DEFAULT_SPACE_NAME=回忆地图 \
  DEFAULT_USER_ME_DISPLAY_NAME=我 \
  DEFAULT_USER_TA_DISPLAY_NAME=TA \
  DEFAULT_ANNIVERSARY_DATE= \
  DEFAULT_ANNIVERSARY_LABEL= \
  FULL_BACKUP_ENABLED=false \
  FULL_BACKUP_DIR=/app/backups \
  FULL_BACKUP_INTERVAL=24h \
  FULL_BACKUP_RETENTION=30 \
  FULL_BACKUP_REPLICA_ENABLED=false \
  FULL_BACKUP_REPLICA_DIR=/app/backup-replica \
  FULL_BACKUP_REPLICA_RETENTION=30 \
  AUTO_SEED=false

USER app

EXPOSE 8080
VOLUME ["/app/data", "/app/backups", "/app/backup-replica"]

CMD ["sh", "-c", "umask 077 && exec ./our-memories-api"]
