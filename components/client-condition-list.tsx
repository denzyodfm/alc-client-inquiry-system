"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { FileSpreadsheet, Search } from "lucide-react";
import { PrintReportButton } from "@/components/print-report-button";
import { dateOnly } from "@/lib/format";

export type ClientConditionRow = {
  id: number;
  clientName: string;
  clientId: string | null;
  address: string | null;
  branch: string;
  loanNumber: string;
  accountOfficer: string;
  areaTeamLeader: string | null;
  zone: string | null;
  condition: string;
  approvalStatus: string | null;
  reportedAt: string | null;
  approvedAt: string | null;
};

type PageLink = { page: number; href: string; showGap: boolean };

export function ClientConditionList({
  rows,
  query,
  selectedCondition,
  totalRows,
  firstResult,
  lastResult,
  safePage,
  totalPages,
  previousHref,
  nextHref,
  pageLinks,
  excelHref,
  printableHref,
  paginatedHref,
  printAll
}: {
  rows: ClientConditionRow[];
  query: string;
  selectedCondition: string;
  totalRows: number;
  firstResult: number;
  lastResult: number;
  safePage: number;
  totalPages: number;
  previousHref: string;
  nextHref: string;
  pageLinks: PageLink[];
  excelHref: string;
  printableHref: string;
  paginatedHref: string;
  printAll: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateCondition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assignmentId = Number(form.get("assignmentId"));
    const action = String(form.get("action") ?? "report");
    const condition = String(form.get("condition") ?? "");
    if (action === "clear" && !window.confirm("Clear this customer condition because the client has been located?")) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const response = await fetch("/api/account-tagging/condition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, action, condition })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Unable to update customer condition.");
        return;
      }
      setNotice(action === "clear" ? "Customer condition cleared." : "Customer condition updated.");
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      <form className="panel grid gap-3 p-4 no-print md:grid-cols-[1fr_220px_auto_auto]" method="get">
        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-700">Search all fields</span>
          <input className="field" name="q" defaultValue={query} placeholder="Client, loan, branch, AO, zone, condition..." />
        </label>
        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-700">Condition</span>
          <select className="field" name="condition" defaultValue={selectedCondition}>
            <option value="ALL">All conditions</option>
            <option value="UNLOCATED">Unlocated</option>
            <option value="DORMANT">Dormant</option>
            <option value="RIP">RIP</option>
          </select>
        </label>
        <button className="btn-primary self-end"><Search className="h-4 w-4" />Search</button>
        <Link className="btn-secondary self-end" href="/client-conditions">Clear</Link>
      </form>

      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green no-print">{notice}</div> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 no-print">{error}</div> : null}

      <section className="panel overflow-hidden print-area">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <div className="hidden print:block">
              <h1 className="text-lg font-bold">Agusan Lending Corporation</h1>
              <p className="text-sm font-semibold uppercase text-brand-green">Client Condition Report</p>
            </div>
            <p className="text-sm font-bold text-slate-950">Showing {firstResult}-{lastResult} of {totalRows.toLocaleString("en-US")} record(s)</p>
            <p className="text-xs text-slate-500">Page {safePage} of {totalPages}</p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            {printAll ? <Link className="btn-secondary" href={paginatedHref}>Back to paginated list</Link> : null}
            <Link className={`btn-secondary ${!totalRows ? "pointer-events-none opacity-50" : ""}`} href={excelHref}>
              <FileSpreadsheet className="h-4 w-4" />Download Excel
            </Link>
            {printAll ? <PrintReportButton label="Print full list" /> : <Link className={`btn-primary ${!totalRows ? "pointer-events-none opacity-50" : ""}`} href={printableHref}>Print full list</Link>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-left text-xs">
            <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">No.</th><th className="px-3 py-3">Client</th><th className="px-3 py-3">Address</th>
                <th className="px-3 py-3">Branch / Loan</th><th className="px-3 py-3">Account Officer</th><th className="px-3 py-3">Area TL</th>
                <th className="px-3 py-3">Zone</th><th className="px-3 py-3">Condition</th><th className="px-3 py-3">Approval</th>
                <th className="px-3 py-3">Dates</th><th className="px-3 py-3 no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-3">{firstResult + index}</td>
                  <td className="px-3 py-3"><p className="font-bold text-slate-950">{row.clientName}</p><p className="text-slate-500">{row.clientId || "-"}</p></td>
                  <td className="px-3 py-3">{row.address || "-"}</td>
                  <td className="px-3 py-3"><p className="font-semibold">{row.branch}</p><p>{row.loanNumber}</p></td>
                  <td className="px-3 py-3 font-semibold">{row.accountOfficer}</td>
                  <td className="px-3 py-3">{row.areaTeamLeader || "-"}</td>
                  <td className="px-3 py-3">{row.zone || "-"}</td>
                  <td className="px-3 py-3"><span className="rounded-md bg-amber-50 px-2 py-1 font-bold text-amber-700">{row.condition}</span></td>
                  <td className="px-3 py-3">{row.approvalStatus || "Pending"}</td>
                  <td className="px-3 py-3"><p>Reported: {dateOnly(row.reportedAt)}</p><p>Approved: {dateOnly(row.approvedAt)}</p></td>
                  <td className="px-3 py-3 no-print">
                    <form onSubmit={updateCondition} className="flex items-center gap-2">
                      <input type="hidden" name="assignmentId" value={row.id} />
                      <select name="condition" className="field h-9 w-32 text-xs" defaultValue={row.condition}>
                        <option value="UNLOCATED">Unlocated</option><option value="DORMANT">Dormant</option><option value="RIP">RIP</option>
                      </select>
                      <button name="action" value="report" className="btn-secondary h-9 px-3" disabled={isPending}>Update</button>
                      <button name="action" value="clear" className="h-9 rounded-md border border-red-200 px-3 font-semibold text-red-600 hover:bg-red-50" disabled={isPending}>Clear</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={11} className="px-4 py-8 text-center font-semibold text-slate-500">No client conditions found.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {!printAll ? <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 no-print">
          <Link className={`btn-secondary ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`} href={previousHref}>Previous</Link>
          <div className="flex items-center gap-1">{pageLinks.map((link) => <span key={link.page}>{link.showGap ? <span className="px-2">…</span> : null}<Link className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 font-bold ${link.page === safePage ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-slate-200"}`} href={link.href}>{link.page}</Link></span>)}</div>
          <Link className={`btn-secondary ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`} href={nextHref}>Next</Link>
        </div> : null}
      </section>
    </div>
  );
}
