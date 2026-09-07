// Writes down the loan book for a month end. Run from cron on the last day of each month.
//
//   npx tsx scripts/capture-month.ts            # capture the month that is ending today
//   OVERWRITE=1 npx tsx scripts/capture-month.ts
//   PERIOD_END=2026-08-31 npx tsx scripts/capture-month.ts
//
// A month already captured is left alone unless OVERWRITE is set. The whole point of the
// report is that a closed month does not move, so overwriting has to be deliberate.
import { captureMonth, monthEnd } from "@/lib/monthly-portfolio";
import { prisma } from "@/lib/prisma";

async function main() {
  const requested = process.env.PERIOD_END;
  const period = requested ? new Date(`${requested}T00:00:00Z`) : monthEnd(new Date());
  if (Number.isNaN(period.getTime())) {
    console.error("PERIOD_END must look like 2026-08-31");
    process.exit(1);
  }
  // Only the last day of a month may be captured automatically. Run on any other day this
  // would write today's book under that month's date - a report labelled "as of 30 September"
  // holding figures from the 7th, which is precisely the lie this report exists to avoid. A
  // date given explicitly is a deliberate act and is allowed through.
  // The dates below are read in UTC and the cron fires at 23:50 by the server clock. The
  // server runs on UTC, so those are the same day. On a clock west of UTC, 23:50 local would
  // already be the next day in UTC and this guard would refuse every month.
  if (!requested) {
    const today = new Date();
    const isLastDay = today.getUTCDate() === monthEnd(today).getUTCDate();
    if (!isLastDay) {
      console.log(`${new Date().toISOString().slice(0, 19)} not the last day of the month - nothing captured`);
      await prisma.$disconnect();
      return;
    }
  }

  const result = await captureMonth(period, { overwrite: process.env.OVERWRITE === "1" });
  const label = result.periodEnd.toISOString().slice(0, 10);
  console.log(result.written
    ? `${new Date().toISOString().slice(0, 19)} captured ${label}: ${result.written} branch row(s)`
    : `${new Date().toISOString().slice(0, 19)} ${label} already captured (${result.skipped} row(s)) - left alone`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("capture failed:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
