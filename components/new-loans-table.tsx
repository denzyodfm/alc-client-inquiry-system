"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type NewLoanTableRow = {
  id: number;
  clientName: string;
  clientNumber: string | null;
  contactNumber: string | null;
  address: string | null;
  loanNumber: string;
  product: string | null;
  branch: string;
  branchId: number;
  branchAo: string;
  grantedAt: string | null;
  maturityAt: string | null;
  principalAmount: number;
  balance: number;
  status: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
};

export type AssignableOfficer = {
  id: number;
  name: string;
  privilege: string;
  allBranches: boolean;
  branchIds: number[];
};

type SortKey = "clientName" | "loanNumber" | "branch" | "product" | "grantedAt" | "maturityAt" | "principalAmount" | "balance" | "status" | "branchAo" | "assignedToName";

const NUMERIC_KEYS: SortKey[] = ["principalAmount", "balance"];
const DATE_KEYS: SortKey[] = ["grantedAt", "maturityAt"];

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "clientName", label: "Client" },
  { key: "loanNumber", label: "Loan" },
  { key: "branch", label: "Branch" },
  { key: "product", label: "Product" },
  { key: "grantedAt", label: "Date Granted" },
  { key: "maturityAt", label: "Maturity" },
  { key: "principalAmount", label: "Principal", align: "right" },
  { key: "balance", label: "Balance", align: "right" },
  { key: "status", label: "Status" },
  { key: "branchAo", label: "Branch AO" },
  { key: "assignedToName", label: "Assigned To" }
];

function money(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US") : "-";
}

export function NewLoansTable({ rows, officers }: { rows: NewLoanTableRow[]; officers: AssignableOfficer[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "grantedAt", dir: "desc" });
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, string>>({});

  const sortedRows = useMemo(() => {
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (NUMERIC_KEYS.includes(sort.key)) return direction * ((left as number) - (right as number));
      if (DATE_KEYS.includes(sort.key)) {
        return direction * ((left ? new Date(left as string).getTime() : 0) - (right ? new Date(right as string).getTime() : 0));
      }
      return direction * String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true, sensitivity: "base" });
    });
  }, [rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
      : { key, dir: NUMERIC_KEYS.includes(key) || DATE_KEYS.includes(key) ? "desc" : "asc" });
  }

  // Only officers who can reach the loan's branch may take it on.
  function officersFor(branchId: number) {
    return officers.filter((officer) => officer.allBranches || officer.branchIds.includes(branchId));
  }

  async function assign(row: NewLoanTableRow) {
    const assignedToId = Number(choice[row.id] ?? row.assignedToId ?? 0);
    if (!Number.isInteger(assignedToId) || assignedToId <= 0) {
      setError("Choose an officer first.");
      return;
    }
    setSavingId(row.id);
    setError(null);
    try {
      const response = await fetch("/api/new-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: row.id, assignedToId })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to assign this loan.");
      setDone((current) => ({ ...current, [row.id]: data?.officerName ?? "Assigned" }));
      router.refresh();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Unable to assign this loan.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
      <div className="panel max-h-[calc(100vh-24rem)] min-h-64 overflow-auto">
        <table className="w-full min-w-[1700px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-blue-100 uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-2 py-2">#</th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={`px-2 py-2 ${column.align === "right" ? "text-right" : ""}`}
                  aria-sort={sort.key === column.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className={`flex w-full items-center gap-1 uppercase tracking-wide transition hover:text-brand-blue ${column.align === "right" ? "justify-end" : ""} ${sort.key === column.key ? "text-brand-blue" : ""}`}
                    onClick={() => toggleSort(column.key)}
                    title={`Sort by ${column.label}`}
                  >
                    {column.label}
                    {sort.key === column.key
                      ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
                      : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />}
                  </button>
                </th>
              ))}
              <th className="min-w-[280px] px-2 py-2 print:hidden">Assign to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((row, index) => {
              const available = officersFor(row.branchId);
              return (
                <tr key={row.id}>
                  <td className="px-2 py-2 text-slate-400">{index + 1}</td>
                  <td className="px-2 py-2">
                    <span className="block font-bold text-slate-900">{row.clientName}</span>
                    <span className="text-slate-500">{row.clientNumber || "-"}{row.contactNumber ? ` | ${row.contactNumber}` : ""}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-brand-blue">{row.loanNumber}</td>
                  <td className="whitespace-nowrap px-2 py-2">{row.branch}</td>
                  <td className="whitespace-nowrap px-2 py-2">{row.product || "-"}</td>
                  <td className="whitespace-nowrap px-2 py-2">{shortDate(row.grantedAt)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{shortDate(row.maturityAt)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">{money(row.principalAmount)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-red-700">{money(row.balance)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{row.status || "-"}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-700">{row.branchAo}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {done[row.id]
                      ? <span className="inline-flex items-center gap-1 font-semibold text-brand-green"><CheckCircle2 className="h-3.5 w-3.5" />{done[row.id]}</span>
                      : row.assignedToName ?? <span className="font-semibold text-amber-600">Unassigned</span>}
                  </td>
                  <td className="px-2 py-2 print:hidden">
                    <div className="flex min-w-[260px] items-center gap-2">
                      <select
                        className="field h-8 flex-1 px-2 py-0 text-xs"
                        value={choice[row.id] ?? (row.assignedToId ? String(row.assignedToId) : "")}
                        onChange={(event) => setChoice((current) => ({ ...current, [row.id]: event.target.value }))}
                      >
                        <option value="">Select officer</option>
                        {available.map((officer) => (
                          <option key={officer.id} value={officer.id}>{officer.name}{officer.privilege ? ` (${officer.privilege})` : ""}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-secondary h-8 px-2 text-xs"
                        onClick={() => assign(row)}
                        disabled={savingId === row.id || !available.length}
                      >
                        {savingId === row.id ? "Assigning..." : "Assign"}
                      </button>
                    </div>
                    {!available.length ? <span className="text-[10px] text-red-600">No officer has access to this branch.</span> : null}
                  </td>
                </tr>
              );
            })}
            {!sortedRows.length ? (
              <tr><td className="p-8 text-center font-semibold text-slate-500" colSpan={13}>No new or unassigned loans in this period.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
