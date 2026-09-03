"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, Printer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/format";
import { BarangayLoanReport, type LoanReportScope } from "@/components/officer-barangay-loans";

export type AccountOfficerSummaryRow = {
  key: string;
  name: string;
  // Area and privilege, or branch and privilege, depending on the role. Built on the server
  // so this component stays a table and does not need the user directory.
  detail?: string | null;
  // Who the officer reports to. Remedial Officers sit under an Area TL, Loan Officers under
  // a Branch TL, and someone who leads both an area and a branch heads two separate groups -
  // the reporting line differs even though the person does not.
  leaderKey: string;
  leaderName: string;
  leaderKind: string;
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

type SortKey = "name" | "numberOfClients" | "portfolio" | "current" | "delayed" | "pastDue" | "litigated";

// Metric columns show a client count over a principal balance, so they sort on the count
// with the balance breaking ties.
const METRIC_BALANCE: Partial<Record<SortKey, keyof AccountOfficerSummaryRow>> = {
  current: "currentBalance",
  delayed: "delayedBalance",
  pastDue: "pastDueBalance",
  litigated: "litigatedBalance"
};

const GRID_COLUMNS = "grid min-w-[940px] grid-cols-[minmax(220px,1.6fr)_90px_150px_repeat(4,minmax(140px,1fr))] gap-2";

function compareRows(a: AccountOfficerSummaryRow, b: AccountOfficerSummaryRow, key: SortKey) {
  if (key === "name") return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  const difference = (a[key] as number) - (b[key] as number);
  if (difference) return difference;
  const balanceKey = METRIC_BALANCE[key];
  return balanceKey ? (a[balanceKey] as number) - (b[balanceKey] as number) : 0;
}

function countValue(value: number) {
  return value ? value.toLocaleString("en-US") : "-";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] ?? character);
}

