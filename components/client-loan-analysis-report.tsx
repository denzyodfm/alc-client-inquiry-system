"use client";

import { AlertTriangle, BarChart3, CheckCircle2, Clock, FileText, ShieldCheck, X } from "lucide-react";
import { dateOnly, money } from "@/lib/format";
import type { LoanDetailLoan, LoanDetailSchedule } from "@/components/loan-detail-window";
import { LoanDetailLink } from "@/components/loan-detail-link";

type ClientLoanAnalysisReportProps = {
  clientName: string;
  customerNo?: string | null;
  loans: LoanDetailLoan[];
  onClose: () => void;
};

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function paidTotal(schedule: LoanDetailSchedule) {
  return numberValue(schedule.paidPrincipal) + numberValue(schedule.paidInterest);
}

function scheduleDue(schedule: LoanDetailSchedule) {
  return numberValue(schedule.totalAmort);
}

function isSchedulePaid(schedule: LoanDetailSchedule) {
  const paid = paidTotal(schedule);
  const due = scheduleDue(schedule);
  return (paid > 0 && paid >= due) || Boolean(schedule.paidStatus);
}

function scheduleRemaining(schedule: LoanDetailSchedule) {
  return Math.max(0, scheduleDue(schedule) - paidTotal(schedule));
}

function loanPaidTotal(loan: LoanDetailLoan) {
  const schedulePaid = loan.amortizationSchedules.reduce((sum, schedule) => sum + paidTotal(schedule), 0);
  return schedulePaid || numberValue(loan.paidAmount);
}

function loanDueTotal(loan: LoanDetailLoan) {
  const scheduleDueTotal = loan.amortizationSchedules.reduce((sum, schedule) => sum + scheduleDue(schedule), 0);
  return scheduleDueTotal || numberValue(loan.principalAmount) + numberValue(loan.interestAmount) + numberValue(loan.penaltyAmount);
}

function loanBalance(loan: LoanDetailLoan) {
  if (loan.sourceStatusCode === 10) return 0;
  const scheduleBalance = Math.max(0, loanDueTotal(loan) - loanPaidTotal(loan));
  return loan.amortizationSchedules.length ? scheduleBalance : Math.max(0, numberValue(loan.balance));
}

