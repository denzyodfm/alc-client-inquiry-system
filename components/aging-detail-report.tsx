"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Search } from "lucide-react";
import { LazyLoanDetailLink } from "@/components/lazy-loan-detail-link";
import { PrintReportButton } from "@/components/print-report-button";
import { dateOnly, money } from "@/lib/format";
import { useModalAccessibility } from "@/components/use-modal-accessibility";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] ?? character);
}

export type AgingDetailRow = {
  id: number;
  clientName: string;
  clientId: string | null;
  clientAddress: string | null;
  branchName: string;
  loanNumber: string;
  loanProduct: string | null;
  pastDueDate: string | null;
  daysPastDue: number;
  due: number;
  dueToday: number;
  paid: number;
  balance: number;
};

export function AgingDetailReport({
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
  rows: AgingDetailRow[];
  closeHref: string;
}) {
  const router = useRouter();
  // A loan window opens in front of this report; while it is up the report stops trapping focus.
  const [loanWindowOpen, setLoanWindowOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(!loanWindowOpen, dialogRef, () => router.push(closeHref));

  const filteredRows = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((row) => {
      const haystack = [row.clientName, row.clientId, row.clientAddress, row.branchName, row.loanNumber, row.loanProduct]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [rows, query]);

  function downloadExcel() {
    const reportRows = filteredRows
      .map(
        (row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.clientName)}</td>
        <td>${escapeHtml(row.clientId ?? "-")}</td>
        <td>${escapeHtml(row.branchName)}</td>
        <td>${escapeHtml(row.loanNumber)}</td>
        <td>${escapeHtml(row.loanProduct ?? "-")}</td>
        <td>${escapeHtml(dateOnly(row.pastDueDate))}</td>
        <td class="number">${row.daysPastDue}</td>
        <td class="number">${row.dueToday.toFixed(2)}</td>
        <td class="number">${row.due.toFixed(2)}</td>
        <td class="number">${row.paid.toFixed(2)}</td>
        <td class="number">${row.balance.toFixed(2)}</td>
      </tr>`
      )
      .join("");

    const workbook = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif}
      table{border-collapse:collapse}
      th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}
      th{background:#f1f5f9}
      .number{text-align:right}
    </style></head><body>
      <h1>${escapeHtml(title)}</h1>
      <table>
        <thead><tr>
          <th>No.</th><th>Client</th><th>Client ID</th><th>Branch</th><th>Loan</th><th>Product</th>
          <th>Past Due Since</th><th>Days</th><th>Due Today</th><th>Loan Amount</th><th>Paid</th><th>Balance</th>
        </tr></thead>
        <tbody>${reportRows || '<tr><td colspan="12">No aged past-due loans found.</td></tr>'}</tbody>
      </table>
    </body></html>`;

    const url = URL.createObjectURL(new Blob(["﻿", workbook], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "aging-loans"}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 px-3 py-4 sm:px-8" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="aging-detail-title" tabIndex={-1} className="mx-auto flex max-h-[calc(100vh-2rem)] max-w-[1600px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl outline-none print-area">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Aging Detail Report</p>
            <h3 id="aging-detail-title" className="text-xl font-bold text-slate-950">{title}</h3>
            <p className="text-sm text-slate-500">
              Showing {filteredRows.length.toLocaleString("en-US")} of {count.toLocaleString("en-US")} loan(s) | Due as of today {money(dueToday)} | Balance {money(balance)}
            </p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <PrintReportButton />
            <Link className="btn-secondary h-9 px-3" href={closeHref}>
              Close
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3 no-print">
          <label className="relative block min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="field h-9 w-full pl-9 text-xs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search client, client ID, address, branch, loan no., or product"
            />
          </label>
          <button
            type="button"
            className={`btn-secondary h-9 px-3 ${!filteredRows.length ? "pointer-events-none opacity-50" : ""}`}
            onClick={downloadExcel}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download Excel
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 shadow-sm">
              <tr>
                <th className="px-4 py-3">No.</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Loan</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Past Due Since</th>
                <th className="px-4 py-3">Days</th>
                <th className="px-4 py-3">Due Today</th>
                <th className="px-4 py-3">Loan Amount</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3" title="Sum of the amortization schedule's total due minus principal and interest paid so far. May differ from the branch's live remote balance.">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-500">{index + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{row.clientName}</p>
                    <p className="text-xs text-slate-500">{row.clientId ?? "-"}</p>
                    <p className="mt-1 max-w-80 text-xs text-slate-500">{row.clientAddress ?? "No address"}</p>
                  </td>
                  <td className="px-4 py-3">{row.branchName}</td>
                  <td className="px-4 py-3">
                    <span className="no-print">
                      <LazyLoanDetailLink loanId={row.id} label={row.loanNumber} onOpenChange={setLoanWindowOpen} />
                    </span>
                    <span className="print-only font-bold text-brand-blue">{row.loanNumber}</span>
                  </td>
                  <td className="px-4 py-3">{row.loanProduct ?? "-"}</td>
                  <td className="px-4 py-3 font-semibold text-red-700">{dateOnly(row.pastDueDate)}</td>
                  <td className="px-4 py-3 font-bold text-red-700">{row.daysPastDue.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 font-bold text-red-700">{money(row.dueToday)}</td>
                  <td className="px-4 py-3 font-semibold">{money(row.due)}</td>
                  <td className="px-4 py-3 text-brand-green">{money(row.paid)}</td>
                  <td className="px-4 py-3 font-bold text-red-700">{money(row.balance)}</td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={11}>
                    {rows.length ? "No loans match your search." : "No aged past-due loans found."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
