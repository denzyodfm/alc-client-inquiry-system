"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { LazyLoanDetailLink } from "@/components/lazy-loan-detail-link";
import { ClientAddressPinEditor, type ClientAddressPin } from "@/components/client-address-pin-editor";
import { barangayOptions, municipalityOptions, provinceOptions, withCurrentValue, type LocationOption } from "@/lib/location-options";

type LoanRow = {
  id: number;
  clientId: number;
  branchId: number;
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
  remoteBalance: number | null;
  accountOfficer: string;
  assignedOfficerId: number | null;
  address: string | null;
  addressLatitude: number | null;
  addressLongitude: number | null;
  addressAccuracy: number | null;
  notValidAddress: boolean;
};

type OfficerOption = { id: number; name: string; allBranches: boolean; branchIds: number[] };

type Result = {
  rows: LoanRow[];
  // Set only when the report covers one officer; a report spanning several has no single role.
  scopedOfficerRole: string | null;
  clientStartIndex: number;
  clientsOnPage: number;
  officers: OfficerOption[];
  canAssignOfficer: boolean;
  canFlagAddress: boolean;
  locations: LocationOption[];
  page: number;
  pageSize: number;
  total: number;
  clientTotal: number;
  totalPages: number;
};

export type LocationReportCategory = "all" | "current" | "delayed" | "pastDue" | "litigated";

// Which slice of the portfolio a report opens on. Every pivot row that shows a quantity
// supplies one of these, so any row can open the same loan-details window. At least one
// narrowing field must be set - the API rejects a scope that would select everything.
export type LoanReportScope = {
  officerId?: number;
  officerIds?: number[];
  areaTeamLeaderId?: number | "unassigned";
  locationId?: number;
  branchId?: number;
  officerName?: string;
  locationName: string;
  province?: string;
  municipality?: string;
  zone?: string;
  district?: string;
  assignedOnly?: boolean;
  unassignedOnly?: boolean;
};

type SortKey =
  | "clientName" | "contactNumber" | "loanNumber" | "branch" | "product" | "releasedAt" | "maturityAt" | "status"
  | "originalPrincipal" | "principalBalance" | "interest" | "penalty" | "otherCharges" | "paidAmount"
  | "totalBalance" | "remoteBalance" | "address";

// Sorting runs on the server so it covers every page, not just the rows on screen.
const SORT_COLUMNS: Array<{ key: SortKey; label: string; align?: "right"; title?: string }> = [
  { key: "clientName", label: "Client" },
  { key: "contactNumber", label: "Contact" },
  { key: "loanNumber", label: "Loan" },
  { key: "branch", label: "Branch" },
  { key: "product", label: "Product" },
  { key: "releasedAt", label: "Released" },
  { key: "maturityAt", label: "Maturity" },
  { key: "status", label: "Status" },
  { key: "originalPrincipal", label: "Original Principal", align: "right" },
  { key: "principalBalance", label: "Principal Balance", align: "right" },
  { key: "interest", label: "Interest", align: "right" },
  { key: "penalty", label: "Penalty", align: "right" },
  { key: "otherCharges", label: "Other Charges", align: "right" },
  { key: "paidAmount", label: "Paid", align: "right" },
  { key: "totalBalance", label: "Total Balance", align: "right", title: "Sum of the amortization schedule's total due minus principal and interest paid so far. May differ from Remote Balance, the branch's live figure." },
  { key: "remoteBalance", label: "Remote Balance", align: "right", title: "The branch's own live balance, pulled directly from the source database" },
  { key: "address", label: "Address" }
];

const categoryLabels: Record<LocationReportCategory, string> = {
  all: "All Clients",
  current: "Current",
  delayed: "Delayed",
  pastDue: "Past Due",
  litigated: "Litigated"
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US") : "-";
}

