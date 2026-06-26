import { Activity, Building2, History, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { prisma } from "@/lib/prisma";
import { dateTime } from "@/lib/format";
import { checkBranchConnection } from "@/scripts/sync-service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [branchCount, activeBranchCount, clientCount, activeLoanCount, logs, branches] = await Promise.all([
    prisma.branch.count(),
    prisma.branch.count({ where: { status: "ACTIVE" } }),
    prisma.client.count(),
    prisma.loan.count({ where: { balance: { gt: 0 } } }),
    prisma.syncLog.findMany({ take: 6, orderBy: { startedAt: "desc" }, include: { branch: true } }),
    prisma.branch.findMany({ take: 6, orderBy: { branchName: "asc" } })
  ]);
  const branchesWithConnection = await Promise.all(
    branches.map(async (branch) => ({
      ...branch,
      connection: await checkBranchConnection(branch)
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Operations overview</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Dashboard</h2>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Branches" value={branchCount} detail={`${activeBranchCount} active for sync`} icon={Building2} />
        <StatCard label="Client records" value={clientCount} detail="Central database total" icon={Users} tone="green" />
        <StatCard label="Open balances" value={activeLoanCount} detail="Loans with balance greater than zero" icon={Activity} tone="red" />
        <StatCard label="Recent syncs" value={logs.length} detail="Latest branch sync log entries" icon={History} tone="gray" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-950">Branch Sync Status</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {branchesWithConnection.map((branch) => (
              <div key={branch.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{branch.branchName}</p>
                    <p className="text-sm text-slate-500">{branch.branchCode}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{branch.status}</span>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-bold ${
                        branch.connection.status === "ONLINE" ? "bg-emerald-50 text-brand-green" : "bg-red-50 text-red-700"
                      }`}
                      title={branch.connection.message}
                    >
                      {branch.connection.status}
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-500">Last sync: {dateTime(branch.lastSyncAt)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="mb-4 text-lg font-bold text-slate-950">Latest Sync Logs</h3>
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{log.branch?.branchName ?? "System"}</p>
                  <p className="text-sm text-slate-500">{dateTime(log.startedAt)}</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-bold ${log.status === "SUCCESS" ? "bg-emerald-50 text-brand-green" : "bg-red-50 text-red-700"}`}>
                  {log.status}
                </span>
              </div>
            ))}
            {!logs.length ? <p className="text-sm text-slate-500">No sync activity yet.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
