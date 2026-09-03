#!/usr/bin/env bash
# Takes the nightly backup that cron missed while the machine was off.
#
# scripts/backup.sh runs at 01:30 and works. What it cannot do is run on a night
# when the machine is down at 01:30 - cron does not make up missed jobs. Over the
# fortnight to 2026-09-03 that cost five of fourteen nights: Aug 21, 22, 23, 29
# and Sep 2 have no backup, and the machine being down is exactly the kind of
# trouble after which a backup matters most.
#
# Run from @reboot. If today already has a backup it does nothing, so a machine
# that reboots twice in a day does not take two.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/backups"
LOG="$DIR/backup.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [catchup] $*" | tee -a "$LOG"; }

# backup.sh names its directory YYYYMMDD-HHMMSS, so today's is a prefix match.
if compgen -G "$DIR/$(date +%Y%m%d)-*" >/dev/null; then
  log "today already has a backup - nothing to do"
  exit 0
fi

log "no backup yet today - running the nightly backup now"
cd "$ROOT"
mkdir -p backups
APP_DIR="$ROOT" RETENTION_DAYS=30 bash scripts/backup.sh >> "$LOG" 2>&1
log "done"
