#!/usr/bin/env bash
# Scheduled database backup with retention.
#
# Until now the only backups this system had were the ones taken by hand before a
# deploy. That covers a bad release; it does not cover a disk failure, a mistaken
# DELETE on a Tuesday afternoon, or any day nobody happened to deploy.
#
# Run daily from cron. Also safe to run by hand at any time.
#
#   bash scripts/db-backup.sh            # take today's backup if it is missing
#   bash scripts/db-backup.sh --force    # take one regardless
#
# Backups older than KEEP_DAYS are removed, but only the ones this script wrote.
# The pre-deploy and rollback backups are left alone; they are somebody's safety
# net for a specific change and are not this script's to delete.
set -euo pipefail

KEEP_DAYS=14
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/backups"
LOG="$DIR/backup.log"
FORCE="${1:-}"

mkdir -p "$DIR"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

cd "$ROOT"
set -a; . ./.env; set +a

# Today's backup already exists, and nobody asked for another.
TODAY="$(date +%Y%m%d)"
if [ "$FORCE" != "--force" ] && compgen -G "$DIR/daily-$TODAY-*.sql.gz" >/dev/null; then
  log "daily backup for $TODAY already exists - nothing to do"
  exit 0
fi

mapfile -t P < <(node -e '
const u = new URL(process.env.DATABASE_URL);
console.log(decodeURIComponent(u.hostname || "localhost"));
console.log(u.port || "3306");
console.log(decodeURIComponent(u.username));
console.log(decodeURIComponent(u.password));
console.log(decodeURIComponent(u.pathname.replace(/^\//, "")));
')

OUT="$DIR/daily-$(date +%Y%m%d-%H%M%S).sql.gz"
log "starting backup -> $(basename "$OUT")"

# --single-transaction keeps this consistent without locking the application out.
if ! MYSQL_PWD="${P[3]}" mysqldump \
      --single-transaction --quick --no-tablespaces --routines --triggers \
      -h"${P[0]}" -P"${P[1]}" -u"${P[2]}" "${P[4]}" | gzip -6 > "$OUT"; then
  log "FAILED: mysqldump did not complete - removing partial file"
  rm -f "$OUT"
  exit 1
fi

# A backup nobody has verified is a guess. Prove the archive reads back before
# it is counted, and before anything older is deleted on the strength of it.
if ! gzip -t "$OUT"; then
  log "FAILED: $(basename "$OUT") is not a readable archive - removing it"
  rm -f "$OUT"
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
log "ok: $(basename "$OUT") ($SIZE), verified"

# Retention runs only after a good backup exists, so a run of failures can never
# erode the history.
DELETED=0
while IFS= read -r old; do
  rm -f "$old"
  DELETED=$((DELETED + 1))
  log "  pruned $(basename "$old")"
done < <(find "$DIR" -maxdepth 1 -name 'daily-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -print)
log "retention: keeping $KEEP_DAYS days, pruned $DELETED"
