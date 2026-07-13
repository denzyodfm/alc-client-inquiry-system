"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { dateOnly, money } from "@/lib/format";
import { LoanDetailWindow, type LoanDetailLoan } from "@/components/loan-detail-window";

export type CoMakerLoanRow = {
  id: number;
  name: string;
  clientRemoteId: string | null;
  contactNumber: string | null;
  validIdNumber: string | null;
  address: string | null;
  loan: LoanDetailLoan;
};

export type CoMakerGroupData = {
  key: string;
  rows: CoMakerLoanRow[];
};

type CoMakerMonitoringListProps = {
  groups: CoMakerGroupData[];
  firstGroupIndex: number;
  safePage: number;
  totalPages: number;
  previousHref: string;
  nextHref: string;
  pageLinks: Array<{ page: number; href: string; showGap: boolean }>;
};

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function paidTotal(schedule: LoanDetailLoan["amortizationSchedules"][number]) {
  return numberValue(schedule.paidPrincipal) + numberValue(schedule.paidInterest);
}

function scheduleDue(schedule: LoanDetailLoan["amortizationSchedules"][number]) {
  return numberValue(schedule.totalAmort);
}

function isSchedulePaid(schedule: LoanDetailLoan["amortizationSchedules"][number]) {
  const paid = paidTotal(schedule);
  const due = scheduleDue(schedule);
  return (paid > 0 && paid >= due) || Boolean(schedule.paidStatus);
}

function loanDueTotal(loan: LoanDetailLoan) {
  const scheduleDueTotal = loan.amortizationSchedules.reduce((sum, schedule) => sum + scheduleDue(schedule), 0);
  return scheduleDueTotal || numberValue(loan.principalAmount) + numberValue(loan.interestAmount) + numberValue(loan.penaltyAmount);
}

function loanPaidTotal(loan: LoanDetailLoan) {
  const schedulePaid = loan.amortizationSchedules.reduce((sum, schedule) => sum + paidTotal(schedule), 0);
  return schedulePaid || numberValue(loan.paidAmount);
}

function loanBalance(loan: LoanDetailLoan) {
  if (loan.sourceStatusCode === 10) return 0;
  const scheduleBalance = Math.max(0, loanDueTotal(loan) - loanPaidTotal(loan));
  return loan.amortizationSchedules.length ? scheduleBalance : Math.max(0, numberValue(loan.balance));
}

function percent(part: number, whole: number) {
  if (!whole) return "0%";
  return `${Math.min(100, Math.max(0, (part / whole) * 100)).toFixed(1)}%`;
}

function sourceStatusIndicatesPastDue(loan: LoanDetailLoan) {
  const statusText = `${loan.sourceStatusName ?? ""} ${loan.status ?? ""}`;
  return /past\s*due|overdue|delinquent|arrears/i.test(statusText);
}

function overdueRowsForLoan(loan: LoanDetailLoan, today: Date) {
  return loan.amortizationSchedules.filter((schedule) => schedule.amortDate && new Date(schedule.amortDate) <= today && !isSchedulePaid(schedule));
}

function loanIsPastDue(loan: LoanDetailLoan, today: Date) {
  const balance = loanBalance(loan);
  const maturityPastDue = Boolean(loan.maturityAt && new Date(loan.maturityAt) < today && balance > 0);
  return overdueRowsForLoan(loan, today).length > 0 || maturityPastDue || sourceStatusIndicatesPastDue(loan);
}

