#!/usr/bin/env bash
#
# Watches for the fault that degrades this host, and puts the site back up if it falls over.
#
# What it is watching for
# -----------------------
# On this machine a Node process that spawns short-lived children eventually stops being able
# to reap them: the children become zombies and the parent blocks in futex_do_wait. It is not
# present on a fresh boot - 60 spawned children reaped in 2 seconds - and appears after about a
# day of uptime, so it accumulates rather than being inherent to the kernel.
#
# It has three faces, all the same fault:
#   * the pm2 daemon stops answering, and stops supervising anything;
#   * next build hangs partway and never recovers;
#   * the load average reads nine on an idle machine, counting the blocked tasks.
#
# What it does about it
# ---------------------
# Reports, and restarts the app if nothing is listening. It deliberately does NOT reset pm2
# while the site is up: that briefly stops both applications, and a wedged daemon with a
# healthy site is not worth an outage. When the site is already down there is nothing to lose.
#
# Install (no sudo needed):
#   */10 * * * * /usr/bin/env bash /home/agusanlending/alc-client-inquiry-system/scripts/health-watch.sh >> /home/agusanlending/health-watch.log 2>&1
set -uo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_NAME="${APP_NAME:-alc-client-inquiry-system}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/login}"
ZOMBIE_WARN="${ZOMBIE_WARN:-20}"

cd "$APP_DIR"
stamp() { date '+%Y-%m-%d %H:%M:%S'; }
say() { echo "$(stamp) $*"; }

answers() {
  [[ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)" == "200" ]]
}

zombies="$(ps -eo stat --no-headers 2>/dev/null | grep -c '^Z')"
load="$(cut -d' ' -f1 /proc/loadavg)"
pm2_ok=no
timeout 15 pm2 ping >/dev/null 2>&1 && pm2_ok=yes

# Only worth a line in the log when something is off; a healthy machine stays quiet so the log
# is readable rather than a wall of "fine".
if answers; then
  if [[ "$pm2_ok" == "no" || "$zombies" -ge "$ZOMBIE_WARN" ]]; then
    say "degrading: site up, pm2_responds=$pm2_ok zombies=$zombies load=$load"
    say "  the host is heading for the state where deploys fail; a reboot clears it"
  fi
  exit 0
fi

# The site is down. Anything is better than leaving it there.
say "SITE DOWN: pm2_responds=$pm2_ok zombies=$zombies load=$load - recovering"

if [[ "$pm2_ok" == "yes" ]]; then
  say "  trying pm2 restart"
  timeout 60 pm2 restart "$APP_NAME" --update-env >/dev/null 2>&1
  for _ in $(seq 1 12); do answers && { say "  back up via pm2 restart"; exit 0; }; sleep 5; done
fi

say "  clearing the pm2 daemon and restoring from its dump"
timeout 45 pm2 kill >/dev/null 2>&1 || {
  god="$(pgrep -f 'PM2.*God' | head -1)"
  [[ -n "$god" ]] && kill -9 "$god" 2>/dev/null
}
sleep 4
timeout 90 pm2 resurrect >/dev/null 2>&1
for _ in $(seq 1 15); do answers && { say "  back up after a full pm2 restart"; exit 0; }; sleep 5; done

# pm2 will not start anything at all. Unsupervised and up beats supervised and down.
say "  pm2 will not start it; starting the app directly"
( cd "$APP_DIR" && setsid nohup npm start > /tmp/alc-app-watch.log 2>&1 < /dev/null & ) || true
for _ in $(seq 1 15); do answers && { say "  back up, but NOT under pm2 - needs putting back"; exit 0; }; sleep 5; done

say "  STILL DOWN after every attempt - needs a person"
exit 1
