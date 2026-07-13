import { syncOnlineBranches } from "@/scripts/sync-service";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_CATCH_UP_DELAY_MS = 10 * 1000;

type SchedulerState = {
  running: boolean;
  started: boolean;
  catchUpChecked: boolean;
  timer?: ReturnType<typeof setTimeout>;
  catchUpTimer?: ReturnType<typeof setTimeout>;
  nextRunAt?: Date;
};

declare global {
  // eslint-disable-next-line no-var
  var __alcMidnightSyncScheduler: SchedulerState | undefined;
}

function schedulerState() {
  globalThis.__alcMidnightSyncScheduler ??= {
    running: false,
    started: false,
    catchUpChecked: false
  };

  return globalThis.__alcMidnightSyncScheduler;
}

function nextLocalMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next;
}

function startOfLocalDay(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function runScheduledSync(messagePrefix = "Midnight sync") {
  const state = schedulerState();
  if (state.running) return;

  state.running = true;
  try {
    await syncOnlineBranches(messagePrefix);
  } catch (error) {
    console.error("[midnight-sync] Scheduled sync failed:", error);
  } finally {
    state.running = false;
    scheduleNextRun();
  }
}

async function hasMidnightSyncToday() {
  const today = startOfLocalDay();
  const existing = await prisma.syncLog.findFirst({
    where: {
      branchId: null,
      finishedAt: { not: null },
      startedAt: { gte: today },
      message: { startsWith: "Midnight sync" }
    },
    select: { id: true }
  });

  return Boolean(existing);
}

async function runStartupCatchUpIfMissed() {
  const state = schedulerState();
  if (state.catchUpChecked) return;

  state.catchUpChecked = true;
  try {
    if (await hasMidnightSyncToday()) return;
    await runScheduledSync("Midnight sync catch-up");
  } catch (error) {
    console.error("[midnight-sync] Startup catch-up check failed:", error);
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
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.MIDNIGHT_SYNC_ENABLED === "false") return;

  const state = schedulerState();
  if (state.started) return;

  state.started = true;
  scheduleNextRun();
  state.catchUpTimer = setTimeout(() => {
    void runStartupCatchUpIfMissed();
  }, STARTUP_CATCH_UP_DELAY_MS);
  console.log(`[midnight-sync] Next online-branch sync scheduled for ${state.nextRunAt?.toLocaleString()}.`);
}

export function getMidnightSyncSchedule() {
  const state = schedulerState();
  return {
    enabled: process.env.MIDNIGHT_SYNC_ENABLED !== "false",
    started: state.started,
    running: state.running,
    catchUpChecked: state.catchUpChecked,
    nextRunAt: state.nextRunAt?.toISOString() ?? null
  };
}
