"use client";

import { AlertTriangle, BarChart3, CheckCircle2, ShieldCheck, TrendingUp, X } from "lucide-react";
import { dateOnly, money } from "@/lib/format";
import type { LoanDetailLoan, LoanDetailSchedule } from "@/components/loan-detail-window";

type PaymentBehaviorReportProps = {
  loan: LoanDetailLoan;
  onClose: () => void;
};

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function paidTotal(schedule: LoanDetailSchedule) {
  return numberValue(schedule.paidPrincipal) + numberValue(schedule.paidInterest);
}

function rowStatus(schedule: LoanDetailSchedule) {
  const paid = paidTotal(schedule);
  const due = numberValue(schedule.totalAmort);

  if (paid > 0 && paid < due) return "Partial Payment";
  if ((paid > 0 && paid >= due) || schedule.paidStatus) return "Paid";
  return "Unpaid";
}

function dueTime(schedule: LoanDetailSchedule) {
  return schedule.amortDate ? new Date(schedule.amortDate).getTime() : 0;
}

function percent(part: number, whole: number) {
  if (!whole) return "0%";
  return `${Math.min(100, Math.max(0, (part / whole) * 100)).toFixed(1)}%`;
}

function classifyBehavior({
  paidRatio,
  overdueCount,
  partialCount,
  expectedDue,
  paidTotalAmount
}: {
  paidRatio: number;
  overdueCount: number;
  partialCount: number;
  expectedDue: number;
  paidTotalAmount: number;
}) {
  if (expectedDue === 0 && paidTotalAmount === 0) return "No payment activity yet";
  if (overdueCount === 0 && paidRatio >= 0.98) return "Good payer";
  if (overdueCount <= 1 && paidRatio >= 0.75) return "Generally paying";
  if (partialCount > 0 || paidRatio >= 0.35) return "Irregular or partial payer";
  return "High follow-up priority";
}

function scheduleRemaining(schedule: LoanDetailSchedule) {
  return Math.max(0, numberValue(schedule.totalAmort) - paidTotal(schedule));
}

function sourceStatusIndicatesPastDue(loan: LoanDetailLoan) {
  const statusText = `${loan.sourceStatusName ?? ""} ${loan.status ?? ""}`;
  return /past\s*due|overdue|delinquent|arrears/i.test(statusText);
}

function recommendationForLoan({
  isPastDue,
  overdueCount,
  partialCount,
  expectedRatio,
  balance
}: {
  isPastDue: boolean;
  overdueCount: number;
  partialCount: number;
  expectedRatio: number;
  balance: number;
}) {
  if (isPastDue || overdueCount >= 2) {
    return {
      label: "Recommend Disapprove / Hold",
      tone: "red" as const,
      message:
        "Do not approve a new or additional loan until the past-due amount is cured, branch records are verified, and repayment capacity is re-assessed."
    };
  }

  if (balance > 0 || partialCount > 0 || expectedRatio < 0.9) {
    return {
      label: "Conditional Approval Only",
      tone: "blue" as const,
      message:
        "May be considered only with stronger verification of income, purpose, collateral or co-maker support, and a conservative repayment amount."
    };
  }

  return {
    label: "Recommend Approve",
    tone: "green" as const,
    message:
      "Payment behavior is acceptable based on synced records, subject to normal credit checks and confirmation that no external obligations are undisclosed."
  };
}

