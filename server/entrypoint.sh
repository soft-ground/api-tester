#!/bin/sh
set -e

echo "[entrypoint] applying database schema..."
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  # Migration files present: use Prisma Migrate.
  #
  # A database first created with `db push` (older images) already has the tables but no
  # _prisma_migrations table, so `migrate deploy` aborts with P3005 ("schema not empty").
  # In that case, baseline it by marking the initial migration as already applied. Resolving
  # a migration only records it as applied — it NEVER creates or drops tables — so existing
  # user data is untouched. Then run deploy for any later migrations.
  if out=$(npx prisma migrate deploy 2>&1); then
    echo "$out"
  else
    echo "$out"
    if echo "$out" | grep -q "P3005"; then
      echo "[entrypoint] existing (db push) database detected; baselining 0_init without altering data..."
      npx prisma migrate resolve --applied 0_init
      npx prisma migrate deploy
    else
      exit 1
    fi
  fi
else
  # No migrations bundled: fall back to a direct schema sync.
  npx prisma db push --skip-generate
fi

echo "[entrypoint] starting server..."
exec node dist/main.js