function recommendationForCoMaker({
  loanCount,
  openLoans,
  pastDueLoans,
  totalBalance,
  paidRatio
}: {
  loanCount: number;
  openLoans: number;
  pastDueLoans: number;
  totalBalance: number;
  paidRatio: number;
}) {
  if (pastDueLoans > 0) {
    return {
      label: "Do Not Allow Yet",
      tone: "red" as const,
      message:
        "This co-maker is attached to at least one past-due loan. Require arrears cure, branch verification, and capacity review before allowing another co-maker obligation."
    };
  }

  if (openLoans >= 3 || totalBalance > 0 || paidRatio < 0.85) {
    return {
      label: "Allow With Caution",
      tone: "blue" as const,
      message:
        "The co-maker has active exposure or weaker borrower payment performance. Verify income, total guarantees, household debt, and willingness to pay before approval."
    };
  }

  if (loanCount >= 5) {
    return {
      label: "Allow With Exposure Limit",
      tone: "blue" as const,
      message:
        "Payment behavior is acceptable, but the co-maker has repeated guarantee exposure. Set a conservative limit and check all active obligations."
    };
  }

  return {
    label: "May Be Allowed",
    tone: "green" as const,
    message:
      "No past-due signal was found in synced co-maker loans and borrower payment behavior appears acceptable, subject to standard verification."
  };
}

function statusText(loan: LoanDetailLoan) {
  return `${loan.sourceStatusCode ?? "-"} - ${loan.sourceStatusName ?? loan.status}`;
}

function releaseTime(loan: LoanDetailLoan) {
  return loan.releasedAt ? new Date(loan.releasedAt).getTime() : 0;
}

function borrowerKey(row: CoMakerLoanRow) {
  const branchCode = row.loan.branch?.branchCode ?? row.loan.client.branch?.branchCode ?? "";
  const clientId = row.loan.client.clientId ?? row.loan.client.fullName;
  return `${branchCode}:${clientId}:${row.loan.client.fullName}`.toLowerCase();
}

function uniqueText(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
  }

  return items.length ? items.join(", ") : "-";
}

