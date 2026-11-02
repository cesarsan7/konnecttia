#!/usr/bin/env bash
# Prueba todas las migraciones (y las propuestas) en una base vacía y desechable.
#   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres infra/scripts/test-migrations.sh
# En CI la base la crea el servicio de Postgres del workflow.
set -euo pipefail

: "${TEST_DATABASE_URL:?Falta TEST_DATABASE_URL (servidor de pruebas, nunca producción)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="konnecttia_migration_test_$$"
ADMIN=(psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

"${ADMIN[@]}" -c "CREATE DATABASE $DB;"
trap '"${ADMIN[@]}" -c "DROP DATABASE IF EXISTS $DB;"' EXIT

TARGET="${TEST_DATABASE_URL%/*}/$DB"
DATABASE_URL="$TARGET" bash "$ROOT/infra/scripts/migrate.sh"

PSQL=(psql "$TARGET" -v ON_ERROR_STOP=1 -X -q)
"${PSQL[@]}" -f "$ROOT/packages/db/test/fixtures.sql"
for file in "$ROOT"/packages/db/proposed/*.sql; do
  echo "Probando propuesta $(basename "$file")"
  "${PSQL[@]}" -f "$file"
done
"${PSQL[@]}" -f "$ROOT/packages/db/test/assertions.sql"
echo "Migraciones y propuestas OK."
