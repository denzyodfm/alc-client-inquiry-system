"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useState } from "react";
import { dateOnly, money } from "@/lib/format";

type Schedule = {
  id: number;
  amortNo: number;
  amortDate: string | null;
  principalBalance: string;
  interestBalance: string;
  principalAmort: string;
  interestAmort: string;
  totalAmort: string;
  paidPrincipal: string;
  paidInterest: string;
  paidTotal: string;
  paidStatus: number | null;
};

export type LoanResultRow = {
  id: number;
  remoteId: string;
  loanNumber: string | null;
  principalAmount: string;
  interestRate: string;
  interestAmount: string;
  penaltyAmount: string;
  terms: string | null;
  paidAmount: string;
  balance: string;
  status: string;
  sourceStatusCode: number | null;
  sourceStatusName: string | null;
  releasedAt: string | null;
  maturityAt: string | null;
  client: {
    id: number;
    fullName: string;
    clientId: string | null;
    birthdate: string | null;
    contactNumber: string | null;
    validIdNumber: string | null;
  };
  branch: {
    branchName: string;
    branchCode: string;
  };
  amortizationSchedules: Schedule[];
};

type LoanResultsTableProps = {
  loans: LoanResultRow[];
  firstRowNumber: number;
  totalLoans: number;
  safePage: number;
  totalPages: number;
  firstResult: number;
  lastResult: number;
  previousHref: string;
  nextHref: string;
  pageLinks: Array<{ page: number; href: string; showGap: boolean }>;
};

