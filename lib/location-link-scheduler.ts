import { linkUnlinkedLoans } from "@/lib/location-linker";

const DAY_MS = 24 * 60 * 60 * 1000;

type SchedulerState = {
  started: boolean;
  running: boolean;
  catchUpChecked: boolean;
  timer?: ReturnType<typeof setTimeout>;
  nextRunAt?: Date;
};

declare global {
  // eslint-disable-next-line no-var
  var __alcLocationLinkScheduler: SchedulerState | undefined;
}

function schedulerState() {
  globalThis.__alcLocationLinkScheduler ??= { started: false, running: false, catchUpChecked: false };
  return globalThis.__alcLocationLinkScheduler;
}

function nextDailyRun(now = new Date()) {
  const next = new Date(now);
  next.setHours(1, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

async function runScheduledLink() {
  const state = schedulerState();
  if (state.running) return;
  state.running = true;
  try {
    await linkUnlinkedLoans({ trigger: "SCHEDULED" });
  } catch (error) {
    console.error("[location-link] Scheduled linking failed:", error);
  } finally {
    state.running = false;
    scheduleNextRun();
  }
}

// Linking on startup was the same problem in miniature: a restart scanned every unlinked loan
// before anyone had asked for anything. It runs on its daily schedule, or from the button on
// Location Masterlist.

function scheduleNextRun() {
  const state = schedulerState();
  const nextRunAt = nextDailyRun();
  const delay = Math.min(Math.max(nextRunAt.getTime() - Date.now(), 1000), DAY_MS);
  if (state.timer) clearTimeout(state.timer);
  state.nextRunAt = nextRunAt;
  state.timer = setTimeout(() => void runScheduledLink(), delay);
}

export function startLocationLinkScheduler() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.LOCATION_LINK_SCHEDULER_ENABLED === "false") return;
  const state = schedulerState();
  if (state.started) return;
  state.started = true;
  scheduleNextRun();
  console.log(`[location-link] Next daily link scheduled for ${state.nextRunAt?.toLocaleString()}. Startup does not link.`);
}

export function getLocationLinkSchedule() {
  const state = schedulerState();
  return {
    enabled: process.env.LOCATION_LINK_SCHEDULER_ENABLED !== "false",
    running: state.running,
    nextRunAt: state.nextRunAt?.toISOString() ?? null
  };
}
