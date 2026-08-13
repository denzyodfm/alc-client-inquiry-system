import { Activity, Building2, Users } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { DashboardClientLogs } from "@/components/dashboard-client-logs";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";
import { requireFunction } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ tab?: string; client?: string; from?: string; to?: string; officer?: string }> }) {
  const currentUser = await requireFunction("DASHBOARD");
  const params = await searchParams; const activeTab = params?.tab === "overview" ? "overview" : "client-logs"; const client = params?.client?.trim() ?? ""; const officer = params?.officer?.trim() ?? "ALL"; const from = params?.from ? new Date(`${params.from}T00:00:00`) : undefined; const to = params?.to ? new Date(`${params.to}T23:59:59.999`) : undefined;
  const [branchCount, activeBranchCount, clientCount, activeLoanCount, clientLogs, officers] = await Promise.all([
    prisma.branch.count(),
    prisma.branch.count({ where: { status: "ACTIVE" } }),
    prisma.client.count(),
    prisma.loan.count({ where: { AND: [{ balance: { gt: 0 } }, inactiveStatus12Where()] } }),
    prisma.clientLog.findMany({ take: 500, where: { ...(client ? { OR: [{ client: { fullName: { contains: client } } }, { client: { clientId: { contains: client } } }, { branch: { branchName: { contains: client } } }, { branch: { branchCode: { contains: client } } }, { logType: { contains: client } }, { subject: { contains: client } }, { notes: { contains: client } }] } : {}), ...(officer !== "ALL" ? { encodedById: Number(officer) } : {}), ...(from || to ? { visitAt: { gte: from, lte: to } } : {}) }, orderBy: { visitAt: "desc" }, include: { client: { include: { branch: true } }, encodedBy: true } }),
    prisma.user.findMany({ where: { clientLogs: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
  ]);

  return (
    <div className="space-y-6">
      <div><p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Dashboard</p><h2 className="mt-2 text-3xl font-bold text-slate-950">Operations and Client Activity</h2></div>
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1" aria-label="Dashboard sections">
        <Link href="/dashboard?tab=overview" className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition ${activeTab === "overview" ? "bg-brand-blue text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>Operations Overview</Link>
        <Link href="/dashboard?tab=client-logs" className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition ${activeTab === "client-logs" ? "bg-brand-blue text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>Client Logs</Link>
      </nav>

      {activeTab === "overview" ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Branches" value={branchCount} detail={`${activeBranchCount} active for sync`} icon={Building2} />
        <StatCard label="Client records" value={clientCount} detail="Central database total" icon={Users} tone="green" />
        <StatCard label="Open balances" value={activeLoanCount} detail="Loans with balance greater than zero" icon={Activity} tone="red" />
        <StatCard label="Client logs" value={clientLogs.length} detail="Matching recent client activities" icon={Users} tone="gray" />
      </section> : null}

      {activeTab === "client-logs" ? <section className="space-y-3"><h3 className="text-lg font-bold">Client Logs</h3><form className="panel grid gap-2 p-3 md:grid-cols-[1fr_auto_auto_auto_auto]"><input type="hidden" name="tab" value="client-logs" /><input className="field" name="client" defaultValue={client} placeholder="Client, number, branch, or activity" list="client-log-search-suggestions" autoComplete="off" /><datalist id="client-log-search-suggestions">{Array.from(new Set(clientLogs.flatMap((log) => [log.client.fullName, log.client.clientId, log.client.branch.branchName, log.client.branch.branchCode, log.logType.replace(/_/g, " "), log.subject, log.notes.length <= 100 ? log.notes : null]).filter((value): value is string => Boolean(value)))).sort().map((value) => <option key={value} value={value} />)}</datalist><input className="field" type="date" name="from" defaultValue={params?.from} /><input className="field" type="date" name="to" defaultValue={params?.to} /><select className="field" name="officer" defaultValue={officer}><option value="ALL">All Account Officers</option>{officers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="btn-primary">Search</button></form><DashboardClientLogs canDelete={currentUser.role === "ADMIN"} rows={clientLogs.map((log) => ({ id: log.id, client: log.client.fullName, clientNumber: log.client.clientId, branch: log.client.branch.branchName, accountOfficer: log.encodedBy.name, type: log.logType, subject: log.subject, notes: log.notes, visitAt: log.visitAt.toISOString() }))} /></section> : null}
    </div>
  );
}
