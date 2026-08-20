"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { DistrictOfficerSummary } from "@/components/district-officer-summary";

export type SummaryMetrics = {
  numberOfClients: number | null;
  portfolio: number | null;
  current: number | null;
  currentBalance: number | null;
  delayed: number | null;
  delayedBalance: number | null;
  pastDue: number | null;
  pastDueBalance: number | null;
  litigated: number | null;
  litigatedBalance: number | null;
};

export type SummaryRow = {
  key: string;
  name: string;
  metrics: SummaryMetrics;
  children?: SummaryRow[];
  // Set on district rows so the name opens the officers carrying that district's loans.
  zone?: string;
  district?: string;
};

type SortKey = "name" | "numberOfClients" | "portfolio" | "current" | "delayed" | "pastDue" | "litigated";

// Count columns show clients over principal, so they sort on the count with the balance
// breaking ties.
const BALANCE_OF: Partial<Record<SortKey, keyof SummaryMetrics>> = {
  current: "currentBalance",
  delayed: "delayedBalance",
  pastDue: "pastDueBalance",
  litigated: "litigatedBalance"
};

const ROW_GRID = "grid min-w-[1350px] grid-cols-[minmax(300px,1fr)_100px_160px_repeat(4,150px)] items-center";

function count(value: number | null) {
  return value ? value.toLocaleString("en-US") : "-";
}

function money(value: number | null) {
  if (value === null) return "—";
  if (!value) return "-";
  return value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
}

function compareRows(a: SummaryRow, b: SummaryRow, key: SortKey) {
  if (key === "name") return a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });
  const difference = (a.metrics[key] ?? 0) - (b.metrics[key] ?? 0);
  if (difference) return difference;
  const balanceKey = BALANCE_OF[key];
  return balanceKey ? (a.metrics[balanceKey] ?? 0) - (b.metrics[balanceKey] ?? 0) : 0;
}

export function AssignmentSummaryTable({
  title,
  label,
  childLabel,
  rows,
  total,
  description
}: {
  title: string;
  label: string;
  childLabel?: string;
  rows: SummaryRow[];
  total: SummaryMetrics;
  description?: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "portfolio", dir: "desc" });
  const sortedRows = useMemo(() => {
    const direction = sort.dir === "asc" ? 1 : -1;
    const order = (list: SummaryRow[]): SummaryRow[] => [...list]
      .sort((a, b) => direction * compareRows(a, b, sort.key))
      .map((row) => (row.children?.length ? { ...row, children: order(row.children) } : row));
    return order(rows);
  }, [rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" });
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">
          {description ?? `Assigned outstanding-loan portfolio summarized by ${label}.`}
          {" "}The grand total counts each client only once.
        </p>
      </div>
      <div className="overflow-x-auto text-sm">
        <div className={`${ROW_GRID} bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
          <SortHeader label={childLabel ? `${label} / ${childLabel}` : label} sortKey="name" sort={sort} onSort={toggleSort} />
          <SortHeader label="No. of Clients" sortKey="numberOfClients" sort={sort} onSort={toggleSort} align="right" />
          <SortHeader label="Portfolio" sortKey="portfolio" sort={sort} onSort={toggleSort} align="right" />
          <SortHeader label="Current" sortKey="current" sort={sort} onSort={toggleSort} align="right" caption />
          <SortHeader label="Delayed" sortKey="delayed" sort={sort} onSort={toggleSort} align="right" caption />
          <SortHeader label="Past Due" sortKey="pastDue" sort={sort} onSort={toggleSort} align="right" caption />
          <SortHeader label="Litigated" sortKey="litigated" sort={sort} onSort={toggleSort} align="right" caption />
        </div>
        <div className="min-w-[1350px] divide-y divide-slate-100">
          {sortedRows.map((row) => (row.children?.length ? (
            <details key={row.key} className="group/summary">
              <summary className={`${ROW_GRID} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/summary:bg-blue-50`}>
                <span className="font-bold text-slate-900 before:mr-2 before:inline-block before:text-[10px] before:content-['▶'] group-open/summary:before:rotate-90">
                  {row.name}
                </span>
                <MetricCells metrics={row.metrics} />
              </summary>
              <div className="bg-white/60">
                {row.children.map((child) => (
                  <div key={child.key} className={`${ROW_GRID} border-t border-slate-100 px-4 py-3 pl-10`}>
                    <span className="text-slate-700">
                      {child.zone && child.district
                        ? <DistrictOfficerSummary zone={child.zone} district={child.district} label={child.name} />
                        : child.name}
                    </span>
                    <MetricCells metrics={child.metrics} />
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <div key={row.key} className={`${ROW_GRID} px-4 py-3`}>
              <span className="font-bold text-slate-900">{row.name}</span>
              <MetricCells metrics={row.metrics} />
            </div>
          )))}
          {!rows.length ? <p className="px-4 py-8 text-center font-semibold text-slate-500">No assigned {label.toLocaleLowerCase("en-US")} data found.</p> : null}
        </div>
        {rows.length ? (
          <div className={`${ROW_GRID} border-t-2 border-slate-300 bg-slate-50 px-4 py-3 font-extrabold text-slate-950`}>
            <span>Grand Total</span>
            <MetricCells metrics={total} />
          </div>
        ) : null}
      </div>
    </section>
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
      {caption ? <span className="block text-[9px] font-semibold normal-case tracking-normal">Clients / Principal</span> : null}
    </span>
  );
}

function MetricCells({ metrics }: { metrics: SummaryMetrics }) {
  return (
    <>
      <span className="text-right font-bold text-brand-blue">{count(metrics.numberOfClients)}</span>
      <span className="text-right font-bold text-red-700">{money(metrics.portfolio)}</span>
      <StatusMetric countValue={metrics.current} balance={metrics.currentBalance} />
      <StatusMetric countValue={metrics.delayed} balance={metrics.delayedBalance} />
      <StatusMetric countValue={metrics.pastDue} balance={metrics.pastDueBalance} />
      <StatusMetric countValue={metrics.litigated} balance={metrics.litigatedBalance} />
    </>
  );
}

function StatusMetric({ countValue, balance }: { countValue: number | null; balance: number | null }) {
  return (
    <span className="text-right">
      <span className="block font-bold text-slate-900">{count(countValue)}</span>
      <span className="mt-0.5 block text-[11px] font-bold text-red-700">{money(balance)}</span>
    </span>
  );
}
