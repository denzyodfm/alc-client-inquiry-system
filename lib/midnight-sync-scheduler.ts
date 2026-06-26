import { syncOnlineBranches } from "@/scripts/sync-service";

const DAY_MS = 24 * 60 * 60 * 1000;

type SchedulerState = {
  running: boolean;
  started: boolean;
  timer?: ReturnType<typeof setTimeout>;
  nextRunAt?: Date;
};

declare global {
  // eslint-disable-next-line no-var
  var __alcMidnightSyncScheduler: SchedulerState | undefined;
}

function schedulerState() {
  globalThis.__alcMidnightSyncScheduler ??= {
    running: false,
    started: false
  };

  return globalThis.__alcMidnightSyncScheduler;
}

function nextLocalMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next;
}

async function runScheduledSync() {
  const state = schedulerState();
  if (state.running) return;

  state.running = true;
  try {
    await syncOnlineBranches("Midnight sync");
  } catch (error) {
    console.error("[midnight-sync] Scheduled sync failed:", error);
  } finally {
    state.running = false;
    scheduleNextRun();
  }
}

function scheduleNextRun() {
  const state = schedulerState();
  const nextRunAt = nextLocalMidnight();
  const delay = Math.min(Math.max(nextRunAt.getTime() - Date.now(), 1000), DAY_MS);

  if (state.timer) clearTimeout(state.timer);
  state.nextRunAt = nextRunAt;
  state.timer = setTimeout(() => {
    void runScheduledSync();
  }, delay);
}

export function startMidnightSyncScheduler() {
  if (process.env.MIDNIGHT_SYNC_ENABLED === "false") return;

  const state = schedulerState();
  if (state.started) return;

  state.started = true;
  scheduleNextRun();
  console.log(`[midnight-sync] Next online-branch sync scheduled for ${state.nextRunAt?.toLocaleString()}.`);
}

export function getMidnightSyncSchedule() {
  const state = schedulerState();
  return {
    enabled: process.env.MIDNIGHT_SYNC_ENABLED !== "false",
    started: state.started,
    running: state.running,
    nextRunAt: state.nextRunAt?.toISOString() ?? null
  };
}
