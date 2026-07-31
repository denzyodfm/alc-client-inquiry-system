"use client";

import { FileSpreadsheet, Printer, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type LocationOption = { id: number; province: string; municipality: string; barangay: string };
type LoanRow = {
  id: number;
  clientName: string;
  clientNumber: string;
  contactNumber: string | null;
  loanNumber: string;
  branch: string;
  product: string | null;
  maturityAt: string | null;
  status: string | null;
  principalBalance: number;
  totalBalance: number;
  address: string | null;
  assignedProvince: string | null;
  assignedMunicipality: string | null;
  assignedBarangay: string | null;
};
type Result = {
  rows: LoanRow[];
  locations: LocationOption[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
}

export function UnlinkedLoansManager({
  count,
  onUpdated
}: {
  count: number;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [locationId, setLocationId] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const baseUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    return `/api/location-masterlist/unlinked-loans${params.size ? `?${params}` : ""}`;
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setMessage(null);
    fetch(`${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${page}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load unlinked loans.");
        setResult(data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(error instanceof Error ? error.message : "Unable to load unlinked loans.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [baseUrl, open, page, reload]);

  const locations = result?.locations ?? [];
  const provinces = useMemo(() => Array.from(new Set(locations.map((item) => item.province))), [locations]);
  const municipalities = useMemo(
    () => Array.from(new Set(locations.filter((item) => item.province === province).map((item) => item.municipality))),
    [locations, province]
  );
  const barangays = useMemo(
    () => locations.filter((item) => item.province === province && item.municipality === municipality),
    [locations, municipality, province]
  );
  const exportUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}`;

  function togglePage() {
    const pageIds = result?.rows.map((row) => row.id) ?? [];
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      pageIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function assignSelected() {
    if (!selected.size || !locationId) {
      setMessage("Select one or more loans and a complete masterlist location.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/location-masterlist/unlinked-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanIds: Array.from(selected), locationId: Number(locationId) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Unable to assign the selected loans.");
      setMessage(`${data.count.toLocaleString("en-US")} loan(s) assigned to ${data.location}.`);
      setSelected(new Set());
      setPage(1);
      setResult(null);
      setReload((value) => value + 1);
      onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to assign the selected loans.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="font-bold text-brand-blue underline decoration-dotted underline-offset-2 hover:text-blue-800"
        onClick={() => {
          setOpen(true);
          setPage(1);
        }}
      >
        {count.toLocaleString("en-US")}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3" onClick={() => setOpen(false)}>
          <section className="flex max-h-[95vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Location Masterlist</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">Unlinked Loans — Client and Loan Details</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {search ? `Address/client search: “${search}”` : "All loans without a masterlist location"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a className="btn-secondary" href={`${exportUrl}format=excel`} download><FileSpreadsheet className="h-4 w-4" /> Download Excel</a>
                <a className="btn-secondary" href={`${exportUrl}format=print`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" /> Print</a>
                <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100" type="button" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearch(query.trim());
                  setPage(1);
                  setSelected(new Set());
                }}
              >
                <input className="field min-w-[280px] flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search address, client, client ID, or loan number" />
                <button className="btn-primary" type="submit"><Search className="h-4 w-4" /> Search</button>
                {search ? <button className="btn-secondary" type="button" onClick={() => { setQuery(""); setSearch(""); setPage(1); }}>Clear</button> : null}
              </form>
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                <select className="field" value={province} onChange={(event) => { setProvince(event.target.value); setMunicipality(""); setLocationId(""); }}>
                  <option value="">Select Province</option>
                  {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field" value={municipality} disabled={!province} onChange={(event) => { setMunicipality(event.target.value); setLocationId(""); }}>
                  <option value="">Select City/Municipality</option>
                  {municipalities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field" value={locationId} disabled={!municipality} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">Select Barangay</option>
                  {barangays.map((item) => <option key={item.id} value={item.id}>{item.barangay}</option>)}
                </select>
                <button className="btn-primary" type="button" disabled={saving || !selected.size || !locationId} onClick={assignSelected}>
                  {saving ? "Assigning..." : `Assign ${selected.size.toLocaleString("en-US")} selected`}
                </button>
              </div>
              {message ? <p className={`text-sm font-semibold ${message.includes("assigned to") ? "text-green-700" : "text-red-700"}`}>{message}</p> : null}
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600">
              <span>{result ? `${result.total.toLocaleString("en-US")} matching unlinked loan(s)` : "Loading..."}</span>
              <span>{selected.size.toLocaleString("en-US")} selected</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {loading && !result ? <p className="p-10 text-center font-semibold text-slate-500">Loading unlinked loans...</p> : null}
              {result ? (
                <table className="w-full min-w-[1750px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3"><input type="checkbox" aria-label="Select current page" checked={result.rows.length > 0 && result.rows.every((row) => selected.has(row.id))} onChange={togglePage} /></th>
                      <th className="px-3 py-3">Client</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Loan</th>
                      <th className="px-3 py-3">Branch</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Maturity</th>
                      <th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Principal Balance</th>
                      <th className="px-3 py-3 text-right">Total Balance</th><th className="px-3 py-3">Address</th>
                      <th className="px-3 py-3">Current Assigned Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.rows.map((row) => (
                      <tr key={row.id} className={selected.has(row.id) ? "bg-blue-50" : ""}>
                        <td className="px-3 py-3"><input type="checkbox" checked={selected.has(row.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next; })} /></td>
                        <td className="px-3 py-3"><p className="font-bold text-slate-950">{row.clientName}</p><p className="text-slate-500">{row.clientNumber}</p></td>
                        <td className="px-3 py-3">{row.contactNumber || "-"}</td><td className="px-3 py-3 font-bold text-brand-blue">{row.loanNumber}</td>
                        <td className="px-3 py-3">{row.branch}</td><td className="px-3 py-3">{row.product || "-"}</td>
                        <td className="px-3 py-3">{row.maturityAt ? new Date(row.maturityAt).toLocaleDateString("en-US") : "-"}</td>
                        <td className="px-3 py-3">{row.status || "-"}</td>
                        <td className="px-3 py-3 text-right font-bold text-red-700">{money(row.principalBalance)}</td>
                        <td className="px-3 py-3 text-right font-bold text-red-700">{money(row.totalBalance)}</td>
                        <td className="max-w-md whitespace-normal px-3 py-3">{row.address || "-"}</td>
                        <td className="px-3 py-3">{[row.assignedBarangay, row.assignedMunicipality, row.assignedProvince].filter(Boolean).join(", ") || "-"}</td>
                      </tr>
                    ))}
                    {!result.rows.length ? <tr><td colSpan={12} className="p-10 text-center font-semibold text-slate-500">No matching unlinked loans.</td></tr> : null}
                  </tbody>
                </table>
              ) : null}
            </div>
            <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
              <button className="btn-secondary" type="button" disabled={!result || loading || result.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
              <span className="text-sm font-semibold text-slate-600">{result ? `Page ${result.page} of ${result.totalPages}` : ""}</span>
              <button className="btn-secondary" type="button" disabled={!result || loading || result.page >= result.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
