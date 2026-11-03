#!/usr/bin/env bash
# Copia de seguridad comprimida de la base de datos. Guarda el resultado FUERA del servidor.
#   DATABASE_URL=... infra/scripts/backup.sh /ruta/destino
set -euo pipefail
: "${DATABASE_URL:?Falta DATABASE_URL}"
DEST="${1:?Indica la carpeta de destino}"
FILE="$DEST/konnecttia-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --file "$FILE"
echo "Copia creada: $FILE"
