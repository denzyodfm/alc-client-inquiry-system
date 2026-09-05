#!/usr/bin/env bash
#
# Puts a staged build live: swap the directory, restart, and prove the running process is
# actually serving the new build.
#
# Why the swap is separate from the build
# ---------------------------------------
# A `next build` writing straight into .next deletes the chunk files the running app is still
# handing out. From that moment until the restart, every page load asks for files that no
# longer exist and the browser shows "Application error: a client-side exception has
# occurred". scripts/vps-build.sh builds into .next-staging and leaves .next alone; this moves
# the finished build into place, which narrows that window to the restart itself.
#
# Why answering 200 is not proof
# ------------------------------
# This used to accept "the app answers" as proof the restart worked. It is not. On 4-5 Sep 2026
# pm2's daemon wedged and silently refused to restart anything while still reporting success,
# so the old process kept answering 200 across three deploys that each swapped .next underneath
# it. Every one announced itself as live. Users got a page whose JavaScript belonged to a build
# whose chunks had since been deleted - dead menus, and a client-side exception on any
# navigation - and the deploys meant to fix that had never actually run.
#
# So the test is now: does the HTML the server hands out mention the BUILD_ID on disk? If not,
# the process is stale no matter what status code it returns.
#
# Usage:
#   bash scripts/vps-build.sh && bash scripts/vps-release.sh
set -uo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STAGING_DIR="${STAGING_DIR:-.next-staging}"
PREVIOUS_DIR="${PREVIOUS_DIR:-.next-previous}"
APP_NAME="${APP_NAME:-alc-client-inquiry-system}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/login}"
HEALTH_TRIES="${HEALTH_TRIES:-40}"

cd "$APP_DIR"

# next start reads distDir from next.config.ts, which honours NEXT_DIST_DIR. The served build
# must always be .next, so make sure a stray value cannot follow us into pm2's environment.
unset NEXT_DIST_DIR

app_pid() {
  ss -lntp 2>/dev/null | grep ':3000 ' | grep -oP 'pid=\K[0-9]+' | head -1
}

answers() {
  [[ "$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)" == "200" ]]
}

# The check that matters: the running process must hand out the build that is on disk. Next
# names its asset paths after the build, so the id appears in the page it serves.
serving_build() {
  curl -s -m 8 "$HEALTH_URL" 2>/dev/null | grep -qF "$1"
}

wait_for_build() {
  local want="$1"
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    if answers && serving_build "$want"; then return 0; fi
    sleep 3
  done
  return 1
}

if [[ ! -s "$STAGING_DIR/BUILD_ID" ]]; then
  echo "No staged build in $STAGING_DIR. Run scripts/vps-build.sh first." >&2
  exit 1
fi

NEW_BUILD="$(cat "$STAGING_DIR/BUILD_ID")"
OLD_BUILD="$(cat .next/BUILD_ID 2>/dev/null || echo none)"
OLD_PID="$(app_pid)"
echo "==> Releasing $NEW_BUILD (replacing $OLD_BUILD), app pid ${OLD_PID:-none}"

# The swap is three renames on the same filesystem, so the site is inconsistent for
# milliseconds rather than minutes.
rm -rf "$PREVIOUS_DIR"
if [[ -d .next ]]; then
  mv .next "$PREVIOUS_DIR" || { echo "Could not set the current build aside; nothing changed." >&2; exit 1; }
fi
if ! mv "$STAGING_DIR" .next; then
  echo "Could not move the staged build into place; restoring the previous one." >&2
  [[ -d "$PREVIOUS_DIR" ]] && mv "$PREVIOUS_DIR" .next
  exit 1
fi

# A page already open in somebody's browser still asks for the chunk files of the build it was
# served by. Carrying the previous build's static files forward - never overwriting a new one -
# lets those tabs keep working until the reader reloads.
if [[ -d "$PREVIOUS_DIR/static" ]]; then
  before="$(find .next/static -type f 2>/dev/null | wc -l)"
  # -n so a new file is never overwritten by its older namesake, -p so the carried files keep
  # their original dates - the pruning below reads those dates to decide what has aged out.
  cp -rpn "$PREVIOUS_DIR/static/." .next/static/ 2>/dev/null
  after="$(find .next/static -type f 2>/dev/null | wc -l)"
  echo "    carried forward $(( after - before )) file(s) from the previous build so open tabs survive"
  # Each release carries the one before it, so without this the directory would grow for ever.
  pruned="$(find .next/static -type f -mtime "+${KEEP_ASSET_DAYS:-7}" -print -delete 2>/dev/null | wc -l)"
  [[ "$pruned" -gt 0 ]] && echo "    pruned $pruned asset(s) older than ${KEEP_ASSET_DAYS:-7} days"
fi

echo "==> Restarting $APP_NAME"
if timeout 90 pm2 restart "$APP_NAME" --update-env >/dev/null 2>&1; then
  echo "    pm2 restart returned cleanly"
else
  echo "    pm2 restart did not return cleanly - the build check below decides, not this"
fi

if wait_for_build "$NEW_BUILD"; then
  echo "==> Live on $NEW_BUILD (pid $(app_pid), was ${OLD_PID:-none})"
  rm -rf "$PREVIOUS_DIR"
  exit 0
fi

# pm2's daemon wedges on this host and will refuse to restart while still reporting success.
# Stopping the process directly makes pm2 respawn it against the new build.
echo "==> Still serving the old build after the restart; stopping the process directly" >&2
CURRENT_PID="$(app_pid)"
if [[ -n "$CURRENT_PID" ]]; then
  kill "$CURRENT_PID" 2>/dev/null
  sleep 5
fi

if wait_for_build "$NEW_BUILD"; then
  echo "==> Live on $NEW_BUILD (pid $(app_pid), was ${OLD_PID:-none}) after stopping it directly"
  echo "    pm2 could not restart it - its daemon is probably wedged and worth clearing." >&2
  rm -rf "$PREVIOUS_DIR"
  exit 0
fi

echo "==> The app is not serving $NEW_BUILD; rolling back to $OLD_BUILD" >&2
if [[ -d "$PREVIOUS_DIR" ]]; then
  rm -rf "$STAGING_DIR"
  mv .next "$STAGING_DIR"
  mv "$PREVIOUS_DIR" .next
  timeout 90 pm2 restart "$APP_NAME" --update-env >/dev/null 2>&1
  if ! wait_for_build "$OLD_BUILD"; then
    CURRENT_PID="$(app_pid)"
    [[ -n "$CURRENT_PID" ]] && kill "$CURRENT_PID" 2>/dev/null
  fi
  if wait_for_build "$OLD_BUILD"; then
    echo "    rolled back; the build that would not start is in $STAGING_DIR" >&2
  elif answers; then
    echo "    WARNING: answering, but not on $OLD_BUILD either - needs a look" >&2
  else
    echo "    WARNING: the app is down - needs a look" >&2
  fi
else
  echo "    no previous build to roll back to" >&2
fi
exit 1