export function BarangayLoanReport({
  officerId,
  officerIds,
  areaTeamLeaderId,
  locationId,
  branchId,
  clientCount,
  officerName,
  locationName,
  province,
  municipality,
  zone,
  district,
  assignedOnly = false,
  unassignedOnly = false,
  category = "all",
  tone = "blue"
}: {
  officerId?: number;
  officerIds?: number[];
  areaTeamLeaderId?: number | "unassigned";
  locationId?: number;
  branchId?: number;
  clientCount: number;
  officerName?: string;
  locationName: string;
  province?: string;
  municipality?: string;
  zone?: string;
  district?: string;
  assignedOnly?: boolean;
  unassignedOnly?: boolean;
  category?: LocationReportCategory;
  // The With Account Officer column is green, so its link matches the column it sits in.
  tone?: "blue" | "green" | "amber";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "clientName", dir: "asc" });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [selectedOfficers, setSelectedOfficers] = useState<Record<number, string>>({});
  const [savingLoanId, setSavingLoanId] = useState<number | null>(null);
  const [savedPins, setSavedPins] = useState<Record<number, ClientAddressPin>>({});
  const [addressFlags, setAddressFlags] = useState<Record<number, boolean>>({});
  const [flaggingId, setFlaggingId] = useState<number | null>(null);
  // Location picked per row, seeded blank: the report shows loans from many places at once,
  // so there is no single current value to start from.
  const [rowLocation, setRowLocation] = useState<Record<number, { province: string; municipality: string; barangay: string }>>({});
  // Flagged rows leave this list - they belong to Invalid Address now - and the tick asks
  // first, since it moves the loan out from under whoever is reading the report.
  const [flagPending, setFlagPending] = useState<LoanRow | null>(null);
  const [movedClients, setMovedClients] = useState<Set<number>>(new Set());
  // Column filter: which column to search, and what to look for in it. The typed value is
  // debounced into filterValue so the report is not refetched on every keystroke.
  const [filterKey, setFilterKey] = useState<SortKey>("clientName");
  const [filterDraft, setFilterDraft] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const officerIdsKey = officerIds?.length ? officerIds.join(",") : "";

  useEffect(() => {
    const timer = setTimeout(() => setFilterValue(filterDraft.trim()), 300);
    return () => clearTimeout(timer);
  }, [filterDraft]);

  useEffect(() => { setPage(1); }, [filterKey, filterValue]);

  const baseUrl = useMemo(() => {
    const params = new URLSearchParams({ category, context: locationName, sort: sort.key, dir: sort.dir });
    if (locationId) params.set("locationId", String(locationId));
    if (officerId) params.set("officerId", String(officerId));
    if (officerIdsKey) params.set("officerIds", officerIdsKey);
    if (branchId) params.set("branchId", String(branchId));
    if (filterValue) {
      params.set("filterKey", filterKey);
      params.set("filterValue", filterValue);
    }
    if (areaTeamLeaderId !== undefined) params.set("areaTeamLeaderId", String(areaTeamLeaderId));
    if (province) params.set("province", province);
    if (municipality) params.set("municipality", municipality);
    if (zone) params.set("zone", zone);
    if (district) params.set("district", district);
    if (assignedOnly) params.set("assignedOnly", "1");
    if (unassignedOnly) params.set("unassignedOnly", "1");
    return `/api/location-masterlist/officer-loans?${params.toString()}`;
  }, [areaTeamLeaderId, assignedOnly, unassignedOnly, branchId, category, district, filterKey, filterValue, locationId, locationName, municipality, officerId, officerIdsKey, province, sort, zone]);

  function toggleSort(key: SortKey) {
    setPage(1);
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

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
  }, [baseUrl, open, page, reload]);

  function locationFor(row: LoanRow) {
    return rowLocation[row.id] ?? { province: "", municipality: "", barangay: "" };
  }

  function updateLocation(row: LoanRow, field: "province" | "municipality" | "barangay", value: string) {
    setRowLocation((current) => {
      const existing = current[row.id] ?? { province: "", municipality: "", barangay: "" };
      const next = field === "province"
        ? { province: value, municipality: "", barangay: "" }
        : field === "municipality"
          ? { ...existing, municipality: value, barangay: "" }
          : { ...existing, barangay: value };
      return { ...current, [row.id]: next };
    });
  }

  async function assignOfficer(row: LoanRow) {
    const assignedToId = Number(selectedOfficers[row.id] ?? row.assignedOfficerId);
    const place = locationFor(row);
    const hasLocation = Boolean(place.province && place.municipality && place.barangay);
    if ((!Number.isInteger(assignedToId) || assignedToId <= 0) && !hasLocation) {
      setError("Select an Account Officer or a complete location.");
      return;
    }
    setSavingLoanId(row.id);
    setError(null);
    try {
      const response = await fetch("/api/location-masterlist/officer-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: row.id, assignedToId: assignedToId > 0 ? assignedToId : 0, ...(hasLocation ? place : {}) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Unable to assign the Account Officer.");
      setReload((value) => value + 1);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to assign the Account Officer.");
    } finally {
      setSavingLoanId(null);
    }
  }

  // Raising the flag sends the loan to Taggings -> Invalid Address for re-tagging; the row
  // stays here so the reader keeps their place in the report.
  async function toggleAddressFlag(row: LoanRow, next: boolean) {
    setFlaggingId(row.id);
    setError(null);
    try {
      const response = await fetch("/api/invalid-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: row.id, notValidAddress: next })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to update the address flag.");
      setAddressFlags((current) => ({ ...current, [row.id]: next }));
      if (next) setMovedClients((current) => new Set(current).add(row.clientId));
      setFlagPending(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update the address flag.");
    } finally {
      setFlaggingId(null);
    }
  }

  // How many of this client's loans are on screen, so the dialog can say what will move.
  function clientLoanCount(row: LoanRow) {
    return (result?.rows ?? []).filter((item) => item.clientId === row.clientId).length;
  }

  const visibleReportRows = (result?.rows ?? []).filter((row) => !movedClients.has(row.clientId));

  if (clientCount === 0) return <span>-</span>;

  return (
    <>
      <button
        type="button"
        className={`font-bold underline decoration-dotted underline-offset-2 ${tone === "green" ? "text-brand-green hover:text-emerald-800" : tone === "amber" ? "text-amber-700 hover:text-amber-900" : "text-brand-blue hover:text-blue-800"}`}
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
      {flagPending ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm flagging this address"
          onMouseDown={(event) => { if (event.target === event.currentTarget && flaggingId === null) setFlagPending(null); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-950">Flag this address as invalid?</h3>
            <p className="mt-2 text-sm text-slate-600">
              <b>{flagPending.clientName}</b> — loan <b>{flagPending.loanNumber}</b>.
              {flagPending.address ? <> Address on file: <i>{flagPending.address}</i>.</> : null} The address belongs
              to the client, so {clientLoanCount(flagPending)} outstanding loan(s) of theirs move together to
              Taggings &gt; Invalid Address for a team leader to re-tag, and leave this list.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary h-9 px-3 text-xs" disabled={flaggingId !== null} onClick={() => setFlagPending(null)}>Cancel</button>
              <button
                type="button"
                className="btn-primary h-9 px-3 text-xs"
                disabled={flaggingId !== null}
                onClick={() => void toggleAddressFlag(flagPending, true)}
              >Confirm &amp; move</button>
            </div>
          </div>
        </div>
      ) : null}

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
                {officerName ? <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brand-blue">{result?.scopedOfficerRole ?? "Account Officer"}: {officerName}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn-secondary" href={`${baseUrl}&format=excel`} download>Download Excel</a>
                <a className="btn-secondary" href={`${baseUrl}&format=print`} target="_blank" rel="noreferrer">Print full report</a>
                <button className="btn-secondary" type="button" onClick={() => setOpen(false)}>Close</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <span className="mb-1 block">Search column</span>
                <select
                  className="field h-9 min-w-[180px] text-xs"
                  value={filterKey}
                  onChange={(event) => setFilterKey(event.target.value as SortKey)}
                >
                  {SORT_COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <span className="mb-1 block">Value to find</span>
                <input
                  className="field h-9 min-w-[240px] text-xs"
                  value={filterDraft}
                  onChange={(event) => setFilterDraft(event.target.value)}
                  placeholder={`Search within ${SORT_COLUMNS.find((column) => column.key === filterKey)?.label ?? "column"}`}
                />
              </label>
              {filterDraft ? (
                <button type="button" className="btn-secondary mt-4 h-9 px-3 text-xs" onClick={() => setFilterDraft("")}>Clear</button>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600">
              <span>{result
                ? `${result.clientTotal.toLocaleString("en-US")} client(s) holding ${result.total.toLocaleString("en-US")} loan(s)${filterValue ? " matching the filter" : ""} | showing client ${(result.clientStartIndex + 1).toLocaleString("en-US")}–${(result.clientStartIndex + result.clientsOnPage).toLocaleString("en-US")}`
                : "Loading loan details..."}</span>
              <span>{result ? `Page ${result.page.toLocaleString("en-US")} of ${result.totalPages.toLocaleString("en-US")}` : null}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {loading && !result ? <p className="px-5 py-12 text-center font-semibold text-slate-500">Loading loan details...</p> : null}
              {error ? <p className="px-5 py-12 text-center font-semibold text-red-700">{error}</p> : null}
              {result ? (
                <table className="w-full min-w-[1900px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500">
                    <tr>
                      {SORT_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""}`}
                          title={column.title}
                          aria-sort={sort.key === column.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                        >
                          <button
                            type="button"
                            className={`flex w-full items-center gap-1 uppercase tracking-wide transition hover:text-brand-blue ${column.align === "right" ? "justify-end" : ""} ${sort.key === column.key ? "text-brand-blue" : ""}`}
                            onClick={() => toggleSort(column.key)}
                          >
                            {column.label}
                            {sort.key === column.key
                              ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
                              : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />}
                          </button>
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center">Not Valid Address</th>
                      <th className="min-w-[420px] px-3 py-3">Assign Location</th>
                      <th className="min-w-[260px] px-3 py-3">Account Officer / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleReportRows.map((row, rowIndex) => {
                      const firstOfClient = rowIndex === 0 || visibleReportRows[rowIndex - 1].clientId !== row.clientId;
                      const clientNumber = result.clientStartIndex
                        + new Set(visibleReportRows.slice(0, rowIndex + 1).map((item) => item.clientId)).size;
                      return (
                      <tr key={row.id} className={firstOfClient ? "border-t border-slate-200" : ""}>
                        <td className="px-3 py-3">
                          {firstOfClient ? (
                            <>
                              <p className="font-bold text-slate-950">
                                <span className="mr-1 text-brand-blue">{clientNumber}.</span>
                                {row.clientName}
                              </p>
                              <p className="text-slate-500">{row.clientNumber || "-"}</p>
                            </>
                          ) : (
                            <p className="pl-4 text-slate-400">same client, another loan</p>
                          )}
                        </td>
                        <td className="px-3 py-3">{row.contactNumber || "-"}</td><td className="px-3 py-3"><LazyLoanDetailLink loanId={row.id} label={row.loanNumber} /></td>
                        <td className="px-3 py-3">{row.branch}</td><td className="px-3 py-3">{row.product || "-"}</td>
                        <td className="px-3 py-3">{date(row.releasedAt)}</td><td className="px-3 py-3">{date(row.maturityAt)}</td>
                        <td className="px-3 py-3">{row.status || "-"}</td><MoneyCell value={row.originalPrincipal} /><MoneyCell value={row.principalBalance} />
                        <MoneyCell value={row.interest} /><MoneyCell value={row.penalty} /><MoneyCell value={row.otherCharges} />
                        <MoneyCell value={row.paidAmount} /><MoneyCell value={row.totalBalance} />
                        {row.remoteBalance === null ? (
                          <td className="whitespace-nowrap px-3 py-3 text-right text-slate-400">Not synced</td>
                        ) : (
                          <MoneyCell value={row.remoteBalance} tone={row.remoteBalance === 0 && row.totalBalance > 0 ? "flag" : "default"} />
                        )}
                        <td className="max-w-sm whitespace-normal px-3 py-3"><div className="flex items-start gap-2"><span className="min-w-0 flex-1">{row.address || "-"}</span><ClientAddressPinEditor compact clientId={row.clientId} clientName={row.clientName} address={row.address} initialPin={savedPins[row.clientId] ?? { latitude: row.addressLatitude, longitude: row.addressLongitude, accuracy: row.addressAccuracy }} onSaved={(pin) => setSavedPins((current) => ({ ...current, [row.clientId]: pin }))} /></div></td>
                        <td className="px-3 py-3 text-center">
                          <label className="inline-flex cursor-pointer items-center justify-center gap-2" title="Send this loan to Taggings > Invalid Address for re-tagging">
                            <span className="sr-only">Flag {row.loanNumber} as having an invalid address</span>
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-amber-600 disabled:cursor-not-allowed"
                              checked={addressFlags[row.id] ?? row.notValidAddress}
                              disabled={!result.canFlagAddress || flaggingId === row.id}
                              onChange={(event) => {
                                if (event.target.checked) setFlagPending(row);
                                else void toggleAddressFlag(row, false);
                              }}
                            />
                          </label>
                        </td>
                        <td className="px-3 py-3">
                          {result.canFlagAddress ? (
                            <div className="flex min-w-[400px] gap-1">
                              <select
                                className="loc-caps field h-9 min-w-0 flex-1 py-1 text-xs"
                                aria-label={`Province for ${row.clientName}`}
                                value={locationFor(row).province}
                                onChange={(event) => updateLocation(row, "province", event.target.value)}
                              >
                                <option value="">Province</option>
                                {withCurrentValue(provinceOptions(result.locations), locationFor(row).province).map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                              <select
                                className="loc-caps field h-9 min-w-0 flex-1 py-1 text-xs"
                                aria-label={`City or municipality for ${row.clientName}`}
                                value={locationFor(row).municipality}
                                disabled={!locationFor(row).province}
                                onChange={(event) => updateLocation(row, "municipality", event.target.value)}
                              >
                                <option value="">City/Municipality</option>
                                {municipalityOptions(result.locations, locationFor(row).province).map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                              <select
                                className="loc-caps field h-9 min-w-0 flex-1 py-1 text-xs"
                                aria-label={`Barangay for ${row.clientName}`}
                                value={locationFor(row).barangay}
                                disabled={!locationFor(row).municipality}
                                onChange={(event) => updateLocation(row, "barangay", event.target.value)}
                              >
                                <option value="">Barangay</option>
                                {barangayOptions(result.locations, locationFor(row).province, locationFor(row).municipality).map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </div>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                        <td className="px-3 py-3">
                          {result.canAssignOfficer ? (
                            <div className="flex min-w-[250px] items-center gap-2">
                              <select
                                className="field h-9 min-w-0 flex-1 py-1 text-xs"
                                value={selectedOfficers[row.id] ?? String(row.assignedOfficerId ?? "")}
                                onChange={(event) => setSelectedOfficers((current) => ({ ...current, [row.id]: event.target.value }))}
                              >
                                <option value="">Select Account Officer</option>
                                {result.officers
                                  .filter((officer) => officer.allBranches || officer.branchIds.includes(row.branchId))
                                  .map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}
                              </select>
                              <button
                                className="btn-primary h-9 px-3 text-xs"
                                type="button"
                                disabled={savingLoanId === row.id || !(selectedOfficers[row.id] ?? row.assignedOfficerId)}
                                onClick={() => assignOfficer(row)}
                              >
                                {savingLoanId === row.id ? "Assigning..." : "Assign"}
                              </button>
                            </div>
                          ) : <span className="font-semibold">{row.accountOfficer}</span>}
                        </td>
                      </tr>
                      );
                    })}
                    {!result.rows.length ? <tr><td className="px-3 py-10 text-center font-semibold text-slate-500" colSpan={20}>No matching loans found.</td></tr> : null}
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

function MoneyCell({ value, tone = "default" }: { value: number; tone?: "default" | "flag" }) {
  const className = tone === "flag"
    ? "whitespace-nowrap px-3 py-3 text-right font-bold text-brand-green"
    : "whitespace-nowrap px-3 py-3 text-right font-bold text-red-700";
  return <td className={className} title={tone === "flag" ? "The branch shows this loan as fully settled - our computed balance may be stale." : undefined}>{money(value)}</td>;
}
