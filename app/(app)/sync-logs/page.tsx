import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function wholeNumber(value: number) {
  return value.toLocaleString("en-US");
}

export default async function SyncLogsPage() {
  await requireUser(["ADMIN", "AUDITOR"]);
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
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Finished</th>
                <th className="px-4 py-3">Branches</th>
                <th className="px-4 py-3">Clients</th>
                <th className="px-4 py-3">Loans</th>
                <th className="px-4 py-3">Payments</th>
                <th className="px-4 py-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-semibold text-slate-900">{log.branch?.branchName ?? "System"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${log.status === "SUCCESS" ? "bg-emerald-50 text-brand-green" : "bg-red-50 text-red-700"}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{dateTime(log.startedAt)}</td>
                  <td className="px-4 py-3">{dateTime(log.finishedAt)}</td>
                  <td className="px-4 py-3">
                    {log.branchesCompleted || log.branchesFailed
                      ? `${wholeNumber(log.branchesCompleted)} completed, ${wholeNumber(log.branchesFailed)} failed`
                      : "-"}
                  </td>
                  <td className="px-4 py-3">{wholeNumber(log.clientsPulled)}</td>
                  <td className="px-4 py-3">{wholeNumber(log.loansPulled)}</td>
                  <td className="px-4 py-3">{wholeNumber(log.paymentsPulled)}</td>
                  <td className="max-w-sm px-4 py-3 text-slate-600">{log.message ?? "-"}</td>
                </tr>
              ))}
              {!logs.length ? (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={9}>No sync logs available.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
