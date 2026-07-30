import { prisma } from "@/lib/prisma";
import { linkUnlinkedLoans } from "@/lib/location-linker";

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_CATCH_UP_DELAY_MS = 20 * 1000;

type SchedulerState = {
  started: boolean;
  running: boolean;
  catchUpChecked: boolean;
  timer?: ReturnType<typeof setTimeout>;
  catchUpTimer?: ReturnType<typeof setTimeout>;
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

function startOfLocalDay(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
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

async function runStartupCatchUpIfMissed() {
  const state = schedulerState();
  if (state.catchUpChecked) return;
  state.catchUpChecked = true;
  try {
    const existing = await prisma.locationLinkRun.findFirst({
      where: { status: "SUCCESS", startedAt: { gte: startOfLocalDay() } },
      select: { id: true }
    });
    if (!existing) await runScheduledLink();
  } catch (error) {
    console.error("[location-link] Startup catch-up failed:", error);
  }
}

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
  state.catchUpTimer = setTimeout(() => void runStartupCatchUpIfMissed(), STARTUP_CATCH_UP_DELAY_MS);
  console.log(`[location-link] Next daily link scheduled for ${state.nextRunAt?.toLocaleString()}.`);
}

export function getLocationLinkSchedule() {
  const state = schedulerState();
  return {
    enabled: process.env.LOCATION_LINK_SCHEDULER_ENABLED !== "false",
    running: state.running,
    nextRunAt: state.nextRunAt?.toISOString() ?? null
  };
}
