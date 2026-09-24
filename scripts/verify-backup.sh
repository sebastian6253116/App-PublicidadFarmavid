#!/bin/bash
# ============================================================
# Verificación de backup (restore real)
# Restaura el último dump en una base temporal, compara conteos de
# filas contra producción y elimina la base temporal.
#
# Un backup que nunca se restauró NO es un backup.
# Uso:  ./verify-backup.sh
# ============================================================
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/dokploy/backup-appwebpublicidad.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

BACKUP_ROOT="${BACKUP_ROOT:-/etc/dokploy/volume-backups/appwebpublicidad}"
DB_NAME="${DB_NAME:-AppPublicidad}"
SCRATCH="${DB_NAME}_restoretest"
TABLES="Users Screens MediaItems PlaylistItems Playlists SavedPlaylistItems"

DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -m1 '^basededatos-appwebpublicidad' || true)"
if [ -z "$DB_CONTAINER" ]; then
    echo "ERROR: no se encontró el contenedor de la base de datos" >&2
    exit 1
fi

# Para crear/destruir la base temporal hacen falta privilegios de administrador.
# La contraseña se lee del propio contenedor: NUNCA se guarda en el repositorio.
ADMIN_USER="${DB_ADMIN_USER:-root}"
ADMIN_PASS="${DB_ADMIN_PASS:-$(docker exec "$DB_CONTAINER" printenv MYSQL_ROOT_PASSWORD 2>/dev/null || true)}"
if [ -z "$ADMIN_PASS" ]; then
    echo "ERROR: no se pudo obtener MYSQL_ROOT_PASSWORD del contenedor" >&2
    exit 1
fi

mysql_admin() { docker exec "$DB_CONTAINER" mysql -u"$ADMIN_USER" -p"$ADMIN_PASS" "$@"; }
mysql_admin_stdin() { docker exec -i "$DB_CONTAINER" mysql -u"$ADMIN_USER" -p"$ADMIN_PASS" "$@"; }

DUMP="$(ls -t "$BACKUP_ROOT"/*/db-*.sql.gz | head -1)"
echo "==> Verificando dump: $DUMP"

mysql_admin -e "DROP DATABASE IF EXISTS $SCRATCH; CREATE DATABASE $SCRATCH;"

echo "==> Restaurando en base temporal '$SCRATCH'..."
zcat "$DUMP" | mysql_admin_stdin "$SCRATCH"

echo "==> Comparando conteos (producción vs restaurado):"
FAIL=0
for t in $TABLES; do
    p="$(mysql_admin -N -e "SELECT COUNT(*) FROM $DB_NAME.$t;" 2>/dev/null || echo '?')"
    r="$(mysql_admin -N -e "SELECT COUNT(*) FROM $SCRATCH.$t;" 2>/dev/null || echo '?')"
    if [ "$p" = "$r" ]; then mark="OK"; else mark="DIFERENCIA"; FAIL=1; fi
    printf "    %-20s prod=%-8s restore=%-8s %s\n" "$t" "$p" "$r" "$mark"
done

mysql_admin -e "DROP DATABASE $SCRATCH;"
echo "==> Base temporal eliminada."

if [ "$FAIL" -eq 0 ]; then
    echo "==> RESTORE VERIFICADO: el backup es válido y completo."
else
    echo "==> ADVERTENCIA: los conteos no coinciden. Revisar el dump." >&2
    exit 2
fi
