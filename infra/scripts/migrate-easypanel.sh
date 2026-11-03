#!/usr/bin/env bash
# Aplica las migraciones de Konnecttia a una base de EasyPanel desde el propio VPS.
# No instala nada: descarga el repositorio y usa un contenedor temporal de postgres:17 conectado
# a la red interna de EasyPanel. La contraseña se pide por teclado y no queda en el historial.
#
#   bash migrate-easypanel.sh <host> <base> [--check] [--baseline] [--ref <rama|tag>] [--produccion]
#
# Ejemplos (en el VPS):
#   curl -fsSL https://raw.githubusercontent.com/cesarsan7/konnecttia/main/infra/scripts/migrate-easypanel.sh -o /root/migrate-easypanel.sh
#   bash /root/migrate-easypanel.sh n8nlearning_postgres-dev easyorder_dev --baseline --check
#   bash /root/migrate-easypanel.sh n8nlearning_postgres-dev easyorder_dev --baseline
#
# Protección: si el host no termina en "-dev" exige --produccion (la demo nunca se migra por error).
set -euo pipefail

if [[ $# -lt 2 ]]; then
  sed -n '2,13p' "$0"
  exit 2
fi

HOST="$1"
DB="$2"
shift 2
REF="main"
PROD=false
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --produccion) PROD=true; shift ;;
    --check | --baseline) ARGS+=("$1"); shift ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

if [[ "$HOST" != *-dev ]] && ! $PROD; then
  echo "El host '$HOST' no es de desarrollo. Si de verdad es producción, añade --produccion." >&2
  exit 1
fi

read -r -s -p "Contraseña del usuario postgres en $HOST: " PGPASSWORD
echo
export PGPASSWORD

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
echo "Descargando konnecttia ($REF)…"
curl -fsSL "https://codeload.github.com/cesarsan7/konnecttia/tar.gz/$REF" | tar -xz -C "$WORK" --strip-components=1

docker run --rm -i \
  --network easypanel \
  -e PGPASSWORD \
  -e DATABASE_URL="postgresql://postgres@$HOST:5432/$DB" \
  -v "$WORK:/repo:ro" \
  postgres:17 \
  bash /repo/infra/scripts/migrate.sh "${ARGS[@]}"
