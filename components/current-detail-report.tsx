"use client";

import Link from "next/link";
import { useState } from "react";
import { LoanDetailWindow, type LoanDetailLoan } from "@/components/loan-detail-window";
import { PrintReportButton } from "@/components/print-report-button";
import { dateOnly, money } from "@/lib/format";

export type CurrentDetailRow = {
  id: number;
  clientName: string;
  clientId: string | null;
  branchName: string;
  loanNumber: string;
  releasedAt: string | null;
  maturityAt: string | null;
  dueToday: number;
  paid: number;
  balance: number;
  loan: LoanDetailLoan;
};

export function CurrentDetailReport({
  title,
  count,
  dueToday,
  balance,
  rows,
  closeHref
}: {
  title: string;
  count: number;
  dueToday: number;
  balance: number;
  rows: CurrentDetailRow[];
  closeHref: string;
}) {
  const [selectedLoan, setSelectedLoan] = useState<LoanDetailLoan | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 p-4">
      <div className="mx-auto flex max-h-[calc(100vh-2rem)] max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl print-area">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Current Loan Detail Report</p>
            <h3 className="text-xl font-bold text-slate-950">{title}</h3>
            <p className="text-sm text-slate-500">
              {count.toLocaleString("en-US")} loan(s) | Due as of today {money(dueToday)} | Balance {money(balance)}
            </p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <PrintReportButton />
            <Link className="btn-secondary h-9 px-3" href={closeHref}>
              Close
            </Link>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">No.</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Loan</th>
                <th className="px-4 py-3">Released</th>
                <th className="px-4 py-3">Maturity</th>
                <th className="px-4 py-3">Due Today</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-500">{index + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{row.clientName}</p>
                    <p className="text-xs text-slate-500">{row.clientId ?? "-"}</p>
                  </td>
                  <td className="px-4 py-3">{row.branchName}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="font-bold text-brand-blue hover:underline no-print" onClick={() => setSelectedLoan(row.loan)}>
                      {row.loanNumber}
                    </button>
                    <span className="print-only font-bold text-brand-blue">{row.loanNumber}</span>
                  </td>
                  <td className="px-4 py-3">{dateOnly(row.releasedAt)}</td>
                  <td className="px-4 py-3">{dateOnly(row.maturityAt)}</td>
                  <td className="px-4 py-3 font-bold text-red-700">{money(row.dueToday)}</td>
                  <td className="px-4 py-3 text-brand-green">{money(row.paid)}</td>
                  <td className="px-4 py-3 font-bold text-red-700">{money(row.balance)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={9}>
                    No current loans found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLoan ? <LoanDetailWindow loan={selectedLoan} onClose={() => setSelectedLoan(null)} /> : null}
    </div>
  );
}
