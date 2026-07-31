"use client";

import { useEffect, useMemo, useState } from "react";

type LoanRow = {
  id: number;
  clientName: string;
  clientNumber: string | null;
  contactNumber: string | null;
  loanNumber: string;
  branch: string;
  product: string | null;
  releasedAt: string | null;
  maturityAt: string | null;
  status: string | null;
  originalPrincipal: number;
  principalBalance: number;
  interest: number;
  penalty: number;
  otherCharges: number;
  paidAmount: number;
  totalBalance: number;
  accountOfficer: string;
  address: string | null;
  province: string;
  municipality: string;
  barangay: string;
};

type Result = {
  rows: LoanRow[];
  page: number;
  pageSize: number;
  total: number;
  clientTotal: number;
  totalPages: number;
};

export type LocationReportCategory = "all" | "current" | "delayed" | "pastDue" | "litigated";

const categoryLabels: Record<LocationReportCategory, string> = {
  all: "All Clients",
  current: "Current",
  delayed: "Delayed",
  pastDue: "Past Due",
  litigated: "Litigated"
};

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US") : "-";
}

export function BarangayLoanReport({
  officerId,
  locationId,
  clientCount,
  officerName,
  locationName,
  province,
  municipality,
  assignedOnly = false,
  category = "all"
}: {
  officerId?: number;
  locationId?: number;
  clientCount: number;
  officerName?: string;
  locationName: string;
  province?: string;
  municipality?: string;
  assignedOnly?: boolean;
  category?: LocationReportCategory;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const baseUrl = useMemo(() => {
    const params = new URLSearchParams({ category, context: locationName });
    if (locationId) params.set("locationId", String(locationId));
    if (officerId) params.set("officerId", String(officerId));
    if (province) params.set("province", province);
    if (municipality) params.set("municipality", municipality);
    if (assignedOnly) params.set("assignedOnly", "1");
    return `/api/location-masterlist/officer-loans?${params.toString()}`;
  }, [assignedOnly, category, locationId, locationName, municipality, officerId, province]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${baseUrl}&page=${page}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load loan details.");
        setResult(data);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load loan details.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [baseUrl, open, page]);

  return (
    <>
      <button
        type="button"
        className="font-bold text-brand-blue underline decoration-dotted underline-offset-2 hover:text-blue-800"
        title="View complete loan details"
        data-report-open={open ? "true" : "false"}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPage(1);
          setOpen(true);
        }}
      >
        {clientCount.toLocaleString("en-US")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Client and Loan Information</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{categoryLabels[category]}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">{locationName}</p>
                {officerName ? <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brand-blue">Account Officer: {officerName}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn-secondary" href={`${baseUrl}&format=excel`} download>Download Excel</a>
                <a className="btn-secondary" href={`${baseUrl}&format=print`} target="_blank" rel="noreferrer">Print full report</a>
                <button className="btn-secondary" type="button" onClick={() => setOpen(false)}>Close</button>
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600">
              <span>{result ? `Showing ${((result.page - 1) * result.pageSize + 1).toLocaleString("en-US")}–${Math.min(result.page * result.pageSize, result.total).toLocaleString("en-US")} of ${result.total.toLocaleString("en-US")} loan(s)` : "Loading loan details..."}</span>
              <span>{result ? `Page ${result.page.toLocaleString("en-US")} of ${result.totalPages.toLocaleString("en-US")}` : null}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {loading && !result ? <p className="px-5 py-12 text-center font-semibold text-slate-500">Loading loan details...</p> : null}
              {error ? <p className="px-5 py-12 text-center font-semibold text-red-700">{error}</p> : null}
              {result ? (
                <table className="w-full min-w-[2100px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Client</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Loan</th>
                      <th className="px-3 py-3">Branch</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Released</th>
                      <th className="px-3 py-3">Maturity</th><th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Original Principal</th><th className="px-3 py-3 text-right">Principal Balance</th>
                      <th className="px-3 py-3 text-right">Interest</th><th className="px-3 py-3 text-right">Penalty</th>
                      <th className="px-3 py-3 text-right">Other Charges</th><th className="px-3 py-3 text-right">Paid</th>
                      <th className="px-3 py-3 text-right">Total Balance</th><th className="px-3 py-3">Address</th>
                      <th className="px-3 py-3">Province</th><th className="px-3 py-3">City/Municipality</th><th className="px-3 py-3">Barangay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3"><p className="font-bold text-slate-950">{row.clientName}</p><p className="text-slate-500">{row.clientNumber || "-"}</p></td>
                        <td className="px-3 py-3">{row.contactNumber || "-"}</td><td className="px-3 py-3 font-bold text-brand-blue">{row.loanNumber}</td>
                        <td className="px-3 py-3">{row.branch}</td><td className="px-3 py-3">{row.product || "-"}</td>
                        <td className="px-3 py-3">{date(row.releasedAt)}</td><td className="px-3 py-3">{date(row.maturityAt)}</td>
                        <td className="px-3 py-3">{row.status || "-"}</td><MoneyCell value={row.originalPrincipal} /><MoneyCell value={row.principalBalance} />
                        <MoneyCell value={row.interest} /><MoneyCell value={row.penalty} /><MoneyCell value={row.otherCharges} />
                        <MoneyCell value={row.paidAmount} /><MoneyCell value={row.totalBalance} />
                        <td className="max-w-sm whitespace-normal px-3 py-3">{row.address || "-"}</td>
                        <td className="px-3 py-3">{row.province}</td><td className="px-3 py-3">{row.municipality}</td><td className="px-3 py-3">{row.barangay}</td>
                      </tr>
                    ))}
                    {!result.rows.length ? <tr><td className="px-3 py-10 text-center font-semibold text-slate-500" colSpan={19}>No matching loans found.</td></tr> : null}
                  </tbody>
                </table>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
              <button className="btn-secondary" type="button" disabled={!result || loading || result.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
              <span className="text-sm font-semibold text-slate-600">{loading ? "Loading..." : result ? `Page ${result.page} of ${result.totalPages}` : ""}</span>
              <button className="btn-secondary" type="button" disabled={!result || loading || result.page >= result.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MoneyCell({ value }: { value: number }) {
  return <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-red-700">{money(value)}</td>;
}
