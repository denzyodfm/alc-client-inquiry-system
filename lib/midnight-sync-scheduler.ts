import { syncOnlineBranches } from "@/scripts/sync-service";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_CATCH_UP_DELAY_MS = 10 * 1000;
const STALE_RUN_THRESHOLD_MS = 90 * 60 * 1000;

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

// A run that never reaches its finalization step (process killed outright,
// not just an in-process error) leaves this row stuck at finishedAt: NULL
// forever. That defeats hasMidnightSyncToday()'s guard and made the
// catch-up sync retry from scratch every time the server restarted,
// hammering branch databases all night without ever completing. Close out
// anything that's clearly abandoned before deciding whether to catch up.
async function reconcileStaleSyncRuns() {
  const staleCutoff = new Date(Date.now() - STALE_RUN_THRESHOLD_MS);
  const stale = await prisma.syncLog.findMany({
    where: {
      branchId: null,
      finishedAt: null,
      startedAt: { lt: staleCutoff },
      message: { startsWith: "Midnight sync" }
    },
    select: { id: true }
  });

  if (!stale.length) return;

  await prisma.syncLog.updateMany({
    where: { id: { in: stale.map((row) => row.id) } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      message: "Run did not finish - the server likely restarted or crashed mid-sync. Marked failed by startup reconciliation."
    }
  });
  console.warn(`[midnight-sync] Reconciled ${stale.length} abandoned sync run(s) that never finished.`);
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

// Starting the server no longer syncs. A restart is usually someone clearing a hung app, and
// making that restart immediately pull every branch over the WAN is what kept the app under
// load the moment it came back. Syncing now happens at midnight, or when someone asks for it
// from a branch card. Abandoned runs are still closed out, since that only touches our own
// rows and keeps the midnight guard honest.
async function reconcileOnStartup() {
  const state = schedulerState();
  if (state.catchUpChecked) return;

  state.catchUpChecked = true;
  try {
    await reconcileStaleSyncRuns();
  } catch (error) {
    console.error("[midnight-sync] Startup reconciliation failed:", error);
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
    void reconcileOnStartup();
  }, STARTUP_CATCH_UP_DELAY_MS);
  console.log(`[midnight-sync] Next online-branch sync scheduled for ${state.nextRunAt?.toLocaleString()}. Startup does not sync.`);
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
