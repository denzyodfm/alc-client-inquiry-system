"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, Printer, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarangayLoanReport } from "@/components/officer-barangay-loans";
import { money } from "@/lib/format";

type OfficerRow = {
  officerId: number;
  officerName: string;
  privilege: string;
  branches: string;
  numberOfClients: number;
  portfolio: number;
  current: number;
  currentBalance: number;
  delayed: number;
  delayedBalance: number;
  pastDue: number;
  pastDueBalance: number;
  litigated: number;
  litigatedBalance: number;
};

type SortKey = "officerName" | "privilege" | "branches" | "numberOfClients" | "portfolio" | "current" | "delayed" | "pastDue" | "litigated";

const TEXT_KEYS: SortKey[] = ["officerName", "privilege", "branches"];

const BALANCE_OF: Partial<Record<SortKey, keyof OfficerRow>> = {
  current: "currentBalance",
  delayed: "delayedBalance",
  pastDue: "pastDueBalance",
  litigated: "litigatedBalance"
};

const ROW_GRID = "grid min-w-[1180px] grid-cols-[minmax(200px,1.3fr)_120px_minmax(150px,1fr)_90px_130px_repeat(4,120px)] items-center gap-2";

function countValue(value: number) {
  return value ? value.toLocaleString("en-US") : "-";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function compareRows(a: OfficerRow, b: OfficerRow, key: SortKey) {
  const left = a[key];
  const right = b[key];
  if (typeof left === "string" || typeof right === "string") {
    return String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" });
  }
  const difference = (left as number) - (right as number);
  if (difference) return difference;
  const balanceKey = BALANCE_OF[key];
  return balanceKey ? (a[balanceKey] as number) - (b[balanceKey] as number) : 0;
}

// Opened from a district row in the Zone Summary: who carries the loans tagged to it.
export function DistrictOfficerSummary({ zone, district, label }: { zone: string; district: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<OfficerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "portfolio", dir: "desc" });
  const title = `${district} - ${zone}`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/location-masterlist/district-officers?zone=${encodeURIComponent(zone)}&district=${encodeURIComponent(district)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load the district summary.");
        setRows(data.officers);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load the district summary.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [district, open, zone]);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("en");
    const filtered = (rows ?? []).filter((row) => !term || [row.officerName, row.privilege, row.branches].join(" ").toLocaleLowerCase("en").includes(term));
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => direction * compareRows(a, b, sort.key));
  }, [query, rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: TEXT_KEYS.includes(key) ? "asc" : "desc" });
  }

  function reportHtml() {
    const body = visibleRows.map((row, index) => `<tr>
      <td>${index + 1}</td><td>${escapeHtml(row.officerName)}</td><td>${escapeHtml(row.privilege)}</td><td>${escapeHtml(row.branches)}</td>
      <td class="number">${row.numberOfClients}</td><td class="number">${row.portfolio.toFixed(2)}</td>
      <td class="number">${row.current}</td><td class="number">${row.currentBalance.toFixed(2)}</td>
      <td class="number">${row.delayed}</td><td class="number">${row.delayedBalance.toFixed(2)}</td>
      <td class="number">${row.pastDue}</td><td class="number">${row.pastDueBalance.toFixed(2)}</td>
      <td class="number">${row.litigated}</td><td class="number">${row.litigatedBalance.toFixed(2)}</td>
    </tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      body{font-family:Arial,sans-serif;color:#0f172a;padding:24px}
      h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:0 0 16px;color:#475569}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th,td{border:1px solid #cbd5e1;padding:5px;text-align:left}
      th{background:#f1f5f9;font-size:9px;text-transform:uppercase}
      .number{text-align:right;white-space:nowrap}
      @page{size:landscape;margin:10mm}
    </style></head><body>
      <h1>Account Officers - ${escapeHtml(district)}</h1><h2>Zone: ${escapeHtml(zone)}</h2>
      <table><thead><tr>
        <th>No.</th><th>Account Officer</th><th>Privilege</th><th>Branch</th><th>Clients</th><th>Portfolio</th>
        <th>Current</th><th>Current Principal</th><th>Delayed</th><th>Delayed Principal</th>
        <th>Past Due</th><th>Past Due Principal</th><th>Litigated</th><th>Litigated Principal</th>
      </tr></thead><tbody>${body || '<tr><td colspan="14">No assigned loans.</td></tr>'}</tbody></table>
    </body></html>`;
  }

  function printReport() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.write(reportHtml().replace("</body>", '<script>window.addEventListener("load",()=>window.print())</script></body>'));
    printWindow.document.close();
  }

  function downloadExcel() {
    const url = URL.createObjectURL(new Blob(["﻿", reportHtml()], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `district-officers-${district.replace(/[^a-z0-9]+/gi, "-").toLocaleLowerCase("en") || "district"}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        type="button"
        className="text-left font-semibold text-brand-blue underline decoration-dotted underline-offset-4 hover:text-brand-navy"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        title={`Account Officers in ${district}`}
      >
        {label}
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
              role="presentation"
              onMouseDown={() => setOpen(false)}
              onClick={(event) => event.stopPropagation()}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="flex max-h-[92vh] w-full max-w-[92rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Account Officers</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">{district}</h3>
                    <p className="text-xs text-slate-500">Zone: {zone}. Click a client count for the loan details.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                      <input
                        className="field w-64 pl-9"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search officer, privilege, branch"
                        aria-label="Search officers"
                      />
                    </label>
                    <button type="button" className="btn-secondary" onClick={downloadExcel}>
                      <FileSpreadsheet className="h-4 w-4" /> Download Excel
                    </button>
                    <button type="button" className="btn-primary" onClick={printReport}>
                      <Printer className="h-4 w-4" /> Print
                    </button>
                    <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900" onClick={() => setOpen(false)} aria-label="Close">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </header>
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-600">
                  {rows ? `${visibleRows.length.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} officer(s)` : "Loading..."}
                </div>
                <div className="overflow-auto">
                  {loading && !rows ? <p className="px-5 py-12 text-center font-semibold text-slate-500">Loading district summary...</p> : null}
                  {error ? <p className="px-5 py-12 text-center font-semibold text-red-700">{error}</p> : null}
                  {rows ? (
                    <>
                      <div className={`sticky top-0 z-10 ${ROW_GRID} border-b border-slate-200 bg-white px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
                        <SortHeader label="Account Officer" sortKey="officerName" sort={sort} onSort={toggleSort} />
                        <SortHeader label="Privilege" sortKey="privilege" sort={sort} onSort={toggleSort} />
                        <SortHeader label="Branch" sortKey="branches" sort={sort} onSort={toggleSort} />
                        <SortHeader label="Clients" sortKey="numberOfClients" sort={sort} onSort={toggleSort} align="right" />
                        <SortHeader label="Portfolio" sortKey="portfolio" sort={sort} onSort={toggleSort} align="right" />
                        <SortHeader label="Current" sortKey="current" sort={sort} onSort={toggleSort} align="right" caption />
                        <SortHeader label="Delayed" sortKey="delayed" sort={sort} onSort={toggleSort} align="right" caption />
                        <SortHeader label="Past Due" sortKey="pastDue" sort={sort} onSort={toggleSort} align="right" caption />
                        <SortHeader label="Litigated" sortKey="litigated" sort={sort} onSort={toggleSort} align="right" caption />
                      </div>
                      {visibleRows.map((row) => (
                        <div key={row.officerId} className={`${ROW_GRID} border-b border-slate-100 px-4 py-3 last:border-b-0`}>
                          <span className="font-semibold text-slate-800">{row.officerName}</span>
                          <span className="text-slate-600">{row.privilege}</span>
                          <span className="text-xs text-slate-500">{row.branches}</span>
                          <span className="text-right font-bold text-brand-blue">
                            <BarangayLoanReport
                              officerId={row.officerId}
                              zone={zone}
                              district={district}
                              clientCount={row.numberOfClients}
                              officerName={row.officerName}
                              locationName={`${row.officerName} - ${district}, ${zone}`}
                            />
                          </span>
                          <span className="text-right font-bold text-red-700">{money(row.portfolio)}</span>
                          <SummaryMetric count={row.current} balance={row.currentBalance} />
                          <SummaryMetric count={row.delayed} balance={row.delayedBalance} />
                          <SummaryMetric count={row.pastDue} balance={row.pastDueBalance} />
                          <SummaryMetric count={row.litigated} balance={row.litigatedBalance} />
                        </div>
                      ))}
                      {!visibleRows.length ? <p className="px-4 py-10 text-center font-semibold text-slate-500">{rows.length ? "No officer matches the search." : "No assigned loans in this district."}</p> : null}
                    </>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
  caption
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "right";
  caption?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <span className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        className={`flex w-full items-center gap-1 uppercase tracking-wide transition hover:text-brand-blue ${align === "right" ? "justify-end" : ""} ${active ? "text-brand-blue" : ""}`}
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
      >
        {label}
        {active
          ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
          : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />}
      </button>
      {caption ? <span className="block text-[9px] normal-case tracking-normal">Clients / Principal</span> : null}
    </span>
  );
}

function SummaryMetric({ count, balance }: { count: number; balance: number }) {
  return (
    <span className="text-right">
      <span className="block font-bold text-slate-900">{countValue(count)}</span>
      <span className="mt-0.5 block text-[10px] font-bold text-red-700">{money(balance)}</span>
    </span>
  );
}
