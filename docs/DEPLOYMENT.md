# Deployment

NOVA runs as one Node process (`server.ts`: Next.js + Socket.IO) plus PostgreSQL and Redis.

## Container

```bash
docker build -t nova .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://… -e REDIS_URL=redis://… \
  -e AUTH_SECRET=$(openssl rand -hex 32) -e APP_URL=https://casino.example \
  -e NODE_ENV=production nova
```
The image runs `prisma migrate deploy` then `tsx server.ts`. Or `docker compose --profile app up`.

## Checklist

* `NODE_ENV=production`, strong `AUTH_SECRET`, correct `APP_URL` (used for CSRF origin checks).
* `ENABLE_DEV_TOOLS` must be unset/false (dev tools are hard-disabled in production regardless).
* Terminate TLS at a proxy that supports WebSockets (`/socket.io`), forwards `X-Forwarded-For` and
  `Host`. Sticky sessions are recommended for Socket.IO polling fallback.
* PostgreSQL connection pool: `connection_limit` in `DATABASE_URL` sized for concurrency (≥ 20).
* Health check: `GET /api/health` (app, database, redis; 503 when degraded).
* Horizontal scaling: realtime events already flow through Redis; add `@socket.io/redis-adapter` for
  cross-node room broadcasts. The crash loop elects a single leader via Redis.
* Logs are structured JSON (pino) on stdout; secrets are redacted.
* Backups: PostgreSQL is the system of record (ledger is append-only); Redis holds only ephemeral data.
