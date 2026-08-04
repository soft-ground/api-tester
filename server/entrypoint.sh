#!/bin/sh
set -e

echo "[entrypoint] applying database schema..."
# If migration files exist, run migrate deploy; otherwise sync the schema with db push
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  npx prisma db push --skip-generate
fi

echo "[entrypoint] starting server..."
exec node dist/main.js
