#!/usr/bin/env bash
#
# Puts a staged build live: swap the directory, restart, confirm it answers.
#
# Why the swap is separate from the build
# ---------------------------------------
# A `next build` writing straight into .next deletes the chunk files the running app is still
# handing out. From that moment until the restart, every page load asks for files that no
# longer exist and the browser shows "Application error: a client-side exception has
# occurred". On this host a build takes minutes and has hung often enough to need a retry
# wrapper, so that window was minutes long and hit real users three times in one day.
#
# scripts/vps-build.sh now builds into .next-staging and leaves .next alone. This moves the
# finished build into place and restarts, which narrows the outage to the restart itself.
#
# If the app does not come back, the previous build is still on disk and is put back.
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

healthy() {
  local code
  code="$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)"
  [[ "$code" == "200" ]]
}

if [[ ! -s "$STAGING_DIR/BUILD_ID" ]]; then
  echo "No staged build in $STAGING_DIR. Run scripts/vps-build.sh first." >&2
  exit 1
fi

NEW_BUILD="$(cat "$STAGING_DIR/BUILD_ID")"
OLD_BUILD="$(cat .next/BUILD_ID 2>/dev/null || echo none)"
echo "==> Releasing $NEW_BUILD (replacing $OLD_BUILD)"

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

echo "==> Restarting $APP_NAME"
if ! timeout 90 pm2 restart "$APP_NAME" --update-env >/dev/null 2>&1; then
  echo "    pm2 restart did not return cleanly; checking whether the app came up anyway"
fi

for _ in $(seq 1 "$HEALTH_TRIES"); do
  healthy && break
  sleep 3
done

if healthy; then
  echo "==> Live on $NEW_BUILD"
  rm -rf "$PREVIOUS_DIR"
  exit 0
fi

echo "==> App did not answer after the restart; rolling back to $OLD_BUILD" >&2
if [[ -d "$PREVIOUS_DIR" ]]; then
  rm -rf "$STAGING_DIR"
  mv .next "$STAGING_DIR"
  mv "$PREVIOUS_DIR" .next
  timeout 90 pm2 restart "$APP_NAME" --update-env >/dev/null 2>&1
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    healthy && break
    sleep 3
  done
  healthy && echo "    rolled back; the failed build is in $STAGING_DIR" >&2 \
          || echo "    rollback did not come up either - needs a look" >&2
else
  echo "    no previous build to roll back to" >&2
fi
exit 1
