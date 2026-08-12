import { requireFunction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SyncLogsTable } from "@/components/sync-logs-table";

export const dynamic = "force-dynamic";

export default async function SyncLogsPage() {
  await requireFunction("SYNC_LOGS");
  const logs = await prisma.syncLog.findMany({
    take: 100,
    orderBy: { startedAt: "desc" },
    include: { branch: true }
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Audit trail</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Sync Logs</h2>
      </div>
      <SyncLogsTable logs={logs} />
    </div>
  );
}