function percent(value: unknown) {
  const rate = Number(value ?? 0);
  return `${rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

function loanStatusText(loan: { sourceStatusCode: number | null; sourceStatusName: string | null; status: string }) {
  const sourceCode = loan.sourceStatusCode === null ? null : String(loan.sourceStatusCode);
  const description = loan.sourceStatusName ?? loan.status;
  return sourceCode ? `${sourceCode} - ${description}` : description;
}

function amortizationTotals(schedules: Schedule[]) {
  return schedules.reduce(
    (totals, schedule) => ({
      principalAmort: totals.principalAmort + Number(schedule.principalAmort),
      interestAmort: totals.interestAmort + Number(schedule.interestAmort),
      totalAmort: totals.totalAmort + Number(schedule.totalAmort),
      paidPrincipal: totals.paidPrincipal + Number(schedule.paidPrincipal),
      paidInterest: totals.paidInterest + Number(schedule.paidInterest),
      paidTotal: totals.paidTotal + Number(schedule.paidTotal)
    }),
    {
      principalAmort: 0,
      interestAmort: 0,
      totalAmort: 0,
      paidPrincipal: 0,
      paidInterest: 0,
      paidTotal: 0
    }
  );
}

function scheduleStatusText(schedule: Schedule) {
  const paidTotal = Number(schedule.paidTotal);
  const totalAmort = Number(schedule.totalAmort);

  if (paidTotal > 0 && paidTotal < totalAmort) return "Partial Payment";
  if (paidTotal >= totalAmort || schedule.paidStatus) return "Paid";
  return "Open";
}

export function LoanResultsTable({
  loans,
  firstRowNumber,
  totalLoans,
  safePage,
  totalPages,
  firstResult,
  lastResult,
  previousHref,
  nextHref,
  pageLinks
}: LoanResultsTableProps) {
  const [selectedLoan, setSelectedLoan] = useState<LoanResultRow | null>(null);
  const selectedAmortizationTotals = selectedLoan ? amortizationTotals(selectedLoan.amortizationSchedules) : null;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm">
        <span className="font-semibold text-slate-700">
          Showing {firstResult}-{lastResult} of {totalLoans} loans
        </span>
        <span className="text-slate-500">Page {safePage} of {totalPages}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Loan</th>
              <th className="px-4 py-3">Released</th>
              <th className="px-4 py-3">Principal</th>
              <th className="px-4 py-3">Interest</th>
              <th className="px-4 py-3">Penalty</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payments</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((loan, index) => {
              const principal = Number(loan.principalAmount);
              const interest = Number(loan.interestAmount);
              const penalty = Number(loan.penaltyAmount);
              const total = principal + interest + penalty;
              const payments = Number(loan.paidAmount);
              const balance = Number(loan.balance);

              return (
                <tr key={loan.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-500">{firstRowNumber + index}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{loan.client.fullName}</td>
                  <td className="px-4 py-3">{loan.branch.branchName}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-bold text-brand-blue hover:underline"
                      onClick={() => setSelectedLoan(loan)}
                    >
                      {loan.loanNumber ?? loan.remoteId}
                    </button>
                  </td>
                  <td className="px-4 py-3">{dateOnly(loan.releasedAt)}</td>
                  <td className="px-4 py-3">{money(principal)}</td>
                  <td className="px-4 py-3">{money(interest)}</td>
                  <td className="px-4 py-3">{money(penalty)}</td>
                  <td className="px-4 py-3 font-semibold">{money(total)}</td>
                  <td className="px-4 py-3 text-brand-green">{money(payments)}</td>
                  <td className={`px-4 py-3 font-bold ${balance > 0 ? "text-red-700" : "text-brand-green"}`}>{money(balance)}</td>
                  <td className="px-4 py-3">{loanStatusText(loan)}</td>
                </tr>
              );
            })}
            {!loans.length ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={12}>No loan records available.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
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
          {pageLinks
            .map(({ page, href, showGap }) => {
              return (
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
              );
            })}
        </div>
      </div>

      {selectedLoan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Loan details</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{selectedLoan.loanNumber ?? selectedLoan.remoteId}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedLoan.client.fullName} - {selectedLoan.branch.branchName}
                </p>
              </div>
              <button type="button" className="btn-secondary h-9 px-3" onClick={() => setSelectedLoan(null)}>
                <X className="h-4 w-4" />
                Close
              </button>
            </div>

            <div className="max-h-[calc(90vh-92px)] overflow-y-auto p-5">
              <dl className="grid gap-4 text-sm md:grid-cols-4">
                <div><dt className="font-semibold text-slate-500">Customer No.</dt><dd className="mt-1 font-bold">{selectedLoan.client.clientId ?? "-"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Branch</dt><dd className="mt-1 font-bold">{selectedLoan.branch.branchName}</dd></div>
                <div><dt className="font-semibold text-slate-500">Birthdate</dt><dd className="mt-1 font-bold">{dateOnly(selectedLoan.client.birthdate)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Contact</dt><dd className="mt-1 font-bold">{selectedLoan.client.contactNumber ?? "-"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Amount Granted</dt><dd className="mt-1 font-bold">{money(selectedLoan.principalAmount)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Interest Rate</dt><dd className="mt-1 font-bold">{percent(selectedLoan.interestRate)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Interest Amount</dt><dd className="mt-1 font-bold">{money(selectedLoan.interestAmount)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Penalty Amount</dt><dd className="mt-1 font-bold">{money(selectedLoan.penaltyAmount)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Total Amount</dt><dd className="mt-1 font-bold">{money(Number(selectedLoan.principalAmount) + Number(selectedLoan.interestAmount) + Number(selectedLoan.penaltyAmount))}</dd></div>
                <div><dt className="font-semibold text-slate-500">Terms</dt><dd className="mt-1 font-bold">{selectedLoan.terms ?? "-"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Released</dt><dd className="mt-1 font-bold">{dateOnly(selectedLoan.releasedAt)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Maturity</dt><dd className="mt-1 font-bold">{dateOnly(selectedLoan.maturityAt)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Total Payments</dt><dd className="mt-1 font-bold text-brand-green">{money(selectedLoan.paidAmount)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Balance</dt><dd className={`mt-1 font-bold ${Number(selectedLoan.balance) > 0 ? "text-red-700" : "text-brand-green"}`}>{money(selectedLoan.balance)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Status</dt><dd className="mt-1 font-bold">{loanStatusText(selectedLoan)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Valid ID</dt><dd className="mt-1 font-bold">{selectedLoan.client.validIdNumber ?? "-"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Schedule Rows</dt><dd className="mt-1 font-bold">{selectedLoan.amortizationSchedules.length.toLocaleString("en-US")}</dd></div>
              </dl>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">No.</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Principal Amort</th>
                      <th className="px-3 py-2">Interest Amort</th>
                      <th className="px-3 py-2">Total Amort</th>
                      <th className="px-3 py-2">Paid Principal</th>
                      <th className="px-3 py-2">Paid Interest</th>
                      <th className="px-3 py-2">Paid Total</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLoan.amortizationSchedules.map((schedule) => (
                      <tr key={schedule.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold">{schedule.amortNo}</td>
                        <td className="px-3 py-2">{dateOnly(schedule.amortDate)}</td>
                        <td className="px-3 py-2">{money(schedule.principalAmort)}</td>
                        <td className="px-3 py-2">{money(schedule.interestAmort)}</td>
                        <td className="px-3 py-2 font-semibold">{money(schedule.totalAmort)}</td>
                        <td className="px-3 py-2">{money(schedule.paidPrincipal)}</td>
                        <td className="px-3 py-2">{money(schedule.paidInterest)}</td>
                        <td className="px-3 py-2 text-brand-green">{money(schedule.paidTotal)}</td>
                        <td className="px-3 py-2">{scheduleStatusText(schedule)}</td>
                      </tr>
                    ))}
                    {!selectedLoan.amortizationSchedules.length ? (
                      <tr><td className="px-3 py-4 text-slate-500" colSpan={9}>No amortization schedule rows available.</td></tr>
                    ) : null}
                  </tbody>
                  {selectedAmortizationTotals ? (
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-950">
                      <tr>
                        <td className="px-3 py-3" colSpan={2}>Totals</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.principalAmort)}</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.interestAmort)}</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.totalAmort)}</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.paidPrincipal)}</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.paidInterest)}</td>
                        <td className="px-3 py-3 text-brand-green">{money(selectedAmortizationTotals.paidTotal)}</td>
                        <td className="px-3 py-3">-</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
