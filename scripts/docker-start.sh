#!/bin/sh
# Container entrypoint: check settings, migrate, seed (idempotent), start.
set -e

missing=""
[ -n "$DATABASE_URL" ] || missing="$missing DATABASE_URL"
[ -n "$REDIS_URL" ] || missing="$missing REDIS_URL"
[ -n "$AUTH_SECRET" ] || missing="$missing AUTH_SECRET"
if [ -n "$missing" ]; then
  echo "============================================================"
  echo "NOVA cannot start yet. Missing setting(s):$missing"
  echo "On Railway: open your app service -> Variables and add them"
  echo "(see README.md, 'Deploying to Railway'), then redeploy."
  echo "============================================================"
  exit 1
fi

echo "[nova] applying database migrations..."
./node_modules/.bin/prisma migrate deploy
echo "[nova] seeding settings / owner account..."
./node_modules/.bin/tsx prisma/seed.ts || echo "[nova] WARNING: seeding failed (see above) — starting anyway."
echo "[nova] starting server..."
exec ./node_modules/.bin/tsx server.ts