export function CoMakerMonitoringList({
  groups,
  firstGroupIndex,
  safePage,
  totalPages,
  previousHref,
  nextHref,
  pageLinks,
}: CoMakerMonitoringListProps) {
  const [selectedLoan, setSelectedLoan] = useState<LoanDetailLoan | null>(null);
  const [expandedBorrowers, setExpandedBorrowers] = useState<Record<string, boolean>>({});
  const today = new Date();

  return (
    <>
      <div className="space-y-4">
        {groups.map((group, groupIndex) => {
          const rows = group.rows;
          const sample = rows[0];
          const displayNumber = firstGroupIndex + groupIndex + 1;
          const loans = rows.map((row) => row.loan);
          const coMakerIds = rows.map((row) => row.clientRemoteId ?? row.validIdNumber);
          const coMakerContacts = rows.map((row) => row.contactNumber);
          const coMakerAddresses = rows.map((row) => row.address);
          const loanCount = loans.length;
          const openLoans = loans.filter((loan) => loan.sourceStatusCode !== 10 && loanBalance(loan) > 0).length;
          const pastDueLoans = loans.filter((loan) => loanIsPastDue(loan, today)).length;
          const totalDue = loans.reduce((sum, loan) => sum + loanDueTotal(loan), 0);
          const totalPaid = loans.reduce((sum, loan) => sum + loanPaidTotal(loan), 0);
          const totalBalance = loans.reduce((sum, loan) => sum + loanBalance(loan), 0);
          const borrowerGroups = Array.from(
            rows
              .reduce<Map<string, CoMakerLoanRow[]>>((map, row) => {
                const key = borrowerKey(row);
                const borrowerRows = map.get(key) ?? [];
                borrowerRows.push(row);
                map.set(key, borrowerRows);
                return map;
              }, new Map())
              .entries()
          )
            .map(([key, borrowerRows]) => ({
              key,
              rows: borrowerRows.sort((a, b) => releaseTime(b.loan) - releaseTime(a.loan))
            }))
            .sort((a, b) => releaseTime(b.rows[0].loan) - releaseTime(a.rows[0].loan));
          const recommendation = recommendationForCoMaker({
            loanCount,
            openLoans,
            pastDueLoans,
            totalBalance,
            paidRatio: totalDue ? totalPaid / totalDue : 0
          });

          return (
            <section key={group.key} className="panel overflow-hidden">
              <div className="grid gap-4 border-b border-slate-100 p-4 lg:grid-cols-[1fr_340px]">
                <div>
                  <h3 className="flex items-start gap-3 text-xl font-bold text-slate-950">
                    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-slate-100 px-2 text-sm text-brand-blue">
                      {displayNumber}
                    </span>
                    <span>{sample.name}</span>
                  </h3>
                  <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
                    <Info label="Client loans co-made" value={loanCount.toLocaleString("en-US")} />
                    <Info label="Open exposure" value={`${openLoans} loan(s)`} />
                    <Info label="Past-due exposure" value={`${pastDueLoans} loan(s)`} valueClassName={pastDueLoans ? "text-red-700" : "text-brand-green"} />
                    <Info label="Total balance" value={money(totalBalance)} valueClassName={totalBalance > 0 ? "text-red-700" : "text-brand-green"} />
                    <Info label="Payment progress" value={percent(totalPaid, totalDue)} />
                    <Info label="Co-maker ID no." value={uniqueText(coMakerIds)} />
                    <Info label="Contact number" value={uniqueText(coMakerContacts)} />
                    <Info label="Address" value={uniqueText(coMakerAddresses)} />
                  </dl>
                </div>

                <div className={`rounded-lg border p-4 ${recommendation.tone === "red" ? "border-red-200 bg-red-50" : recommendation.tone === "green" ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
                  <p className="text-sm font-bold text-slate-950">Recommendation</p>
                  <p className={`mt-1 font-bold ${recommendation.tone === "red" ? "text-red-700" : recommendation.tone === "green" ? "text-brand-green" : "text-brand-blue"}`}>{recommendation.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{recommendation.message}</p>
                </div>
              </div>

              <div className="max-h-[560px] overflow-auto">
                <table className="w-full min-w-[1280px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 shadow-sm">
                    <tr>
                      <th className="px-4 py-3">No.</th>
                      <th className="px-4 py-3">Client / borrower</th>
                      <th className="px-4 py-3">Loans</th>
                      <th className="px-4 py-3">Co-maker contact</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Latest release</th>
                      <th className="px-4 py-3">Due</th>
                      <th className="px-4 py-3">Paid</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3">Payment behavior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borrowerGroups.map((borrowerGroup, borrowerIndex) => {
                      const borrowerRows = borrowerGroup.rows;
                      const latestLoan = borrowerRows[0].loan;
                      const borrowerLoans = borrowerRows.map((row) => row.loan);
                      const borrowerDue = borrowerLoans.reduce((sum, loan) => sum + loanDueTotal(loan), 0);
                      const borrowerPaid = borrowerLoans.reduce((sum, loan) => sum + loanPaidTotal(loan), 0);
                      const borrowerBalance = borrowerLoans.reduce((sum, loan) => sum + loanBalance(loan), 0);
                      const borrowerPastDue = borrowerLoans.filter((loan) => loanIsPastDue(loan, today)).length;
                      const borrowerProgress = percent(borrowerPaid, borrowerDue);
                      const isExpanded = Boolean(expandedBorrowers[borrowerGroup.key]);
                      const borrowerBehavior = borrowerPastDue
                        ? `Past due exposure - ${borrowerPastDue} loan(s)`
                        : borrowerBalance > 0
                          ? `Active exposure - ${borrowerProgress} paid`
                          : `Paid/closed - ${borrowerProgress} paid`;

                      return (
                        <Fragment key={borrowerGroup.key}>
                          <tr className="border-t border-slate-100 bg-white">
                            <td className="px-4 py-3 font-semibold text-slate-500">{borrowerIndex + 1}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 font-bold text-brand-blue hover:underline"
                                onClick={() =>
                                  setExpandedBorrowers((current) => ({
                                    ...current,
                                    [borrowerGroup.key]: !current[borrowerGroup.key]
                                  }))
                                }
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                {latestLoan.client.fullName}
                              </button>
                            </td>
                            <td className="px-4 py-3 font-semibold">{borrowerRows.length.toLocaleString("en-US")} loan(s)</td>
                            <td className="px-4 py-3 font-semibold text-slate-700">{borrowerRows[0].contactNumber ?? "-"}</td>
                            <td className="px-4 py-3">{latestLoan.branch?.branchName ?? latestLoan.client.branch?.branchName ?? "-"}</td>
                            <td className="px-4 py-3">{dateOnly(latestLoan.releasedAt)}</td>
                            <td className="px-4 py-3 font-semibold">{money(borrowerDue)}</td>
                            <td className="px-4 py-3 text-brand-green">{money(borrowerPaid)}</td>
                            <td className={`px-4 py-3 font-bold ${borrowerBalance > 0 ? "text-red-700" : "text-brand-green"}`}>{money(borrowerBalance)}</td>
                            <td className={`px-4 py-3 font-bold ${borrowerPastDue ? "text-red-700" : "text-slate-700"}`}>{borrowerBehavior}</td>
                          </tr>
                          {isExpanded ? (
                            <tr className="border-t border-slate-100 bg-slate-50">
                              <td className="px-4 py-3" />
                              <td className="px-4 py-3" colSpan={9}>
                                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                  <table className="w-full min-w-[980px] text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500">
                                      <tr>
                                        <th className="px-3 py-2">Loan #</th>
                                        <th className="px-3 py-2">Released</th>
                                        <th className="px-3 py-2">Status</th>
                                        <th className="px-3 py-2">Due</th>
                                        <th className="px-3 py-2">Paid</th>
                                        <th className="px-3 py-2">Balance</th>
                                        <th className="px-3 py-2">Payment behavior</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {borrowerRows.map((coMaker) => {
                                        const loan = coMaker.loan;
                                        const due = loanDueTotal(loan);
                                        const paid = loanPaidTotal(loan);
                                        const balance = loanBalance(loan);
                                        const isPastDue = loanIsPastDue(loan, today);
                                        const paymentProgress = percent(paid, due);
                                        const behavior = isPastDue
                                          ? `Past due - ${overdueRowsForLoan(loan, today).length} overdue row(s)`
                                          : balance > 0
                                            ? `Active - ${paymentProgress} paid`
                                            : `Paid/closed - ${paymentProgress} paid`;

                                        return (
                                          <tr key={coMaker.id} className="border-t border-slate-100">
                                            <td className="px-3 py-2">
                                              <button
                                                type="button"
                                                className="font-bold text-brand-blue hover:underline"
                                                onClick={() => setSelectedLoan(loan)}
                                              >
                                                {loan.loanNumber ?? loan.remoteId}
                                              </button>
                                            </td>
                                            <td className="px-3 py-2">{dateOnly(loan.releasedAt)}</td>
                                            <td className="px-3 py-2">{statusText(loan)}</td>
                                            <td className="px-3 py-2 font-semibold">{money(due)}</td>
                                            <td className="px-3 py-2 text-brand-green">{money(paid)}</td>
                                            <td className={`px-3 py-2 font-bold ${balance > 0 ? "text-red-700" : "text-brand-green"}`}>{money(balance)}</td>
                                            <td className={`px-3 py-2 font-bold ${isPastDue ? "text-red-700" : "text-slate-700"}`}>{behavior}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {!groups.length ? (
          <section className="panel p-6 text-sm text-slate-500">
            No co-maker records found. Co-maker monitoring will populate after branch sync finds co-maker fields in loan data.
          </section>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              className={`btn-secondary h-9 px-3 ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`}
              href={previousHref}
              aria-disabled={safePage <= 1}
            >
              Previous
            </Link>
            <Link
              className={`btn-secondary h-9 px-3 ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`}
              href={nextHref}
              aria-disabled={safePage >= totalPages}
            >
              Next
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {pageLinks.map(({ page, href, showGap }) => (
              <span key={page} className="flex items-center gap-1">
                {showGap ? <span className="px-2 text-slate-400">...</span> : null}
                <Link
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 font-semibold ${
                    page === safePage
                      ? "border-brand-blue bg-blue-50 text-brand-blue"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  href={href}
                >
                  {page}
                </Link>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {selectedLoan ? <LoanDetailWindow loan={selectedLoan} onClose={() => setSelectedLoan(null)} /> : null}
    </>
  );
}

function Info({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-1 font-bold text-slate-950 ${valueClassName}`}>{value}</dd>
    </div>
  );
}
