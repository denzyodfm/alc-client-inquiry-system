"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { dateOnly, money } from "@/lib/format";
import { amountDueAsOfToday } from "@/lib/loan-amounts";
import { LoanDetailWindow } from "@/components/loan-detail-window";
import { PaymentBehaviorReport } from "@/components/payment-behavior-report";
import { ClientLoanAnalysisReport } from "@/components/client-loan-analysis-report";

type Schedule = {
  id: number;
  remoteId?: string;
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
  clientLoansByClientId: Record<number, LoanResultRow[]>;
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

function loanStatusText(loan: { sourceStatusCode: number | null; sourceStatusName: string | null; status: string }) {
  return loan.sourceStatusName ?? loan.status;
}

function loanStatusCode(loan: { sourceStatusCode: number | null }) {
  return loan.sourceStatusCode === null ? "-" : String(loan.sourceStatusCode);
}

export function LoanResultsTable({
  loans,
  clientLoansByClientId,
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
  const [analysisLoan, setAnalysisLoan] = useState<LoanResultRow | null>(null);
  const [analysisClient, setAnalysisClient] = useState<{ client: LoanResultRow["client"]; loans: LoanResultRow[] } | null>(null);

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
              <th className="px-4 py-3">Due Today</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payments</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Status ID</th>
              <th className="px-4 py-3">Status Label</th>
              <th className="px-4 py-3">Analysis</th>
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
              const dueToday = amountDueAsOfToday(loan);

              return (
                <tr key={loan.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-500">{firstRowNumber + index}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-56 flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{loan.client.fullName}</span>
                      <button
                        type="button"
                        className="btn-secondary h-8 px-3 text-xs"
                        onClick={() =>
                          setAnalysisClient({
                            client: loan.client,
                            loans: clientLoansByClientId[loan.client.id] ?? [loan]
                          })
                        }
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        Loan Analysis
                      </button>
                    </div>
                  </td>
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
                  <td className="px-4 py-3 font-bold text-red-700">{money(dueToday)}</td>
                  <td className="px-4 py-3 font-semibold">{money(total)}</td>
                  <td className="px-4 py-3 text-brand-green">{money(payments)}</td>
                  <td className={`px-4 py-3 font-bold ${balance > 0 ? "text-red-700" : "text-brand-green"}`}>{money(balance)}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{loanStatusCode(loan)}</td>
                  <td className="px-4 py-3">{loanStatusText(loan)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="btn-secondary h-8 px-3 text-xs"
                      onClick={() => setAnalysisLoan(loan)}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Analyze
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loans.length ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={15}>No loan records available.</td></tr>
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

      {selectedLoan ? <LoanDetailWindow loan={selectedLoan} onClose={() => setSelectedLoan(null)} /> : null}
      {analysisLoan ? <PaymentBehaviorReport loan={analysisLoan} onClose={() => setAnalysisLoan(null)} /> : null}
      {analysisClient ? (
        <ClientLoanAnalysisReport
          clientName={analysisClient.client.fullName}
          customerNo={analysisClient.client.clientId}
          loans={analysisClient.loans}
          onClose={() => setAnalysisClient(null)}
        />
      ) : null}
    </div>
  );
}
