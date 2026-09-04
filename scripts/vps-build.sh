#!/usr/bin/env bash
#
# Builds the app on the VPS, retrying past the host's intermittent child-process hang.
#
# Why this exists
# ---------------
# On this host a `next build` sometimes stops dead with a zombie child and the parent
# blocked in futex_do_wait. Two spots have been observed:
#
#   * at startup, before any output - detect-libc inside @vercel/nft runs
#     spawnSync("getconf", ["GNU_LIBC_VERSION"]) and never returns;
#   * at the end, during "Collecting build traces" - the static-generation workers exit
#     and are left defunct.
#
# It is not a Next misconfiguration. The same failure wedges the pm2 daemon, whose only
# crime is running `df` for its metrics, and next.config.ts already disables the webpack
# build worker for the same reason. Host: Ubuntu 26.04, kernel 7.0, Node 22, Hyper-V guest.
# A hung build never recovers on its own, but a fresh one almost always succeeds.
#
# So: watch the build log. If it stops growing while the process is still alive, the build
# is hung rather than slow - kill it and start over.
#
# Where the build lands
# ---------------------
# Into a staging directory, not .next. A build writing straight into .next deletes the chunk
# files the running app is still handing out, so every deploy broke the site from the moment
# the build reached that point until the restart. Staging plus scripts/vps-release.sh narrows
# that to the restart itself.
#
# Usage:
#   bash scripts/vps-build.sh          # build into .next-staging
#   bash scripts/vps-release.sh        # swap it into place and restart
#   ATTEMPTS=6 STALL_SECONDS=240 bash scripts/vps-build.sh
#
set -uo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG_FILE="${LOG_FILE:-$APP_DIR/build.log}"
ATTEMPTS="${ATTEMPTS:-4}"
# Longest the log may stay unchanged before the build is treated as hung. Generating static
# pages is the quietest real phase, so this needs headroom above that.
STALL_SECONDS="${STALL_SECONDS:-180}"
POLL_SECONDS="${POLL_SECONDS:-10}"
# Built here, then moved into place by vps-release.sh. Never .next: that is the live one.
STAGING_DIR="${STAGING_DIR:-.next-staging}"

cd "$APP_DIR"

kill_tree() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  pkill -9 -P "$pid" 2>/dev/null
  kill -9 "$pid" 2>/dev/null
  sleep 2
}

for attempt in $(seq 1 "$ATTEMPTS"); do
  echo "==> Build attempt $attempt of $ATTEMPTS"
  rm -f "$LOG_FILE"
  # A half-written staging directory from a hung attempt must not be mistaken for a good one.
  rm -rf "$APP_DIR/$STAGING_DIR"

  NEXT_DIST_DIR="$STAGING_DIR" setsid nohup npm run build > "$LOG_FILE" 2>&1 < /dev/null &
  wrapper_pid=$!
  sleep 3
  # The npm wrapper forks; the node process doing the work is the one to watch and kill.
  build_pid="$(pgrep -f 'nex[t] build' | tail -1)"
  [[ -n "$build_pid" ]] || build_pid="$wrapper_pid"
  echo "    build pid $build_pid, logging to $LOG_FILE"

  last_size=-1
  stalled_for=0
  status="running"

  while :; do
    if ! kill -0 "$build_pid" 2>/dev/null; then
      status="exited"
      break
    fi

    size="$(stat -c %s "$LOG_FILE" 2>/dev/null || echo 0)"
    if [[ "$size" == "$last_size" ]]; then
      stalled_for=$(( stalled_for + POLL_SECONDS ))
    else
      stalled_for=0
      last_size="$size"
    fi

    if (( stalled_for >= STALL_SECONDS )); then
      status="hung"
      break
    fi
    sleep "$POLL_SECONDS"
  done

  if [[ "$status" == "hung" ]]; then
    zombies="$(ps -eo stat,ppid --no-headers 2>/dev/null | awk -v p="$build_pid" '$1 ~ /^Z/ && $2 == p' | wc -l)"
    echo "    no output for ${STALL_SECONDS}s with ${zombies} defunct child(ren) - treating as hung"
    kill_tree "$build_pid"
    continue
  fi

  # An exited build still has to have actually succeeded.
  if grep -q "Compiled successfully" "$LOG_FILE" && [[ -s "$APP_DIR/$STAGING_DIR/BUILD_ID" ]]; then
    echo "==> Build succeeded on attempt $attempt"
    echo "    BUILD_ID $(cat "$APP_DIR/$STAGING_DIR/BUILD_ID") staged in $STAGING_DIR"
    echo "    the live site is untouched until scripts/vps-release.sh runs"
    exit 0
  fi

  echo "    build exited without succeeding; last lines:"
  tail -15 "$LOG_FILE" | sed 's/^/      /'
done

echo "==> Build failed after $ATTEMPTS attempt(s). See $LOG_FILE" >&2
exit 1
