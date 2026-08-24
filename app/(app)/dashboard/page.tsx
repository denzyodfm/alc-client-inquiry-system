import { Activity, Building2, Users } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { DashboardClientLogs } from "@/components/dashboard-client-logs";
import { ClientLogLiveSearch } from "@/components/client-log-live-search";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";
import { getClientLogBranchIds, requireFunction } from "@/lib/auth";
import { branchIdentityScope, branchRecordScope } from "@/lib/branch-scope";

export const dynamic = "force-dynamic";

// Client log period presets. Everything except "custom" is a rolling window ending today,
// so the range never depends on which day of the week or month it is read.
const PERIOD_OPTIONS = [
  { value: "all", label: "All time", days: null },
  { value: "today", label: "Today", days: 1 },
  { value: "yesterday", label: "Yesterday", days: null },
  { value: "week", label: "Last week (7 days)", days: 7 },
  { value: "month", label: "Last month (30 days)", days: 30 },
  { value: "quarter", label: "Last quarter (90 days)", days: 90 },
  { value: "year", label: "Last year (365 days)", days: 365 },
  { value: "custom", label: "Custom range", days: null }
] as const;

function periodRange(period: string, customFrom?: string, customTo?: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  if (period === "custom") {
    return {
      from: customFrom ? new Date(`${customFrom}T00:00:00`) : undefined,
      to: customTo ? new Date(`${customTo}T23:59:59.999`) : undefined
    };
  }
  if (period === "yesterday") {
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - 1);
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  const option = PERIOD_OPTIONS.find((item) => item.value === period);
  if (!option?.days) return { from: undefined, to: undefined };
  const from = new Date(startOfToday);
  from.setDate(from.getDate() - (option.days - 1));
  return { from, to: endOfToday };
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ tab?: string; client?: string; from?: string; to?: string; officer?: string; period?: string }> }) {
  const currentUser = await requireFunction("DASHBOARD");
  const params = await searchParams; const activeTab = params?.tab === "overview" ? "overview" : "client-logs"; const client = params?.client?.trim() ?? ""; const officer = params?.officer?.trim() ?? "ALL";
  const period = PERIOD_OPTIONS.some((option) => option.value === params?.period) ? params!.period! : (params?.from || params?.to ? "custom" : "all");
  const { from, to } = periodRange(period, params?.from, params?.to);
  const clientLogBranchIds = await getClientLogBranchIds(currentUser);
  const branchScope = branchIdentityScope(clientLogBranchIds);
  const recordScope = branchRecordScope(clientLogBranchIds);
  const clientLogScope = { ...(clientLogBranchIds === null ? {} : clientLogBranchIds.length ? { branchId: { in: clientLogBranchIds } } : { branchId: -1 }), ...(currentUser.role === "ACCOUNT_OFFICER" ? { encodedById: currentUser.id } : {}) };
  const [branchCount, activeBranchCount, clientCount, activeLoanCount, clientLogs, officers] = await Promise.all([
    prisma.branch.count({ where: branchScope }),
    prisma.branch.count({ where: { ...branchScope, status: "ACTIVE" } }),
    prisma.client.count({ where: recordScope }),
    prisma.loan.count({ where: { ...recordScope, AND: [{ balance: { gt: 0 } }, inactiveStatus12Where()] } }),
    prisma.clientLog.findMany({ take: 500, where: { ...clientLogScope, ...(client ? { OR: [{ client: { fullName: { contains: client } } }, { client: { clientId: { contains: client } } }, { branch: { branchName: { contains: client } } }, { branch: { branchCode: { contains: client } } }, { logType: { contains: client } }, { subject: { contains: client } }, { notes: { contains: client } }] } : {}), ...(officer !== "ALL" && currentUser.role !== "ACCOUNT_OFFICER" ? { encodedById: Number(officer) } : {}), ...(from || to ? { visitAt: { gte: from, lte: to } } : {}) }, orderBy: { visitAt: "desc" }, include: { client: { include: { branch: true } }, encodedBy: true } }),
    prisma.user.findMany({ where: currentUser.role === "ACCOUNT_OFFICER" ? { id: currentUser.id } : { clientLogs: { some: clientLogBranchIds === null ? {} : { branchId: { in: clientLogBranchIds } } } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
  ]);

  return (
    <div className="space-y-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Dashboard</p><h2 className="text-2xl font-bold text-slate-950">Operations and Client Activity</h2></div>
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5" aria-label="Dashboard sections">
        <Link href="/dashboard?tab=overview" className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition ${activeTab === "overview" ? "bg-brand-blue text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>Operations Overview</Link>
        <Link href="/dashboard?tab=client-logs" className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition ${activeTab === "client-logs" ? "bg-brand-blue text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>Client Logs</Link>
      </nav>

      {activeTab === "overview" ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Branches" value={branchCount} detail={`${activeBranchCount} active for sync`} icon={Building2} />
        <StatCard label="Client records" value={clientCount} detail="Central database total" icon={Users} tone="green" />
        <StatCard label="Open balances" value={activeLoanCount} detail="Loans with balance greater than zero" icon={Activity} tone="red" />
        <StatCard label="Client logs" value={clientLogs.length} detail="Matching recent client activities" icon={Users} tone="gray" />
      </section> : null}

      {activeTab === "client-logs" ? <section className="space-y-2"><form className="panel grid gap-2 p-2 md:grid-cols-[1fr_auto_auto_auto_auto_auto]"><input type="hidden" name="tab" value="client-logs" /><ClientLogLiveSearch defaultValue={client} suggestions={Array.from(new Set(clientLogs.flatMap((log) => [log.client.fullName, log.client.clientId, log.client.branch.branchName, log.client.branch.branchCode, log.logType.replace(/_/g, " "), log.subject, log.notes.length <= 100 ? log.notes : null]).filter((value): value is string => Boolean(value)))).sort()} /><select className="field" name="period" defaultValue={period} aria-label="Client log period">{PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input className="field" type="date" name="from" defaultValue={params?.from} aria-label="Custom range start" /><input className="field" type="date" name="to" defaultValue={params?.to} aria-label="Custom range end" /><select className="field" name="officer" defaultValue={officer}><option value="ALL">All Account Officers</option>{officers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="btn-primary">Search</button></form><DashboardClientLogs periodLabel={`${PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "All time"}${period === "custom" ? `${params?.from ? ` from ${params.from}` : ""}${params?.to ? ` to ${params.to}` : ""}` : ""}`} initialSearch={client} canDelete={currentUser.role === "ADMIN"} rows={clientLogs.map((log) => ({ id: log.id, clientId: log.clientId, accountOfficerId: log.encodedById, client: log.client.fullName, clientNumber: log.client.clientId, branch: log.client.branch.branchName, accountOfficer: log.encodedBy.name, type: log.logType, subject: log.subject, notes: log.notes, newDate: log.newDate ? log.newDate.toISOString().slice(0, 10) : null, newAmount: log.newAmount ? String(log.newAmount) : null, visitAt: log.visitAt.toISOString() }))} /></section> : null}
    </div>
  );
}
