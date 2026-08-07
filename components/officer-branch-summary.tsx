"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BarangayLoanReport } from "@/components/officer-barangay-loans";
import { money } from "@/lib/format";

type TotalsSummary = {
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

type BranchSummaryRow = TotalsSummary & {
  branchId: number;
  branchName: string;
  branchCode: string;
};

export function OfficerBranchSummary({ officerId, officerName }: { officerId: number; officerName: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BranchSummaryRow[] | null>(null);
  const [totals, setTotals] = useState<TotalsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/location-masterlist/officer-branch-summary?officerId=${officerId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load branch summary.");
        setRows(data.branches);
        setTotals(data.totals);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load branch summary.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [officerId, open]);

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
        Branch
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
                aria-label={`${officerName} - Loans by Branch`}
                className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Loans by Branch</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">{officerName}</h3>
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </header>
                <div className="overflow-auto">
                  {loading && !rows ? <p className="px-5 py-12 text-center font-semibold text-slate-500">Loading branch summary...</p> : null}
                  {error ? <p className="px-5 py-12 text-center font-semibold text-red-700">{error}</p> : null}
                  {rows ? (
                    <>
                      <div className="sticky top-0 z-10 grid min-w-[980px] grid-cols-[minmax(180px,1fr)_100px_130px_repeat(4,125px)] gap-2 border-b border-slate-200 bg-white px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">
                        <span>Branch</span>
                        <span className="text-right">Clients</span>
                        <span className="text-right">Portfolio</span>
                        <SummaryHeader label="Current" />
                        <SummaryHeader label="Delayed" />
                        <SummaryHeader label="Past Due" />
                        <SummaryHeader label="Litigated" />
                      </div>
                      {rows.map((row) => (
                        <div
                          key={row.branchId}
                          className="grid min-w-[980px] grid-cols-[minmax(180px,1fr)_100px_130px_repeat(4,125px)] items-center gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0"
                        >
                          <span className="font-semibold text-slate-800">
                            {row.branchCode} - {row.branchName}
                          </span>
                          <span className="text-right font-bold text-brand-blue">
                            <BarangayLoanReport
                              officerId={officerId}
                              branchId={row.branchId}
                              clientCount={row.numberOfClients}
                              officerName={officerName}
                              locationName={`${officerName} - ${row.branchCode} ${row.branchName}`}
                            />
                          </span>
                          <span className="text-right font-bold text-red-700">{money(row.portfolio)}</span>
                          <SummaryMetric count={row.current} balance={row.currentBalance} />
                          <SummaryMetric count={row.delayed} balance={row.delayedBalance} />
                          <SummaryMetric count={row.pastDue} balance={row.pastDueBalance} />
                          <SummaryMetric count={row.litigated} balance={row.litigatedBalance} />
                        </div>
                      ))}
                      {!rows.length ? <p className="px-4 py-10 text-center font-semibold text-slate-500">No linked outstanding loans.</p> : null}
                      {rows.length && totals ? (
                        <div className="grid min-w-[980px] grid-cols-[minmax(180px,1fr)_100px_130px_repeat(4,125px)] items-center gap-2 border-t-2 border-slate-300 bg-slate-50 px-4 py-3 font-extrabold text-slate-950">
                          <span>Total</span>
                          <span className="text-right text-brand-blue">
                            <BarangayLoanReport
                              officerId={officerId}
                              clientCount={totals.numberOfClients}
                              officerName={officerName}
                              locationName={`${officerName} - All Branches`}
                            />
                          </span>
                          <span className="text-right text-red-700">{money(totals.portfolio)}</span>
                          <SummaryMetric count={totals.current} balance={totals.currentBalance} />
                          <SummaryMetric count={totals.delayed} balance={totals.delayedBalance} />
                          <SummaryMetric count={totals.pastDue} balance={totals.pastDueBalance} />
                          <SummaryMetric count={totals.litigated} balance={totals.litigatedBalance} />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

function SummaryHeader({ label }: { label: string }) {
  return (
    <span className="text-right">
      <span className="block">{label}</span>
    </span>
  );
}

function SummaryMetric({ count, balance }: { count: number; balance: number }) {
  return (
    <span className="text-right">
      <span className="block font-bold text-slate-950">{count.toLocaleString("en-US")}</span>
      <span className="block text-[10px] font-semibold text-red-700">{money(balance)}</span>
    </span>
  );
}
