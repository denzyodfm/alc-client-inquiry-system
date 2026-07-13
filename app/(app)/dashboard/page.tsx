import { Activity, Building2, History, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DashboardBranchStatus, type DashboardBranchAnalysis } from "@/components/dashboard-branch-status";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";
import { dateTime } from "@/lib/format";
import { checkBranchConnection } from "@/scripts/sync-service";

export const dynamic = "force-dynamic";

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function paidTotal(schedule: { paidPrincipal: unknown; paidInterest: unknown }) {
  return numberValue(schedule.paidPrincipal) + numberValue(schedule.paidInterest);
}

function isSchedulePaid(schedule: { paidPrincipal: unknown; paidInterest: unknown; totalAmort: unknown; paidStatus: number | null }) {
  const paid = paidTotal(schedule);
  const due = numberValue(schedule.totalAmort);
  return (paid > 0 && paid >= due) || Boolean(schedule.paidStatus);
}

async function getBranchAnalysis(branch: { id: number; branchName: string; branchCode: string; status: string; lastSyncAt: Date | null }) {
  const today = new Date();
  const recentDate = new Date(today);
  recentDate.setDate(recentDate.getDate() - 30);

  const [loans, schedules, paymentSummary, latestPayment] = await Promise.all([
    prisma.loan.findMany({
      where: { AND: [{ branchId: branch.id }, inactiveStatus12Where()] },
      select: {
        principalAmount: true,
        interestAmount: true,
        penaltyAmount: true,
        paidAmount: true,
        balance: true,
        sourceStatusCode: true,
        releasedAt: true
      }
    }),
    prisma.amortizationSchedule.findMany({
      where: { branchId: branch.id, loan: inactiveStatus12Where() },
      select: {
        amortDate: true,
        totalAmort: true,
        paidPrincipal: true,
        paidInterest: true,
        paidStatus: true
      }
    }),
    prisma.payment.aggregate({
      where: { branchId: branch.id, paidAt: { gte: recentDate } },
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.payment.findFirst({
      where: { branchId: branch.id },
      orderBy: [{ paidAt: "desc" }, { updatedAt: "desc" }],
      select: { paidAt: true }
    })
  ]);

  const totalDue = loans.reduce(
    (sum, loan) => sum + numberValue(loan.principalAmount) + numberValue(loan.interestAmount) + numberValue(loan.penaltyAmount),
    0
  );
  const totalPaid = loans.reduce((sum, loan) => sum + numberValue(loan.paidAmount), 0);
  const totalBalance = loans.reduce((sum, loan) => sum + (loan.sourceStatusCode === 10 ? 0 : Math.max(0, numberValue(loan.balance))), 0);
  const closedLoans = loans.filter((loan) => loan.sourceStatusCode === 10 || numberValue(loan.balance) <= 0).length;
  const openLoans = loans.length - closedLoans;
  const newLoans = loans.filter((loan) => loan.releasedAt && loan.releasedAt >= recentDate);
  const dueSchedules = schedules.filter((schedule) => schedule.amortDate && schedule.amortDate <= today);
  const paidRows = schedules.filter(isSchedulePaid);
  const partialRows = schedules.filter((schedule) => {
    const paid = paidTotal(schedule);
    const due = numberValue(schedule.totalAmort);
    return paid > 0 && paid < due;
  });
  const overdueRows = dueSchedules.filter((schedule) => !isSchedulePaid(schedule));
  const latestLoanAt = loans
    .map((loan) => loan.releasedAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    totalLoans: loans.length,
    openLoans,
    closedLoans,
    totalDue,
    totalPaid,
    totalBalance,
    collectionRate: totalDue ? (totalPaid / totalDue) * 100 : 0,
    overdueRows: overdueRows.length,
    partialRows: partialRows.length,
    paidRows: paidRows.length,
    scheduleRows: schedules.length,
    newLoans30Days: newLoans.length,
    newLoans30Amount: newLoans.reduce((sum, loan) => sum + numberValue(loan.principalAmount), 0),
    payments30Days: paymentSummary._count._all,
    payments30Amount: numberValue(paymentSummary._sum.amount),
    latestLoanAt: latestLoanAt?.toISOString() ?? null,
    latestPaymentAt: latestPayment?.paidAt?.toISOString() ?? null
  };
}

export default async function DashboardPage() {
  const [branchCount, activeBranchCount, clientCount, activeLoanCount, logs, branches] = await Promise.all([
    prisma.branch.count(),
    prisma.branch.count({ where: { status: "ACTIVE" } }),
    prisma.client.count(),
    prisma.loan.count({ where: { AND: [{ balance: { gt: 0 } }, inactiveStatus12Where()] } }),
    prisma.syncLog.findMany({ take: 6, orderBy: { startedAt: "desc" }, include: { branch: true } }),
    prisma.branch.findMany({ take: 6, orderBy: { branchName: "asc" } })
  ]);
  const branchesWithConnection = await Promise.all(
    branches.map(async (branch) => {
      const [connection, analysis] = await Promise.all([
        checkBranchConnection(branch),
        getBranchAnalysis(branch)
      ]);

      return {
        branchId: branch.id,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        status: branch.status,
        connectionStatus: connection.status,
        connectionMessage: connection.message,
        lastSyncAt: branch.lastSyncAt?.toISOString() ?? null,
        ...analysis
      } satisfies DashboardBranchAnalysis;
    })
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
          <DashboardBranchStatus branches={branchesWithConnection} />
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
