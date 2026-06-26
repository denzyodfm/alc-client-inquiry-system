export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMidnightSyncScheduler } = await import("@/lib/midnight-sync-scheduler");
    startMidnightSyncScheduler();
  }
}
