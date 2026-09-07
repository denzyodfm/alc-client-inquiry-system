// Fills the portfolio trend with month ends worked back from payment history.
//
//   MONTHS=18 npx tsx scripts/backfill-trend.ts     # the last 18 completed months
//   FROM=2025-01-31 npx tsx scripts/backfill-trend.ts
//
// Safe to re-run: each month is recomputed and overwritten, because unlike the month-end
// snapshots these are estimates rather than the record.
import { storeTrendFor } from "@/lib/portfolio-trend";
import { prisma } from "@/lib/prisma";

function monthEndsBack(count: number) {
  const ends: string[] = [];
  const now = new Date();
  // Start at the end of last month: the month in progress has no close to speak of.
  for (let index = 1; index <= count; index++) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index + 1, 0));
    ends.push(end.toISOString().slice(0, 10));
  }
  return ends.reverse();
}

async function main() {
  const count = Number(process.env.MONTHS ?? 18);
  const from = process.env.FROM;
  const ends = monthEndsBack(count).filter((end) => !from || end >= from);
  console.log(`Reconstructing ${ends.length} month end(s): ${ends[0]} to ${ends[ends.length - 1]}`);
  for (const end of ends) {
    const started = Date.now();
    const written = await storeTrendFor(end);
    console.log(`  ${end}: ${written} branch row(s) in ${Math.round((Date.now() - started) / 1000)}s`);
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("backfill failed:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
