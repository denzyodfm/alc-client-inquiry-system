"use client";

import { BarChart3, Building2, CheckCircle2, Clock, CreditCard, FileText, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { dateTime, money } from "@/lib/format";

export type DashboardBranchAnalysis = {
  branchId: number;
  branchName: string;
  branchCode: string;
  status: string;
  connectionStatus: "ONLINE" | "OFFLINE";
  connectionMessage: string;
  lastSyncAt: string | null;
  totalLoans: number;
  openLoans: number;
  closedLoans: number;
  totalDue: number;
  totalPaid: number;
  totalBalance: number;
  collectionRate: number;
  overdueRows: number;
  partialRows: number;
  paidRows: number;
  scheduleRows: number;
  newLoans30Days: number;
  newLoans30Amount: number;
  payments30Days: number;
  payments30Amount: number;
  latestLoanAt: string | null;
  latestPaymentAt: string | null;
};

type DashboardBranchStatusProps = {
  branches: DashboardBranchAnalysis[];
};

function percent(value: number) {
  return `${Math.min(100, Math.max(0, value)).toFixed(1)}%`;
}

function classifyBranch(branch: DashboardBranchAnalysis) {
  if (!branch.totalLoans) return "No loan portfolio";
  if (branch.overdueRows === 0 && branch.collectionRate >= 90) return "Strong branch performance";
  if (branch.overdueRows <= 10 && branch.collectionRate >= 70) return "Generally collecting";
  if (branch.collectionRate >= 40) return "Needs collection monitoring";
  return "High collection priority";
}

export function DashboardBranchStatus({ branches }: DashboardBranchStatusProps) {
  const [selectedBranch, setSelectedBranch] = useState<DashboardBranchAnalysis | null>(null);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {branches.map((branch) => (
          <div key={branch.branchId} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{branch.branchName}</p>
                <p className="text-sm text-slate-500">{branch.branchCode}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{branch.status}</span>
                <span
                  className={`rounded-md px-2 py-1 text-xs font-bold ${
                    branch.connectionStatus === "ONLINE" ? "bg-emerald-50 text-brand-green" : "bg-red-50 text-red-700"
                  }`}
                  title={branch.connectionMessage}
                >
                  {branch.connectionStatus}
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">Last sync: {dateTime(branch.lastSyncAt)}</p>
            <button type="button" className="btn-secondary mt-3 h-8 px-3 text-xs" onClick={() => setSelectedBranch(branch)}>
              <BarChart3 className="h-3.5 w-3.5" />
              Analyze
            </button>
          </div>
        ))}
      </div>

      {selectedBranch ? <BranchAnalysisModal branch={selectedBranch} onClose={() => setSelectedBranch(null)} /> : null}
    </>
  );
}

function BranchAnalysisModal({ branch, onClose }: { branch: DashboardBranchAnalysis; onClose: () => void }) {
  const behavior = classifyBranch(branch);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Branch loan performance</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">{branch.branchName}</h3>
            <p className="mt-1 text-sm text-slate-500">
              Branch {branch.branchCode} · {branch.connectionStatus} · Last sync {dateTime(branch.lastSyncAt)}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Close
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric icon={TrendingUp} label="Performance" value={behavior} />
            <Metric icon={FileText} label="Loans" value={`${branch.openLoans} open / ${branch.closedLoans} closed`} detail={`${branch.totalLoans} total`} />
            <Metric icon={CheckCircle2} label="Collection Rate" value={percent(branch.collectionRate)} detail={`${money(branch.totalPaid)} collected`} tone="green" />
            <Metric icon={Clock} label="Open Balance" value={money(branch.totalBalance)} detail={`${branch.overdueRows} overdue row(s)`} tone={branch.totalBalance > 0 ? "red" : "green"} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <section className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 inline-flex rounded-md bg-blue-50 p-2 text-brand-blue">
                <Building2 className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-slate-950">Loan Portfolio</h4>
              <dl className="mt-4 grid gap-3 text-sm">
                <Info label="Total amount due" value={money(branch.totalDue)} />
                <Info label="Total payments" value={money(branch.totalPaid)} />
                <Info label="Remaining balance" value={money(branch.totalBalance)} />
                <Info label="Paid schedule rows" value={`${branch.paidRows} of ${branch.scheduleRows}`} />
                <Info label="Partial rows" value={String(branch.partialRows)} />
                <Info label="Overdue rows" value={String(branch.overdueRows)} />
              </dl>
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 inline-flex rounded-md bg-emerald-50 p-2 text-brand-green">
                <FileText className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-slate-950">New Loan Transactions</h4>
              <dl className="mt-4 grid gap-3 text-sm">
                <Info label="New loans, last 30 days" value={branch.newLoans30Days.toLocaleString("en-US")} />
                <Info label="New principal amount" value={money(branch.newLoans30Amount)} />
                <Info label="Latest new loan date" value={dateTime(branch.latestLoanAt)} />
              </dl>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                This indicates recent loan release activity for the branch based on synced loan release dates.
              </p>
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 inline-flex rounded-md bg-emerald-50 p-2 text-brand-green">
                <CreditCard className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-slate-950">Payment Transactions</h4>
              <dl className="mt-4 grid gap-3 text-sm">
                <Info label="Payments, last 30 days" value={branch.payments30Days.toLocaleString("en-US")} />
                <Info label="Payment amount" value={money(branch.payments30Amount)} />
                <Info label="Latest payment date" value={dateTime(branch.latestPaymentAt)} />
              </dl>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                This reflects actual synced payment-history rows and helps compare collection activity against new loans.
              </p>
            </section>
          </div>

          <section className="mt-6 rounded-lg border border-slate-200 p-4">
            <h4 className="font-bold text-slate-950">Analysis</h4>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {branch.branchName} is classified as <strong>{behavior}</strong>. The branch has collected {percent(branch.collectionRate)} of its synced due amount, with {branch.openLoans} open loan(s), {branch.closedLoans} closed loan(s), and {branch.overdueRows} due amortization row(s) that are not fully paid.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              During the last 30 days, the branch recorded {branch.newLoans30Days} new loan transaction(s) totaling {money(branch.newLoans30Amount)} in principal and {branch.payments30Days} payment transaction(s) totaling {money(branch.payments30Amount)}.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "blue"
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  detail?: string;
  tone?: "blue" | "green" | "red";
}) {
  const toneClass = tone === "green" ? "text-brand-green" : tone === "red" ? "text-red-700" : "text-brand-blue";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className={`mb-3 inline-flex rounded-md bg-slate-50 p-2 ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 font-bold text-slate-950">{value}</dd>
    </div>
  );
}
