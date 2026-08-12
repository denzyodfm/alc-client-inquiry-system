import { dateTime } from "@/lib/format";

type SyncLogRow = {
  id: number; status: string; startedAt: Date; finishedAt: Date | null; clientsPulled: number; loansPulled: number; paymentsPulled: number;
  branchesCompleted: number; branchesFailed: number; message: string | null; branch: { branchName: string } | null;
};

export function SyncLogsTable({ logs }: { logs: SyncLogRow[] }) {
  return <div className="panel overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Started</th><th className="px-4 py-3">Finished</th><th className="px-4 py-3">Branches</th><th className="px-4 py-3">Clients</th><th className="px-4 py-3">Loans</th><th className="px-4 py-3">Payments</th><th className="px-4 py-3">Message</th></tr></thead>
    <tbody>{logs.map((log) => <tr key={log.id} className="border-t border-slate-100 align-top"><td className="px-4 py-3 font-semibold text-slate-900">{log.branch?.branchName ?? "System"}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-bold ${log.status === "SUCCESS" ? "bg-emerald-50 text-brand-green" : "bg-red-50 text-red-700"}`}>{log.status}</span></td><td className="px-4 py-3">{dateTime(log.startedAt)}</td><td className="px-4 py-3">{dateTime(log.finishedAt)}</td><td className="px-4 py-3">{log.branchesCompleted || log.branchesFailed ? `${log.branchesCompleted.toLocaleString()} completed, ${log.branchesFailed.toLocaleString()} failed` : "-"}</td><td className="px-4 py-3">{log.clientsPulled.toLocaleString()}</td><td className="px-4 py-3">{log.loansPulled.toLocaleString()}</td><td className="px-4 py-3">{log.paymentsPulled.toLocaleString()}</td><td className="max-w-sm px-4 py-3 text-slate-600">{log.message ?? "-"}</td></tr>)}{!logs.length ? <tr><td className="px-4 py-6 text-slate-500" colSpan={9}>No sync logs available.</td></tr> : null}</tbody>
  </table></div></div>;
}
