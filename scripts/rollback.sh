#!/usr/bin/env bash
#
# Roll back a bad deploy of the ALC Client Inquiry System.
#
# Code-only by default: migrations in this project are additive (new tables and
# nullable columns), so reverting the code is normally enough - the unused
# columns simply sit there. Restoring the database is opt-in via --with-db
# because it discards everything written since that dump was taken.
#
# Usage:
#   bash scripts/rollback.sh --list
#   bash scripts/rollback.sh --to <commit>
#   bash scripts/rollback.sh --to <commit> --with-db [dump.sql.gz]
#   bash scripts/rollback.sh --to <commit> --yes          # skip the prompt
#   bash scripts/rollback.sh --to <commit> --dry-run      # show the plan only
#
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
PM2_APP_NAME="${PM2_APP_NAME:-alc-client-inquiry-system}"
HEALTH_PORT="${HEALTH_PORT:-3000}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-5000000}"

TARGET_REF=""
DB_DUMP=""
WITH_DB="false"
ASSUME_YES="false"
RUN_INSTALL="false"
DRY_RUN="false"
SKIP_SAFETY="false"
LIST_ONLY="false"

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

usage() {
  sed -n '3,15p' "${BASH_SOURCE[0]}" | sed 's/^#\{0,1\} \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TARGET_REF="${2:-}"; shift 2 ;;
    --with-db)
      WITH_DB="true"
      if [[ "${2:-}" != "" && "${2:-}" != --* ]]; then DB_DUMP="$2"; shift 2; else shift; fi ;;
    --yes|-y) ASSUME_YES="true"; shift ;;
    --install) RUN_INSTALL="true"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --skip-safety-backup) SKIP_SAFETY="true"; shift ;;
    --list) LIST_ONLY="true"; shift ;;
    -h|--help) usage ;;
    *) die "Unknown option: $1 (use --help)" ;;
  esac
done

cd "$APP_DIR"
command -v git >/dev/null || die "git is required"
command -v node >/dev/null || die "node is required"

if [[ "$LIST_ONLY" == "true" ]]; then
  echo "Current HEAD:"
  git log --oneline -1
  echo
  echo "Recent commits (rollback targets):"
  git log --oneline -12
  echo
  echo "Database dumps in $BACKUP_DIR:"
  find "$BACKUP_DIR" -maxdepth 2 -name '*.sql.gz' -printf '%TY-%Tm-%Td %TH:%TM  %10s bytes  %p\n' 2>/dev/null | sort | tail -12
  exit 0
fi

[[ -n "$TARGET_REF" ]] || die "No rollback target. Use --to <commit>, or --list to see the options."

if ! git rev-parse --verify "${TARGET_REF}^{commit}" >/dev/null 2>&1; then
  git fetch --all --quiet || true
  git rev-parse --verify "${TARGET_REF}^{commit}" >/dev/null 2>&1 || die "Unknown commit: $TARGET_REF"
fi
TARGET_SHA="$(git rev-parse --short "${TARGET_REF}^{commit}")"
CURRENT_SHA="$(git rev-parse --short HEAD)"

[[ "$TARGET_SHA" != "$CURRENT_SHA" ]] || die "Already at $TARGET_SHA - nothing to roll back."

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  die "Working tree has uncommitted changes. Commit or discard them first."
fi

# Validate the dump up front, before anything destructive happens. A truncated
# or empty dump still passes gzip -t, so check the size and contents too.
DUMP_BYTES=0
if [[ "$WITH_DB" == "true" ]]; then
  if [[ -z "$DB_DUMP" ]]; then
    DB_DUMP="$(find "$BACKUP_DIR" -maxdepth 2 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)"
    [[ -n "$DB_DUMP" ]] || die "No pre-deploy-*.sql.gz found in $BACKUP_DIR; pass one explicitly."
  fi
  [[ -f "$DB_DUMP" ]] || die "Dump not found: $DB_DUMP"
  gzip -t "$DB_DUMP" 2>/dev/null || die "Dump failed its gzip integrity check: $DB_DUMP"
  DUMP_BYTES="$(stat -c %s "$DB_DUMP")"
  [[ "$DUMP_BYTES" -ge "$MIN_DUMP_BYTES" ]] || die "Dump is only ${DUMP_BYTES} bytes - refusing to restore from it."
  # pipefail + grep's early exit would report the SIGPIPE'd gzip as a failure,
  # so this check has to run with pipefail off or it fails on a valid dump.
  set +o pipefail
  HAS_SCHEMA="$(gzip -dc "$DB_DUMP" | grep -m1 -c '^CREATE TABLE' || true)"
  set -o pipefail
  [[ "$HAS_SCHEMA" == "1" ]] || die "Dump has no CREATE TABLE statements: $DB_DUMP"