export function PaymentBehaviorReport({ loan, onClose }: PaymentBehaviorReportProps) {
  const today = new Date();
  const schedules = [...loan.amortizationSchedules].sort((a, b) => dueTime(a) - dueTime(b));
  const totalAmort = schedules.reduce((sum, schedule) => sum + numberValue(schedule.totalAmort), 0);
  const totalPaid = schedules.reduce((sum, schedule) => sum + paidTotal(schedule), 0);
  const dueRows = schedules.filter((schedule) => schedule.amortDate && new Date(schedule.amortDate) <= today);
  const expectedDue = dueRows.reduce((sum, schedule) => sum + numberValue(schedule.totalAmort), 0);
  const paidRows = schedules.filter((schedule) => rowStatus(schedule) === "Paid");
  const partialRows = schedules.filter((schedule) => rowStatus(schedule) === "Partial Payment");
  const unpaidRows = schedules.filter((schedule) => rowStatus(schedule) === "Unpaid");
  const overdueRows = dueRows.filter((schedule) => rowStatus(schedule) !== "Paid");
  const overdueAmount = overdueRows.reduce((sum, schedule) => sum + scheduleRemaining(schedule), 0);
  const latestPaidRow = [...schedules].reverse().find((schedule) => paidTotal(schedule) > 0);
  const nextDueRow = schedules.find((schedule) => rowStatus(schedule) !== "Paid" && schedule.amortDate && new Date(schedule.amortDate) > today);
  const progressRatio = totalAmort ? totalPaid / totalAmort : 0;
  const expectedRatio = expectedDue ? totalPaid / expectedDue : 0;
  const behavior = classifyBehavior({
    paidRatio: expectedRatio,
    overdueCount: overdueRows.length,
    partialCount: partialRows.length,
    expectedDue,
    paidTotalAmount: totalPaid
  });
  const balance = Math.max(0, totalAmort - totalPaid);
  const branch = loan.branch ?? loan.client.branch;
  const maturityPastDue = Boolean(loan.maturityAt && new Date(loan.maturityAt) < today && balance > 0);
  const isPastDue = overdueRows.length > 0 || maturityPastDue || sourceStatusIndicatesPastDue(loan);
  const paymentVelocity = expectedDue ? Math.min(100, Math.max(0, (totalPaid / expectedDue) * 100)) : 0;
  const decision = recommendationForLoan({
    isPastDue,
    overdueCount: overdueRows.length,
    partialCount: partialRows.length,
    expectedRatio,
    balance
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Payment behavior analysis</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">{loan.client.fullName}</h3>
            <p className="mt-1 text-sm text-slate-500">
              Loan {loan.loanNumber ?? loan.remoteId ?? loan.id} · {branch?.branchName ?? "Unknown branch"} · Released {dateOnly(loan.releasedAt)}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Close
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric icon={TrendingUp} label="Behavior" value={behavior} />
            <Metric icon={CheckCircle2} label="Paid Progress" value={percent(totalPaid, totalAmort)} detail={`${money(totalPaid)} of ${money(totalAmort)}`} />
            <Metric icon={AlertTriangle} label="Past Due" value={isPastDue ? "Yes" : "No"} detail={`${overdueRows.length} overdue row(s), ${money(overdueAmount)}`} tone={isPastDue ? "red" : "green"} />
            <Metric icon={BarChart3} label="Remaining Balance" value={money(balance)} detail={`${unpaidRows.length} unpaid, ${partialRows.length} partial`} tone={balance > 0 ? "red" : "green"} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-lg border border-slate-200 p-4">
              <h4 className="font-bold text-slate-950">Summary</h4>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <Info label="Schedule rows" value={String(schedules.length)} />
                <Info label="Paid rows" value={String(paidRows.length)} />
                <Info label="Partial rows" value={String(partialRows.length)} />
                <Info label="Unpaid rows" value={String(unpaidRows.length)} />
                <Info label="Expected due by today" value={money(expectedDue)} />
                <Info label="Paid vs expected due" value={percent(totalPaid, expectedDue)} />
                <Info label="Payment velocity" value={`${paymentVelocity.toFixed(1)}% current`} />
                <Info label="Past-due amount" value={money(overdueAmount)} />
                <Info label="Latest payment row" value={latestPaidRow ? `${dateOnly(latestPaidRow.amortDate)} · ${money(paidTotal(latestPaidRow))}` : "-"} />
                <Info label="Next unpaid due" value={nextDueRow ? `${dateOnly(nextDueRow.amortDate)} · ${money(nextDueRow.totalAmort)}` : "-"} />
              </dl>
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <h4 className="font-bold text-slate-950">Analysis</h4>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                This loan is classified as <strong>{behavior}</strong>. The client has paid {percent(totalPaid, totalAmort)} of the full amortization schedule and {percent(totalPaid, expectedDue)} of the amount expected by today. Past-due status: <strong>{isPastDue ? "YES" : "NO"}</strong>. There are {overdueRows.length} due schedule row(s) not fully paid, {partialRows.length} partial-payment row(s), and {money(overdueAmount)} currently past due.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                The Payments View should be treated as the repayment-behavior evidence: check recency of payments, missed due dates, partial-payment pattern, and whether payments are curing arrears or only covering current amortization.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Use this as an operational guide only. It is based on synced amortization/payment values, so the result depends on how complete the branch sync data is.
              </p>
            </section>
          </div>

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
                  Review before final decision: active balance, past-due cure plan, latest payment date, income stability, debt burden, loan purpose, collateral value, and branch confirmation of any unposted payments.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="bg-slate-50 px-4 py-3">
              <h4 className="font-bold text-slate-950">Schedule Behavior Rows</h4>
            </div>
            <div className="max-h-[320px] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 bg-white text-slate-500">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Total Amort</th>
                    <th className="px-4 py-3">Paid Principal</th>
                    <th className="px-4 py-3">Paid Interest</th>
                    <th className="px-4 py-3">Paid Total</th>
                    <th className="px-4 py-3">Remaining</th>
                    <th className="px-4 py-3">Behavior</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((schedule) => {
                    const paid = paidTotal(schedule);
                    const due = numberValue(schedule.totalAmort);
                    const remaining = Math.max(0, due - paid);
                    const status = rowStatus(schedule);

                    return (
                      <tr key={schedule.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-500">{schedule.amortNo}</td>
                        <td className="px-4 py-3">{dateOnly(schedule.amortDate)}</td>
                        <td className="px-4 py-3 font-semibold">{money(due)}</td>
                        <td className="px-4 py-3">{money(schedule.paidPrincipal)}</td>
                        <td className="px-4 py-3">{money(schedule.paidInterest)}</td>
                        <td className="px-4 py-3 text-brand-green">{money(paid)}</td>
                        <td className={`px-4 py-3 font-bold ${remaining > 0 ? "text-red-700" : "text-brand-green"}`}>{money(remaining)}</td>
                        <td className="px-4 py-3">{status}</td>
                      </tr>
                    );
                  })}
                  {!schedules.length ? (
                    <tr><td className="px-4 py-6 text-slate-500" colSpan={8}>No amortization schedule available for analysis.</td></tr>
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