function reportTable(
  locationName: string,
  groups: Array<{ key: string; name: string; kind: string; rows: AccountOfficerSummaryRow[] }>
) {
  const reportRows = groups.map((group) => `
    <tr><td class="group" colspan="11">${escapeHtml(group.name.toLocaleUpperCase("en"))}${group.kind ? ` &middot; ${escapeHtml(group.kind)}` : ""}</td></tr>
    ${group.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name.toLocaleUpperCase("en"))}</td>
      <td class="number">${row.numberOfClients}</td>
      <td class="number">${row.portfolio.toFixed(2)}</td>
      <td class="number">${row.current}</td>
      <td class="number">${row.currentBalance.toFixed(2)}</td>
      <td class="number">${row.delayed}</td>
      <td class="number">${row.delayedBalance.toFixed(2)}</td>
      <td class="number">${row.pastDue}</td>
      <td class="number">${row.pastDueBalance.toFixed(2)}</td>
      <td class="number">${row.litigated}</td>
      <td class="number">${row.litigatedBalance.toFixed(2)}</td>
    </tr>`).join("")}`).join("");

  return `
    <h1>Account Officer Summary</h1>
    <h2>${escapeHtml(locationName)}</h2>
    <table>
      <thead>
        <tr>
          <th>Account Officer</th><th>Clients</th><th>Portfolio</th>
          <th>Current Clients</th><th>Current Principal</th>
          <th>Delayed Clients</th><th>Delayed Principal</th>
          <th>Past Due Clients</th><th>Past Due Principal</th>
          <th>Litigated Clients</th><th>Litigated Principal</th>
        </tr>
      </thead>
      <tbody>${reportRows || '<tr><td colspan="11">No linked outstanding loans.</td></tr>'}</tbody>
    </table>`;
}

const reportStyles = `
  body{font-family:Arial,sans-serif;color:#0f172a;padding:24px}
  h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:0 0 18px;color:#475569}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}
  th{background:#f1f5f9;font-size:9px;text-transform:uppercase}
  .number{text-align:right}
  .group{background:#e2e8f0;font-weight:bold;font-size:10px;text-transform:uppercase}
  @page{size:landscape;margin:10mm}
`;

export function AccountOfficerSummary({
  locationName,
  rows,
  scope
}: {
  locationName: string;
  rows: AccountOfficerSummaryRow[];
  // Where this summary was opened from, so a row can narrow the report to one officer within
  // that same place. Without it the quantities stay plain text.
  scope?: Pick<LoanReportScope, "province" | "municipality" | "locationId">;
}) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  function rowScope(row: AccountOfficerSummaryRow): LoanReportScope {
    const base = { ...scope, locationName: `${locationName} — ${row.name}` };
    return row.key === "unassigned"
      ? { ...base, unassignedOnly: true }
      : { ...base, officerId: Number(row.key), officerName: row.name };
  }
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (sort.dir === "asc" ? 1 : -1) * compareRows(a, b, sort.key)),
    [rows, sort]
  );
  // Officers grouped under their team leader, the chosen sort still applying within each
  // group. Groups run in leader-name order; the unassigned bucket has no leader to report
  // to, so it sits at the end rather than under somebody it does not belong to.
  const groups = useMemo(() => {
    const byLeader = new Map<string, { key: string; name: string; kind: string; rows: AccountOfficerSummaryRow[] }>();
    for (const row of sortedRows) {
      const key = row.key === "unassigned" ? "unassigned" : row.leaderKey;
      const group = byLeader.get(key) ?? {
        key,
        name: row.key === "unassigned" ? "Without Account Officer" : row.leaderName,
        kind: row.key === "unassigned" ? "" : row.leaderKind,
        rows: []
      };
      group.rows.push(row);
      byLeader.set(key, group);
    }
    return Array.from(byLeader.values()).sort((a, b) =>
      (a.key === "unassigned" ? 1 : 0) - (b.key === "unassigned" ? 1 : 0) ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" })
    );
  }, [sortedRows]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" });
  }
  const title = `Account Officer Summary - ${locationName}`;
  const excelFileName = useMemo(
    () => `account-officer-summary-${locationName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLocaleLowerCase("en") || "location"}.xls`,
    [locationName]
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function printReport() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>${reportStyles}</style></head><body>${reportTable(locationName, groups)}<script>window.addEventListener("load",()=>window.print())</script></body></html>`);
    printWindow.document.close();
  }

  function downloadExcel() {
    const workbook = `<!doctype html><html><head><meta charset="utf-8"><style>${reportStyles}</style></head><body>${reportTable(locationName, groups)}</body></html>`;
    const url = URL.createObjectURL(new Blob(["\ufeff", workbook], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = excelFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <span className="ml-3 inline-block">
      <button
        type="button"
        className="rounded border border-blue-300 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-blue hover:bg-blue-50"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        Account Officers
      </button>
      {open ? createPortal(
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
            className="flex max-h-[92vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Account Officer Summary</p>
                <h3 className="mt-1 text-lg font-bold text-slate-950">{locationName}</h3>
              </div>
              <div className="flex items-center gap-2">
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
            <div className="overflow-auto">
              <div className={`sticky top-0 z-10 ${GRID_COLUMNS} border-b border-slate-200 bg-white px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
                <SummaryHeader label="Account Officer" sortKey="name" sort={sort} onSort={toggleSort} />
                <SummaryHeader label="Clients" sortKey="numberOfClients" sort={sort} onSort={toggleSort} align="right" />
                <SummaryHeader label="Portfolio" sortKey="portfolio" sort={sort} onSort={toggleSort} align="right" />
                <SummaryHeader label="Current" sortKey="current" sort={sort} onSort={toggleSort} align="right" caption />
                <SummaryHeader label="Delayed" sortKey="delayed" sort={sort} onSort={toggleSort} align="right" caption />
                <SummaryHeader label="Past Due" sortKey="pastDue" sort={sort} onSort={toggleSort} align="right" caption />
                <SummaryHeader label="Litigated" sortKey="litigated" sort={sort} onSort={toggleSort} align="right" caption />
              </div>
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="flex flex-wrap items-baseline gap-x-2 border-y border-slate-200 bg-slate-50 px-4 py-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-900">{group.name}</span>
                    {group.kind ? <span className="text-[10px] font-bold uppercase tracking-wide text-brand-green">{group.kind}</span> : null}
                    <span className="text-[10px] font-semibold text-slate-500">
                      {group.rows.length.toLocaleString("en-US")} officer{group.rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {group.rows.map((row) => (
                <div key={row.key} className={`${GRID_COLUMNS} border-b border-slate-100 px-4 py-3 last:border-b-0`}>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-800">{row.name.toLocaleUpperCase("en")}</span>
                    {row.detail ? <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-blue">{row.detail}</span> : null}
                  </span>
                  <span className="text-right font-bold text-brand-blue">
                    {scope ? <BarangayLoanReport {...rowScope(row)} category="all" clientCount={row.numberOfClients} /> : countValue(row.numberOfClients)}
                  </span>
                  <span className="text-right font-bold text-red-700">{money(row.portfolio)}</span>
                  <SummaryMetric count={row.current} balance={row.currentBalance} category="current" scope={scope ? rowScope(row) : undefined} />
                  <SummaryMetric count={row.delayed} balance={row.delayedBalance} category="delayed" scope={scope ? rowScope(row) : undefined} />
                  <SummaryMetric count={row.pastDue} balance={row.pastDueBalance} category="pastDue" scope={scope ? rowScope(row) : undefined} />
                  <SummaryMetric count={row.litigated} balance={row.litigatedBalance} category="litigated" scope={scope ? rowScope(row) : undefined} />
                </div>
                  ))}
                </div>
              ))}
              {!rows.length ? <p className="px-4 py-10 text-center font-semibold text-slate-500">No linked outstanding loans.</p> : null}
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </span>
  );
}

function SummaryHeader({
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
          ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </button>
      {caption ? <span className="block text-[9px] normal-case tracking-normal">Clients / Principal</span> : null}
    </span>
  );
}

function SummaryMetric({
  count,
  balance,
  category,
  scope
}: {
  count: number;
  balance: number;
  category: "current" | "delayed" | "pastDue" | "litigated";
  scope?: LoanReportScope;
}) {
  return (
    <span className="text-right">
      <span className="block font-bold text-slate-900">
        {scope ? <BarangayLoanReport {...scope} category={category} clientCount={count} /> : countValue(count)}
      </span>
      <span className="mt-0.5 block text-[10px] font-bold text-red-700">{money(balance)}</span>
    </span>
  );
}
