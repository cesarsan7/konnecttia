#!/usr/bin/env bash
# Aplica las migraciones pendientes de packages/db/migrations en orden.
#
#   DATABASE_URL=postgres://... infra/scripts/migrate.sh             # aplica pendientes
#   DATABASE_URL=postgres://... infra/scripts/migrate.sh --baseline  # marca 0000 como aplicada
#                                                                    # (bases que ya son EasyOrder)
#   DATABASE_URL=postgres://... infra/scripts/migrate.sh --check     # prueba: aplica todo y lo deshace
#
# Cada migración y su registro en public.konnecttia_migrations van en UNA transacción: si algo
# falla, la base queda como estaba. Las migraciones no llevan BEGIN/COMMIT propios.
# Nunca edites una migración ya aplicada: crea una nueva.
set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL}"
DIR="$(cd "$(dirname "$0")/../../packages/db/migrations" && pwd)"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

BASELINE=false
CHECK=false
for arg in "$@"; do
  case "$arg" in
    --baseline) BASELINE=true ;;
    --check) CHECK=true ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

# En modo --check no se crea ni se marca nada.
if ! $CHECK; then
  "${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS public.konnecttia_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );"
  if $BASELINE; then
    "${PSQL[@]}" -c "INSERT INTO public.konnecttia_migrations (name) VALUES ('0000_baseline.sql') ON CONFLICT DO NOTHING;"
  fi
fi

applied_list() {
  "${PSQL[@]}" -At -c "SELECT name FROM public.konnecttia_migrations WHERE to_regclass('public.konnecttia_migrations') IS NOT NULL" 2>/dev/null || true
}
APPLIED="$(applied_list)"
if $CHECK && $BASELINE; then
  APPLIED="$(printf '%s\n0000_baseline.sql' "$APPLIED")"
fi

PENDING=()
for file in "$DIR"/*.sql; do
  name="$(basename "$file")"
  if ! grep -qxF "$name" <<<"$APPLIED"; then
    PENDING+=("$file")
  fi
done

if [[ ${#PENDING[@]} -eq 0 ]]; then
  echo "Migraciones al día."
  exit 0
fi

if $CHECK; then
  # Todo en una transacción que se deshace al final: valida contra la base real sin cambiarla.
  {
    echo "BEGIN;"
    for file in "${PENDING[@]}"; do
      echo "\\echo 'Probando $(basename "$file")'"
      cat "$file"
      echo
    done
    echo "ROLLBACK;"
  } | "${PSQL[@]}"
  echo "Comprobación OK: ${#PENDING[@]} migración(es) se aplicarían sin errores. No se ha cambiado nada."
  exit 0
fi

for file in "${PENDING[@]}"; do
  name="$(basename "$file")"
  echo "Aplicando $name"
  {
    echo "BEGIN;"
    cat "$file"
    echo
    echo "INSERT INTO public.konnecttia_migrations (name) VALUES ('$name');"
    echo "COMMIT;"
  } | "${PSQL[@]}"
done
echo "Migraciones al día."
