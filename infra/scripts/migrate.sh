#!/usr/bin/env bash
# Aplica las migraciones pendientes de packages/db/migrations en orden.
#
#   DATABASE_URL=postgres://... infra/scripts/migrate.sh             # aplica pendientes
#   DATABASE_URL=postgres://... infra/scripts/migrate.sh --baseline  # marca 0000 como aplicada
#                                                                    # (bases que ya son EasyOrder)
#
# Cada migración se registra en public.konnecttia_migrations. Nunca edites una migración
# ya aplicada: crea una nueva.
set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL}"
DIR="$(cd "$(dirname "$0")/../../packages/db/migrations" && pwd)"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS public.konnecttia_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

if [[ "${1:-}" == "--baseline" ]]; then
  "${PSQL[@]}" -c "INSERT INTO public.konnecttia_migrations (name) VALUES ('0000_baseline.sql')
                   ON CONFLICT DO NOTHING;"
  echo "Baseline marcada como aplicada."
fi

for file in "$DIR"/*.sql; do
  name="$(basename "$file")"
  applied="$("${PSQL[@]}" -At -c "SELECT 1 FROM public.konnecttia_migrations WHERE name = '$name'")"
  if [[ -n "$applied" ]]; then
    continue
  fi
  echo "Aplicando $name"
  "${PSQL[@]}" -f "$file"
  "${PSQL[@]}" -c "INSERT INTO public.konnecttia_migrations (name) VALUES ('$name');"
done
echo "Migraciones al día."
