"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, CheckCircle2, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import type { VerificationBranchProgress, VerificationLoanRow, VerificationSortKey } from "@/lib/loan-verification";

const COLUMNS: Array<{ key: VerificationSortKey; label: string; align?: "right" }> = [
  { key: "clientName", label: "Client" },
  { key: "loanNumber", label: "Loan" },
  { key: "product", label: "Product" },
  { key: "releasedAt", label: "Released" },
  { key: "maturityAt", label: "Maturity" },
  { key: "status", label: "Status" },
  { key: "principalAmount", label: "Principal", align: "right" },
  { key: "principalBalance", label: "Principal Balance", align: "right" }
];

const peso = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString("en-US") : "-";

export function VerifyLoansWorkspace({
  branches,
  totals,
  rows,
  selectedBranchId,
  search,
  page,
  totalPages,
  matching,
  startIndex,
  sort,
  dir
}: {
  branches: VerificationBranchProgress[];
  totals: { loans: number; principalBalance: number; verified: number; flagged: number; workflowTotal: number; percent: number };
  rows: VerificationLoanRow[];
  selectedBranchId: number | null;
  search: string;
  page: number;
  totalPages: number;
  matching: number;
  startIndex: number;
  sort: VerificationSortKey;
  dir: "asc" | "desc";
}) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [savingId, setSavingId] = useState<number | null>(null);
  // A ticked loan leaves this list, so it is hidden as soon as the server confirms rather
  // than waiting for the page to reload underneath the operator.
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  // Verifying is a recorded act, so the tick asks before it is written.
  const [pending, setPending] = useState<VerificationLoanRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  function go(next: { branchId?: number | null; q?: string; page?: number; sort?: VerificationSortKey; dir?: "asc" | "desc" }) {
    const params = new URLSearchParams();
    const branch = next.branchId === undefined ? selectedBranchId : next.branchId;
    const term = next.q === undefined ? search : next.q;
    const sortKey = next.sort ?? sort;
    const sortDir = next.dir ?? dir;
    if (branch) params.set("branchId", String(branch));
    if (term.trim()) params.set("q", term.trim());
    if (next.page && next.page > 1) params.set("page", String(next.page));
    if (sortKey !== "clientName" || sortDir !== "asc") { params.set("sort", sortKey); params.set("dir", sortDir); }
    router.push(`/verify-loans${params.toString() ? `?${params}` : ""}`);
  }

  // Clicking the column already sorted flips its direction; a new column starts ascending.
  function toggleSort(key: VerificationSortKey) {
    go({ sort: key, dir: sort === key && dir === "asc" ? "desc" : "asc", page: 1 });
  }

  async function mark(row: VerificationLoanRow, body: Record<string, unknown>, failureMessage: string) {
    setSavingId(row.id);
    setError(null);
    try {
      const response = await fetch("/api/verify-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: row.id, ...body })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? failureMessage);
      setRemoved((current) => new Set(current).add(row.id));
      setPending(null);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : failureMessage);
    } finally {
      setSavingId(null);
    }
  }

  const rowNumbers = new Map(rows.map((row, index) => [row.id, startIndex + index + 1]));
  const visibleRows = rows.filter((row) => !removed.has(row.id));
  const selectedBranch = branches.find((branch) => branch.branchId === selectedBranchId);

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <TriangleAlert className="mr-2 inline h-4 w-4" />{error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {branches.map((branch) => {
          const active = branch.branchId === selectedBranchId;
          return (
            <button
              key={branch.branchId}
              type="button"
              onClick={() => go({ branchId: active ? null : branch.branchId, page: 1 })}
              aria-pressed={active}
              className={`panel p-4 text-left transition hover:border-brand-blue hover:shadow-md ${active ? "ring-2 ring-brand-blue" : ""}`}
            >
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-green">
                <Building2 className="h-4 w-4" />{branch.branchCode}
              </span>
              <span className="mt-1 block truncate font-bold text-slate-950">{branch.branchName}</span>
              <span className="mt-3 block text-2xl font-extrabold tabular-nums text-brand-blue">
                {branch.loans.toLocaleString("en-US")}
              </span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">loan(s) to verify</span>
              <span className="mt-2 block text-sm font-bold text-red-700">{peso(branch.principalBalance)}</span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">principal balance</span>
              <span className="mt-3 block">
                <span className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Verified</span>
                  <span className="text-[11px] font-extrabold tabular-nums text-brand-green">
                    {branch.verified.toLocaleString("en-US")} / {branch.workflowTotal.toLocaleString("en-US")} · {branch.percent}%
                  </span>
                </span>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-green transition-[width] duration-500"
                    style={{ width: `${branch.percent}%` }}
                  />
                </span>
                {branch.flagged ? (
                  <span className="mt-1 block text-[10px] font-semibold text-amber-700">
                    {branch.flagged.toLocaleString("en-US")} awaiting address correction
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        {!branches.length ? (
          <p className="panel p-8 text-center font-semibold text-slate-500 sm:col-span-2 xl:col-span-4">
            Every outstanding loan in your branches has been verified.
          </p>
        ) : null}
      </section>

      {branches.length ? (
        <p className="text-sm font-semibold text-slate-600">
          {totals.verified.toLocaleString("en-US")} of {totals.workflowTotal.toLocaleString("en-US")} verified ({totals.percent}%) · {totals.loans.toLocaleString("en-US")} awaiting · {peso(totals.principalBalance)} principal balance{totals.flagged ? ` · ${totals.flagged.toLocaleString("en-US")} flagged address` : ""}
          {selectedBranch ? ` · showing ${selectedBranch.branchCode} - ${selectedBranch.branchName}` : " · select a branch card to list its loans"}
        </p>
      ) : null}

      {pending ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm verifying this loan"
          onMouseDown={(event) => { if (event.target === event.currentTarget && savingId === null) setPending(null); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-950">Verify this loan?</h3>
            <p className="mt-2 text-sm text-slate-600">
              <b>{pending.clientName}</b> — loan <b>{pending.loanNumber}</b>, principal balance {peso(pending.principalBalance)}.
              Verifying records your account and the time against it, and moves it to Verified Loans.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary h-9 px-3 text-xs" disabled={savingId !== null} onClick={() => setPending(null)}>Cancel</button>
              <button
                type="button"
                className="btn-primary h-9 px-3 text-xs"
                disabled={savingId !== null}
                onClick={() => void mark(pending, { verified: true }, "Unable to verify this loan.")}
              >
                {savingId !== null ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Confirm &amp; verify
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedBranchId ? (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => { event.preventDefault(); go({ q: query, page: 1 }); }}
            >
              <label className="relative block">
                <span className="sr-only">Search these loans</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="field min-w-[260px] pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search client, loan number, product or status"
                />
              </label>
              <button className="btn-primary" type="submit">Search</button>
              {search ? <button className="btn-secondary" type="button" onClick={() => { setQuery(""); go({ q: "", page: 1 }); }}>Clear</button> : null}
            </form>
            <p className="text-xs font-semibold text-slate-500">
              {matching.toLocaleString("en-US")} loan(s) · page {page} of {totalPages}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-xs">
              <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-right">#</th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""}`}>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide transition hover:text-brand-blue ${sort === column.key ? "text-brand-blue" : ""}`}
                        onClick={() => toggleSort(column.key)}
                        aria-label={`Sort by ${column.label}`}
                      >
                        {column.label}
                        {sort === column.key
                          ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center">Loan Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/50">
                    <td className="px-3 py-3 text-right tabular-nums text-slate-400">{rowNumbers.get(row.id)}</td>
                    <td className="px-3 py-3">
                      <p className="font-bold text-slate-950">{row.clientName}</p>
                      <p className="text-slate-500">{row.clientNumber ?? "-"}</p>
                    </td>
                    <td className="px-3 py-3 font-bold text-brand-blue">{row.loanNumber}</td>
                    <td className="px-3 py-3">{row.product ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3">{shortDate(row.releasedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{shortDate(row.maturityAt)}</td>
                    <td className="px-3 py-3">{row.status ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{peso(row.principalAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-red-700">{peso(row.principalBalance)}</td>
                    <td className="px-3 py-3 text-center">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <span className="sr-only">Mark {row.loanNumber} verified</span>
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-brand-blue"
                          checked={false}
                          disabled={savingId === row.id}
                          onChange={() => setPending(row)}
                        />
                        {savingId === row.id ? <LoaderCircle className="h-4 w-4 animate-spin text-brand-blue" /> : null}
                      </label>
                    </td>
                  </tr>
                ))}
                {!visibleRows.length ? (
                  <tr>
                    <td className="px-3 py-10 text-center font-semibold text-slate-500" colSpan={10}>
                      {rows.length ? (
                        <span className="inline-flex items-center gap-2 text-brand-green">
                          <CheckCircle2 className="h-4 w-4" />Every loan on this page has been verified.
                        </span>
                      ) : "No loans match this search."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary h-9 px-3 text-xs" type="button" disabled={page <= 1} onClick={() => go({ page: 1 })}>First</button>
                <button className="btn-secondary h-9 px-3 text-xs" type="button" disabled={page <= 1} onClick={() => go({ page: page - 1 })}>Prev</button>
                <button className="btn-secondary h-9 px-3 text-xs" type="button" disabled={page >= totalPages} onClick={() => go({ page: page + 1 })}>Next</button>
                <button className="btn-secondary h-9 px-3 text-xs" type="button" disabled={page >= totalPages} onClick={() => go({ page: totalPages })}>Last</button>
              </div>
              <span className="text-xs font-semibold text-slate-500">Page {page} of {totalPages}</span>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
