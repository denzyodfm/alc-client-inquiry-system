"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

export type RediscountingTableRow = {
  id: number;
  borrower: string;
  address: string;
  subBorrowerType: string;
  noteDate: string | null;
  dueDate: string | null;
  subPnNumber: string;
  faceAmount: number;
  outstandingBalance: number;
  loanValue: number;
  financePurpose: string;
  loanSecurity: string;
  loanSecurityName: string;
  branchShort: string;
};

type SortKey = keyof Pick<
  RediscountingTableRow,
  "borrower" | "address" | "subBorrowerType" | "noteDate" | "dueDate" | "subPnNumber" | "faceAmount" | "outstandingBalance" | "loanValue" | "financePurpose" | "loanSecurity" | "branchShort"
>;

const NUMERIC_KEYS: SortKey[] = ["faceAmount", "outstandingBalance", "loanValue"];

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "borrower", label: "Name of Borrower" },
  { key: "address", label: "Address" },
  { key: "subBorrowerType", label: "Type of Sub-Borrower" },
  { key: "noteDate", label: "Date of Note" },
  { key: "dueDate", label: "Due Date" },
  { key: "subPnNumber", label: "Sub PN Number" },
  { key: "faceAmount", label: "Loan Face Amount", align: "right" },
  { key: "outstandingBalance", label: "O/S Balance", align: "right" },
  { key: "loanValue", label: "Loan Value", align: "right" }
];

function money(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function reportDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" }) : "-";
}

export function RediscountingTable({
  rows,
  constants,
  totals
}: {
  rows: RediscountingTableRow[];
  constants: { agriculture: string; economicActivity: string; assetSize: string; collateral: string };
  totals: { count: number; faceAmount: number; outstandingBalance: number; loanValue: number };
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "borrower", dir: "asc" });

  const sortedRows = useMemo(() => {
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (NUMERIC_KEYS.includes(sort.key)) return direction * ((left as number) - (right as number));
      if (sort.key === "noteDate" || sort.key === "dueDate") {
        const leftTime = left ? new Date(left as string).getTime() : 0;
        const rightTime = right ? new Date(right as string).getTime() : 0;
        return direction * (leftTime - rightTime);
      }
      return direction * String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true, sensitivity: "base" });
    });
  }, [rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
      : { key, dir: NUMERIC_KEYS.includes(key) ? "desc" : "asc" });
  }

  const header = (key: SortKey, label: string, align?: "right") => (
    <th key={key} className={`px-2 py-2 ${align === "right" ? "text-right" : ""}`} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`flex w-full items-center gap-1 uppercase tracking-wide transition hover:text-brand-blue ${align === "right" ? "justify-end" : ""} ${sort.key === key ? "text-brand-blue" : ""}`}
        onClick={() => toggleSort(key)}
        title={`Sort by ${label}`}
      >
        {label}
        {sort.key === key
          ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
          : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />}
      </button>
    </th>
  );

  return (
    <div className="panel max-h-[calc(100vh-26rem)] min-h-64 overflow-auto">
      <table className="w-full min-w-[2000px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-orange-100 uppercase tracking-wide text-slate-700">
          <tr>
            <th className="px-2 py-2">#</th>
            {COLUMNS.map((column) => header(column.key, column.label, column.align))}
            {header("financePurpose", "Finance Purpose")}
            <th className="px-2 py-2">Agri/Non Agri</th>
            <th className="px-2 py-2">Econ Activity</th>
            <th className="px-2 py-2">Asset Size</th>
            <th className="px-2 py-2">Collateral</th>
            {header("loanSecurity", "Loan Sec")}
            {header("branchShort", "Branch")}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedRows.map((row, index) => (
            <tr key={row.id}>
              <td className="px-2 py-2 text-slate-400">{index + 1}</td>
              <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-900">{row.borrower}</td>
              <td className="max-w-sm whitespace-normal px-2 py-2 text-slate-600">{row.address || "-"}</td>
              <td className="px-2 py-2">{row.subBorrowerType}</td>
              <td className="whitespace-nowrap px-2 py-2">{reportDate(row.noteDate)}</td>
              <td className="whitespace-nowrap px-2 py-2">{reportDate(row.dueDate)}</td>
              <td className="whitespace-nowrap px-2 py-2 font-semibold text-brand-blue">{row.subPnNumber}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right">{money(row.faceAmount)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{money(row.outstandingBalance)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-bold text-red-700">{money(row.loanValue)}</td>
              <td className="whitespace-nowrap px-2 py-2">{row.financePurpose}</td>
              <td className="px-2 py-2">{constants.agriculture}</td>
              <td className="px-2 py-2">{constants.economicActivity}</td>
              <td className="px-2 py-2">{constants.assetSize}</td>
              <td className="whitespace-nowrap px-2 py-2">{constants.collateral}</td>
              <td className="px-2 py-2" title={row.loanSecurityName}>{row.loanSecurity}</td>
              <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-700">{row.branchShort}</td>
            </tr>
          ))}
          {!sortedRows.length ? (
            <tr><td className="p-8 text-center font-semibold text-slate-500" colSpan={17}>No outstanding loans match these filters.</td></tr>
          ) : null}
        </tbody>
        {sortedRows.length ? (
          <tfoot className="sticky bottom-0 bg-sky-100 font-bold text-slate-950">
            <tr>
              <td className="px-2 py-2" colSpan={7}>TOTALS ==&gt; {totals.count.toLocaleString("en-US")} loan(s)</td>
              <td className="whitespace-nowrap px-2 py-2 text-right">{money(totals.faceAmount)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right">{money(totals.outstandingBalance)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right">{money(totals.loanValue)}</td>
              <td className="px-2 py-2" colSpan={7}>END OF REPORT</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
