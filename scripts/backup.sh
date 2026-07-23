#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set in $ENV_FILE" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to parse DATABASE_URL" >&2
  exit 1
fi

if ! command -v mysqldump >/dev/null 2>&1; then
  echo "mysqldump is required for database backups" >&2
  exit 1
fi

if ! command -v gzip >/dev/null 2>&1; then
  echo "gzip is required for compressed database backups" >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "tar is required for app backups" >&2
  exit 1
fi

mapfile -t DB_PARTS < <(
  node -e '
    const url = new URL(process.env.DATABASE_URL);
    const dbName = url.pathname.replace(/^\//, "");
    console.log(decodeURIComponent(url.hostname || "localhost"));
    console.log(url.port || "3306");
    console.log(decodeURIComponent(url.username || ""));
    console.log(decodeURIComponent(url.password || ""));
    console.log(decodeURIComponent(dbName));
  '
)

DB_HOST="${DB_PARTS[0]}"
DB_PORT="${DB_PARTS[1]}"
DB_USER="${DB_PARTS[2]}"
DB_PASSWORD="${DB_PARTS[3]}"
DB_NAME="${DB_PARTS[4]}"

if [[ -z "$DB_USER" || -z "$DB_NAME" ]]; then
  echo "DATABASE_URL must include a database user and database name" >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$BACKUP_DIR/$TIMESTAMP"
DB_BACKUP="$RUN_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"
APP_BACKUP="$RUN_DIR/alc-client-inquiry-system_${TIMESTAMP}.tar.gz"

mkdir -p "$RUN_DIR"
chmod 700 "$BACKUP_DIR" "$RUN_DIR"

echo "Creating database backup: $DB_BACKUP"
MYSQL_PWD="$DB_PASSWORD" mysqldump \
  --single-transaction \
  --quick \
  --no-tablespaces \
  --routines \
  --triggers \
  --events \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  "$DB_NAME" | gzip -9 > "$DB_BACKUP"

echo "Creating app backup: $APP_BACKUP"
tar \
  --exclude="./backups" \
  --exclude="./node_modules" \
  --exclude="./.next" \
  --exclude="./dist" \
  --exclude="./coverage" \
  --exclude="./*.log" \
  --exclude="./tsconfig.tsbuildinfo" \
  -czf "$APP_BACKUP" \
  -C "$APP_DIR" \
  .

chmod 600 "$DB_BACKUP" "$APP_BACKUP"

echo "Removing backups older than $RETENTION_DAYS days from $BACKUP_DIR"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -exec rm -rf {} \;

echo "Backup complete:"
echo "  Database: $DB_BACKUP"
echo "  App:      $APP_BACKUP"
