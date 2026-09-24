#!/bin/bash
# ============================================================
# Backup de App Multimedia Publicidad (Digital Signage)
#   - Base de datos MySQL (playlists, media, pantallas, usuarios)
#   - Galería de archivos subidos (public/uploads)
#
# Uso:  ./backup.sh
# Configuración por variables de entorno o por el archivo
# /etc/dokploy/backup-appwebpublicidad.env (chmod 600).
# ============================================================
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/dokploy/backup-appwebpublicidad.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

BACKUP_ROOT="${BACKUP_ROOT:-/etc/dokploy/volume-backups/appwebpublicidad}"
DB_NAME="${DB_NAME:-AppPublicidad}"
DB_USER="${DB_USER:-publicidad}"
DB_PASS="${DB_PASS:?DB_PASS no definido (revisar $ENV_FILE)}"
UPLOADS_DIR="${UPLOADS_DIR:-/etc/dokploy/volumes/app-tv/uploads}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# El nombre del contenedor cambia en cada redeploy: lo resolvemos dinámicamente.
DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -m1 '^basededatos-appwebpublicidad' || true)"
if [ -z "$DB_CONTAINER" ]; then
    echo "ERROR: no se encontró el contenedor de la base de datos 'basededatos-appwebpublicidad*'" >&2
    exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

echo "==> Backup en $DEST"
echo "==> Contenedor DB: $DB_CONTAINER"

# 1. Base de datos (transacción consistente, incluye rutinas)
docker exec "$DB_CONTAINER" mysqldump \
    -u"$DB_USER" -p"$DB_PASS" \
    --single-transaction --routines --events "$DB_NAME" \
    | gzip > "$DEST/db-$DB_NAME-$STAMP.sql.gz"
echo "    OK  base de datos"

# 2. Galería de uploads
if [ -d "$UPLOADS_DIR" ]; then
    tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
    echo "    OK  uploads ($(du -sh "$UPLOADS_DIR" | cut -f1))"
else
    echo "    AVISO: no existe $UPLOADS_DIR — ¿mount no configurado?" >&2
fi

# 3. Retención
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} \;

echo "==> Backup completo: $DEST"