function dueTime(value: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function percent(part: number, whole: number) {
  if (!whole) return "0%";
  return `${Math.min(100, Math.max(0, (part / whole) * 100)).toFixed(1)}%`;
}

function sourceStatusIndicatesPastDue(loan: LoanDetailLoan) {
  const statusText = `${loan.sourceStatusName ?? ""} ${loan.status ?? ""}`;
  return /past\s*due|overdue|delinquent|arrears/i.test(statusText);
}

function dueRowsForLoan(loan: LoanDetailLoan, today: Date) {
  return loan.amortizationSchedules.filter((schedule) => schedule.amortDate && new Date(schedule.amortDate) <= today);
}

function overdueRowsForLoan(loan: LoanDetailLoan, today: Date) {
  return dueRowsForLoan(loan, today).filter((schedule) => !isSchedulePaid(schedule));
}

function loanIsPastDue(loan: LoanDetailLoan, today: Date) {
  const balance = loanBalance(loan);
  const maturityPastDue = Boolean(loan.maturityAt && new Date(loan.maturityAt) < today && balance > 0);
  return overdueRowsForLoan(loan, today).length > 0 || maturityPastDue || sourceStatusIndicatesPastDue(loan);
}

function classifyClient({
  openLoans,
  overdueRows,
  paidRatio
}: {
  openLoans: number;
  overdueRows: number;
  paidRatio: number;
}) {
  if (!openLoans && paidRatio >= 0.98) return "Closed / paid history";
  if (overdueRows === 0 && paidRatio >= 0.9) return "Strong repayment behavior";
  if (overdueRows <= 2 && paidRatio >= 0.65) return "Generally paying";
  if (paidRatio >= 0.35) return "Irregular payment behavior";
  return "High follow-up priority";
}

function recommendationForClient({
  hasPastDue,
  openLoans,
  totalBalance,
  paidRatio,
  overdueRows
}: {
  hasPastDue: boolean;
  openLoans: number;
  totalBalance: number;
  paidRatio: number;
  overdueRows: number;
}) {
  if (hasPastDue || overdueRows >= 2) {
    return {
      label: "Recommend Disapprove / Hold",
      tone: "red" as const,
      message:
        "Past-due loan behavior is present. Hold approval until arrears are cured, the branch confirms account status, and repayment capacity is revalidated."
    };
  }

  if (openLoans > 0 || totalBalance > 0 || paidRatio < 0.9) {
    return {
      label: "Conditional Approval Only",
      tone: "blue" as const,
      message:
        "Consider only after checking debt burden, active loan exposure, latest payments, cash flow, collateral coverage, and loan purpose."
    };
  }

  return {
    label: "Recommend Approve",
    tone: "green" as const,
    message:
      "The synced history shows acceptable repayment behavior, no current past-due signal, and no material active balance in this record set."
  };
}

export function ClientLoanAnalysisReport({ clientName, customerNo, loans, onClose }: ClientLoanAnalysisReportProps) {
  const today = new Date();
  const sortedLoans = [...loans].sort((a, b) => dueTime(b.releasedAt) - dueTime(a.releasedAt));
  const totalDue = sortedLoans.reduce((sum, loan) => sum + loanDueTotal(loan), 0);
  const totalPaid = sortedLoans.reduce((sum, loan) => sum + loanPaidTotal(loan), 0);
  const totalBalance = sortedLoans.reduce((sum, loan) => sum + loanBalance(loan), 0);
  const closedLoans = sortedLoans.filter((loan) => loan.sourceStatusCode === 10 || loanBalance(loan) <= 0).length;
  const openLoans = sortedLoans.length - closedLoans;
  const allSchedules = sortedLoans.flatMap((loan) => loan.amortizationSchedules);
  const dueSchedules = allSchedules.filter((schedule) => schedule.amortDate && new Date(schedule.amortDate) <= today);
  const overdueRows = dueSchedules.filter((schedule) => !isSchedulePaid(schedule));
  const pastDueLoans = sortedLoans.filter((loan) => loanIsPastDue(loan, today));
  const pastDueAmount = sortedLoans.reduce(
    (sum, loan) => sum + overdueRowsForLoan(loan, today).reduce((loanSum, schedule) => loanSum + scheduleRemaining(schedule), 0),
    0
  );
  const paidRows = allSchedules.filter(isSchedulePaid);
  const partialRows = allSchedules.filter((schedule) => {
    const paid = paidTotal(schedule);
    const due = scheduleDue(schedule);
    return paid > 0 && paid < due;
  });
  const latestLoan = sortedLoans[0];
  const oldestLoan = sortedLoans[sortedLoans.length - 1];
  const behavior = classifyClient({
    openLoans,
    overdueRows: overdueRows.length,
    paidRatio: totalDue ? totalPaid / totalDue : 0
  });
  const paidRatio = totalDue ? totalPaid / totalDue : 0;
  const latestPaymentRow = [...allSchedules]
    .filter((schedule) => paidTotal(schedule) > 0)
    .sort((a, b) => dueTime(b.amortDate) - dueTime(a.amortDate))[0];
  const hasPastDue = pastDueLoans.length > 0;
  const decision = recommendationForClient({
    hasPastDue,
    openLoans,
    totalBalance,
    paidRatio,
    overdueRows: overdueRows.length
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Client loan analysis</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">{clientName}</h3>
            <p className="mt-1 text-sm text-slate-500">Customer No. {customerNo || "-"} · {sortedLoans.length} loan(s) analyzed</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Close
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto p-6">
          <div className="grid gap-3 md:grid-cols-5">
            <Metric icon={BarChart3} label="Overall Behavior" value={behavior} />
            <Metric icon={FileText} label="Loans" value={`${openLoans} open / ${closedLoans} closed`} detail={`${sortedLoans.length} total`} />
            <Metric icon={CheckCircle2} label="Payment Progress" value={percent(totalPaid, totalDue)} detail={`${money(totalPaid)} paid`} tone="green" />
            <Metric icon={AlertTriangle} label="Past Due" value={hasPastDue ? "Yes" : "No"} detail={`${pastDueLoans.length} loan(s), ${money(pastDueAmount)}`} tone={hasPastDue ? "red" : "green"} />
            <Metric icon={Clock} label="Open Balance" value={money(totalBalance)} detail={`${overdueRows.length} overdue row(s)`} tone={totalBalance > 0 ? "red" : "green"} />
          </div>

          <section className="mt-6 rounded-lg border border-slate-200 p-4">
            <h4 className="font-bold text-slate-950">Summary</h4>
            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
              <Info label="Total amount due" value={money(totalDue)} />
              <Info label="Total payments" value={money(totalPaid)} />
              <Info label="Remaining balance" value={money(totalBalance)} />
              <Info label="Paid schedule rows" value={`${paidRows.length} of ${allSchedules.length}`} />
              <Info label="Partial rows" value={String(partialRows.length)} />
              <Info label="Overdue rows" value={String(overdueRows.length)} />
              <Info label="Past-due loans" value={`${pastDueLoans.length} of ${sortedLoans.length}`} />
              <Info label="Past-due amount" value={money(pastDueAmount)} />
              <Info label="Latest payment row" value={latestPaymentRow ? `${dateOnly(latestPaymentRow.amortDate)} - ${money(paidTotal(latestPaymentRow))}` : "-"} />
              <Info label="Latest loan" value={latestLoan ? `${latestLoan.loanNumber ?? latestLoan.remoteId ?? latestLoan.id} · ${dateOnly(latestLoan.releasedAt)}` : "-"} />
              <Info label="Oldest loan" value={oldestLoan ? `${oldestLoan.loanNumber ?? oldestLoan.remoteId ?? oldestLoan.id} · ${dateOnly(oldestLoan.releasedAt)}` : "-"} />
            </dl>
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 p-4">
            <h4 className="font-bold text-slate-950">Analysis</h4>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Overall, this client is classified as <strong>{behavior}</strong>. Across all available loans, the client has paid {percent(totalPaid, totalDue)} of scheduled or accumulated due amounts. Past-due status: <strong>{hasPastDue ? "YES" : "NO"}</strong>. There are {openLoans} open loan(s), {closedLoans} closed loan(s), {overdueRows.length} due amortization row(s) not fully paid, and {pastDueLoans.length} loan account(s) with a past-due signal.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Payment behavior should be reviewed using the Payments View and schedule rows: recent payments, partial payments, missed due dates, past-due cure progress, and whether the client pays before due date or only after follow-up are all decision-making indicators.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              This report uses synced loan and amortization data only. Treat it as a payment behavior guide while validating against the branch source records when needed.
            </p>
          </section>

          <section className={`mt-6 rounded-lg border p-4 ${decision.tone === "red" ? "border-red-200 bg-red-50" : decision.tone === "green" ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
            <div className="flex items-start gap-3">
              <div className={decision.tone === "red" ? "text-red-700" : decision.tone === "green" ? "text-brand-green" : "text-brand-blue"}>
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-950">Credit Recommendation</h4>
                <p className={`mt-1 text-sm font-bold ${decision.tone === "red" ? "text-red-700" : decision.tone === "green" ? "text-brand-green" : "text-brand-blue"}`}>{decision.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{decision.message}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Look into the client&apos;s income source, debt-to-income capacity, existing exposure, loan purpose, collateral or co-maker support, and any unposted branch payments before final approval.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="bg-slate-50 px-4 py-3">
              <h4 className="font-bold text-slate-950">Loan Breakdown</h4>
            </div>
            <div className="max-h-[340px] overflow-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="sticky top-0 bg-white text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Loan</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Released</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Paid %</th>
                    <th className="px-4 py-3">Past Due</th>
                    <th className="px-4 py-3">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLoans.map((loan) => {
                    const due = loanDueTotal(loan);
                    const paid = loanPaidTotal(loan);
                    const balance = loanBalance(loan);
                    const branch = loan.branch ?? loan.client.branch;
                    const isPastDueLoan = loanIsPastDue(loan, today);

                    return (
                      <tr key={loan.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <LoanDetailLink loan={loan} label={String(loan.loanNumber ?? loan.remoteId ?? loan.id)} />
                        </td>
                        <td className="px-4 py-3">{branch?.branchName ?? "-"}</td>
                        <td className="px-4 py-3">{dateOnly(loan.releasedAt)}</td>
                        <td className="px-4 py-3">{loan.sourceStatusCode ?? "-"} - {loan.sourceStatusName ?? loan.status}</td>
                        <td className="px-4 py-3 font-semibold">{money(due)}</td>
                        <td className="px-4 py-3 text-brand-green">{money(paid)}</td>
                        <td className={`px-4 py-3 font-bold ${balance > 0 ? "text-red-700" : "text-brand-green"}`}>{money(balance)}</td>
                        <td className="px-4 py-3">{percent(paid, due)}</td>
                        <td className={`px-4 py-3 font-bold ${isPastDueLoan ? "text-red-700" : "text-brand-green"}`}>{isPastDueLoan ? "Yes" : "No"}</td>
                        <td className="px-4 py-3">{loan.amortizationSchedules.length}</td>
                      </tr>
                    );
                  })}
                  {!sortedLoans.length ? (
                    <tr><td className="px-4 py-6 text-slate-500" colSpan={10}>No loans available for analysis.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
