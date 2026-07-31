"use client";

import { FileSpreadsheet, Printer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type AccountOfficerSummaryRow = {
  key: string;
  name: string;
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

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
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

function reportTable(locationName: string, rows: AccountOfficerSummaryRow[]) {
  const reportRows = rows.map((row) => `
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
    </tr>`).join("");

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
  @page{size:landscape;margin:10mm}
`;

export function AccountOfficerSummary({
  locationName,
  rows
}: {
  locationName: string;
  rows: AccountOfficerSummaryRow[];
}) {
  const [open, setOpen] = useState(false);
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
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>${reportStyles}</style></head><body>${reportTable(locationName, rows)}<script>window.addEventListener("load",()=>window.print())</script></body></html>`);
    printWindow.document.close();
  }

  function downloadExcel() {
    const workbook = `<!doctype html><html><head><meta charset="utf-8"><style>${reportStyles}</style></head><body>${reportTable(locationName, rows)}</body></html>`;
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
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"
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
              <div className="grid min-w-[940px] grid-cols-[minmax(180px,1fr)_80px_130px_repeat(4,125px)] gap-2 border-b border-slate-200 bg-white px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <span>Account Officer</span><span className="text-right">Clients</span><span className="text-right">Portfolio</span>
                <SummaryHeader label="Current" /><SummaryHeader label="Delayed" />
                <SummaryHeader label="Past Due" /><SummaryHeader label="Litigated" />
              </div>
              {rows.map((row) => (
                <div key={row.key} className="grid min-w-[940px] grid-cols-[minmax(180px,1fr)_80px_130px_repeat(4,125px)] gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0">
                  <span className="font-semibold text-slate-800">{row.name.toLocaleUpperCase("en")}</span>
                  <span className="text-right font-bold text-brand-blue">{row.numberOfClients.toLocaleString("en-US")}</span>
                  <span className="text-right font-bold text-red-700">{money(row.portfolio)}</span>
                  <SummaryMetric count={row.current} balance={row.currentBalance} />
                  <SummaryMetric count={row.delayed} balance={row.delayedBalance} />
                  <SummaryMetric count={row.pastDue} balance={row.pastDueBalance} />
                  <SummaryMetric count={row.litigated} balance={row.litigatedBalance} />
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

function SummaryHeader({ label }: { label: string }) {
  return <span className="text-right"><span className="block">{label}</span><span className="block text-[9px] normal-case tracking-normal">Clients / Principal</span></span>;
}

function SummaryMetric({ count, balance }: { count: number; balance: number }) {
  return (
    <span className="text-right">
      <span className="block font-bold text-slate-900">{count.toLocaleString("en-US")}</span>
      <span className="mt-0.5 block text-[10px] font-bold text-red-700">{money(balance)}</span>
    </span>
  );
}