fi

echo "Rollback plan"
echo "  app dir     : $APP_DIR"
echo "  from commit : $CURRENT_SHA  $(git log --format=%s -1 HEAD)"
echo "  to commit   : $TARGET_SHA  $(git log --format=%s -1 "$TARGET_SHA")"
if [[ "$WITH_DB" == "true" ]]; then
  echo "  database    : RESTORE from $DB_DUMP (${DUMP_BYTES} bytes)"
else
  echo "  database    : left untouched"
fi
echo "  npm install : $RUN_INSTALL"
echo "  pm2 app     : $PM2_APP_NAME"

if [[ "$DRY_RUN" == "true" ]]; then
  echo
  echo "Dry run - nothing was changed."
  exit 0
fi

if [[ "$ASSUME_YES" != "true" ]]; then
  echo
  read -r -p "Proceed? Type ROLLBACK to confirm: " REPLY_TEXT
  [[ "$REPLY_TEXT" == "ROLLBACK" ]] || die "Cancelled."
fi

if [[ "$WITH_DB" == "true" || "$SKIP_SAFETY" != "true" ]]; then
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is not set in $ENV_FILE"
  mapfile -t DB_PARTS < <(
    node -e '
      const url = new URL(process.env.DATABASE_URL);
      console.log(decodeURIComponent(url.hostname || "localhost"));
      console.log(url.port || "3306");
      console.log(decodeURIComponent(url.username || ""));
      console.log(decodeURIComponent(url.password || ""));
      console.log(decodeURIComponent(url.pathname.replace(/^\//, "")));
    '
  )
  DB_HOST="${DB_PARTS[0]}"
  DB_PORT="${DB_PARTS[1]}"
  DB_USER="${DB_PARTS[2]}"
  DB_PASSWORD="${DB_PARTS[3]}"
  DB_NAME="${DB_PARTS[4]}"
  [[ -n "$DB_NAME" && -n "$DB_USER" ]] || die "Could not parse DATABASE_URL"
fi

# Always snapshot the live database first, so the rollback is itself reversible.
SAFETY=""
if [[ "$SKIP_SAFETY" != "true" ]]; then
  step "Snapshotting the current database"
  mkdir -p "$BACKUP_DIR"
  SAFETY="$BACKUP_DIR/rollback-safety-$(date +%Y%m%d-%H%M%S).sql.gz"
  MYSQL_PWD="$DB_PASSWORD" mysqldump --single-transaction --quick --no-tablespaces \
    --routines --triggers -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" "$DB_NAME" | gzip -6 > "$SAFETY"
  gzip -t "$SAFETY" || die "Safety snapshot failed its integrity check"
  SAFETY_BYTES="$(stat -c %s "$SAFETY")"
  [[ "$SAFETY_BYTES" -ge "$MIN_DUMP_BYTES" ]] || die "Safety snapshot is only ${SAFETY_BYTES} bytes - aborting."
  echo "    saved $SAFETY (${SAFETY_BYTES} bytes)"
fi

step "Checking out $TARGET_SHA"
git checkout --quiet --force "$TARGET_SHA"
git log --oneline -1

if [[ "$WITH_DB" == "true" ]]; then
  step "Restoring $DB_NAME from $DB_DUMP"
  MYSQL_PWD="$DB_PASSWORD" mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" \
    -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  gzip -dc "$DB_DUMP" | MYSQL_PWD="$DB_PASSWORD" mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --default-character-set=utf8mb4 "$DB_NAME"
  echo "    restored"
fi

if [[ "$RUN_INSTALL" == "true" ]]; then
  step "Installing dependencies"
  npm ci
fi

step "Regenerating the Prisma client"
npx prisma generate

step "Building"
npm run build

step "Restarting $PM2_APP_NAME"
pm2 restart "$PM2_APP_NAME" --update-env
sleep 5
pm2 list | grep -E "$PM2_APP_NAME" || true

step "Health check"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://localhost:${HEALTH_PORT}/login" || echo 000)"
echo "    GET /login -> $CODE"
[[ "$CODE" == "200" ]] || die "App did not return 200 after rollback - check: pm2 logs $PM2_APP_NAME"

echo
echo "Rollback complete. Now at $(git rev-parse --short HEAD): $(git log --format=%s -1 HEAD)"
[[ -n "$SAFETY" ]] && echo "Pre-rollback database snapshot: $SAFETY"
echo "NOTE: the checkout left the repo on a detached HEAD."
echo "      To resume normal deploys: git checkout main && git reset --hard <good-commit>"
