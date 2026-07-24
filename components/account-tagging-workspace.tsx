"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckSquare, FileSpreadsheet, Search, Tag, Users } from "lucide-react";
import { LoanDetailLink } from "@/components/loan-detail-link";
import type { LoanDetailLoan } from "@/components/loan-detail-window";
import { PrintReportButton } from "@/components/print-report-button";
import { money, dateOnly } from "@/lib/format";

type BranchOption = {
  id: number;
  branchName: string;
  branchCode: string;
};

type OfficerOption = {
  id: number;
  name: string;
  email: string;
};

export type AccountTaggingLoanRow = {
  id: number;
  clientName: string;
  clientId: string | null;
  contactNumber: string | null;
  address: string | null;
  branchName: string;
  branchCode: string;
  loanNumber: string;
  loanProduct: string | null;
  branchAo: string | null;
  maturityAt: string | null;
  sourceStatusName: string | null;
  sourceStatusCode: number | null;
  originalPrincipal: number;
  originalInterest: number;
  originalPdi: number;
  originalPenalty: number;
  principalBalance: number;
  interestBalance: number;
  pdiBalance: number;
  penaltyBalance: number;
  totalPayments: number;
  waivedAmount: number;
  balance: number;
  assignedOfficerId: number | null;
  assignmentId: number | null;
  assignedOfficer: string | null;
  zone: string | null;
  division: string | null;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
  clientCondition: string | null;
  conditionApprovalStatus: string | null;
  loanDetail: LoanDetailLoan;
};

type PageLink = {
  page: number;
  href: string;
  showGap: boolean;
};

type AccountTaggingWorkspaceProps = {
  branches: BranchOption[];
  officers: OfficerOption[];
  products: string[];
  statuses: string[];
  loans: AccountTaggingLoanRow[];
  selectedBranchId: string;
  selectedProduct: string;
  selectedStatus: string;
  address: string;
  address2: string;
  customerName: string;
  resultSearch: string;
  portfolioTotals: {
    originalPrincipal: number;
    originalInterest: number;
    originalPdi: number;
    originalPenalty: number;
    principal: number;
    interest: number;
    pdi: number;
    penalty: number;
    payments: number;
    waived: number;
    balance: number;
  };
  totalLoans: number;
  safePage: number;
  totalPages: number;
  firstResult: number;
  lastResult: number;
  firstHref: string;
  previousHref: string;
  nextHref: string;
  lastHref: string;
  pageLinks: PageLink[];
  printAllResults: boolean;
  printableHref: string;
  excelHref: string;
  paginatedHref: string;
  canAssign: boolean;
  reportDate: string;
  reportOnly?: boolean;
  forceHasFilters?: boolean;
  currentUserRole: string;
};

export function AccountTaggingWorkspace({
  branches,
  officers,
  products,
  statuses,
  loans,
  selectedBranchId,
  selectedProduct,
  selectedStatus,
  address,
  address2,
  customerName,
  resultSearch,
  portfolioTotals,
  totalLoans,
  safePage,
  totalPages,
  firstResult,
  lastResult,
  firstHref,
  previousHref,
  nextHref,
  lastHref,
  pageLinks,
  printAllResults,
  printableHref,
  excelHref,
  paginatedHref,
  canAssign,
  reportDate,
  reportOnly = false,
  forceHasFilters = false,
  currentUserRole
}: AccountTaggingWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addressQuery, setAddressQuery] = useState(address);
  const [address2Query, setAddress2Query] = useState(address2);
  const [customerQuery, setCustomerQuery] = useState(customerName);
  const [resultSearchQuery, setResultSearchQuery] = useState(resultSearch);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const mounted = useRef(false);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScroll = useRef(false);
  const hasFilters = forceHasFilters || Boolean(selectedBranchId !== "ALL" || selectedProduct !== "ALL" || selectedStatus !== "ALL" || address.trim() || address2.trim() || customerName.trim() || resultSearch.trim());
  const selectedBranch = branches.find((branch) => String(branch.id) === selectedBranchId);
  const branchLabel = selectedBranch ? `${selectedBranch.branchName} (${selectedBranch.branchCode})` : "All branches";
  const tableMinWidth = reportOnly ? 2400 : 2120;
  const visibleTotals = useMemo(
    () =>
      loans.reduce(
        (totals, loan) => ({
          principal: totals.principal + loan.principalBalance,
          interest: totals.interest + loan.interestBalance,
          pdi: totals.pdi + loan.pdiBalance,
          penalty: totals.penalty + loan.penaltyBalance,
          payments: totals.payments + loan.totalPayments,
          waived: totals.waived + loan.waivedAmount,
          balance: totals.balance + loan.balance
        }),
        { principal: 0, interest: 0, pdi: 0, penalty: 0, payments: 0, waived: 0, balance: 0 }
      ),
    [loans]
  );

  const buildHref = useCallback(
    (formData?: FormData, nextAddress = addressQuery, nextAddress2 = address2Query, nextCustomer = customerQuery, nextResultSearch = resultSearchQuery) => {
      const params = new URLSearchParams(searchParams.toString());
      const branchId = String(formData?.get("branchId") ?? selectedBranchId);
      const product = String(formData?.get("product") ?? selectedProduct);
      const status = String(formData?.get("status") ?? selectedStatus);
      const normalizedAddress = nextAddress.trim();
      const normalizedAddress2 = nextAddress2.trim();
      const normalizedCustomer = nextCustomer.trim();
      const normalizedResultSearch = nextResultSearch.trim();

      params.delete("page");
      params.delete("print");
      branchId === "ALL" ? params.delete("branchId") : params.set("branchId", branchId);
      product === "ALL" ? params.delete("product") : params.set("product", product);
      status === "ALL" ? params.delete("status") : params.set("status", status);
      normalizedAddress ? params.set("address", normalizedAddress) : params.delete("address");
      normalizedAddress2 ? params.set("address2", normalizedAddress2) : params.delete("address2");
      normalizedCustomer ? params.set("customer", normalizedCustomer) : params.delete("customer");
      normalizedResultSearch ? params.set("resultSearch", normalizedResultSearch) : params.delete("resultSearch");

      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [address2Query, addressQuery, customerQuery, pathname, resultSearchQuery, searchParams, selectedBranchId, selectedProduct, selectedStatus]
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (addressQuery === address && address2Query === address2 && customerQuery === customerName && resultSearchQuery === resultSearch) {
      return;
    }

    const timeout = window.setTimeout(() => {
      router.replace(buildHref(undefined, addressQuery, address2Query, customerQuery, resultSearchQuery));
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [address, address2, address2Query, addressQuery, buildHref, customerName, customerQuery, resultSearch, resultSearchQuery, router]);

  const assignmentSummary = useMemo(() => {
    if (!totalLoans) return "No matching loans to tag.";
    if (!hasFilters) return "Use branch, address, or customer filters before assigning.";
    return `This will assign ${totalLoans.toLocaleString("en-US")} matching loan${totalLoans === 1 ? "" : "s"}.`;
  }, [hasFilters, totalLoans]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildHref(new FormData(event.currentTarget)));
  }

  function assignMatching(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assignedToId = Number(form.get("assignedToId"));
    const zone = String(form.get("zone") ?? "").trim();
    const division = String(form.get("division") ?? "").trim();
    const province = String(form.get("province") ?? "").trim();
    const municipality = String(form.get("municipality") ?? "").trim();
    const barangay = String(form.get("barangay") ?? "").trim();
    if (!assignedToId && !zone && !division && !province && !municipality && !barangay) {
      setError("Provide at least one bulk-assignment field.");
      return;
    }
    if (!hasFilters) {
      setError("Please filter by branch, address, or customer before assigning.");
      return;
    }

    setError(null);
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/account-tagging/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assignMatching",
          assignedToId,
          zone,
          division,
          province,
          municipality,
          barangay,
          branchId: selectedBranchId,
          product: selectedProduct,
          address,
          address2,
          customerName,
          loanStatus: selectedStatus,
          resultSearch
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Unable to assign matching accounts.");
        return;
      }
      setMessage(`${data.count.toLocaleString("en-US")} loan${data.count === 1 ? "" : "s"} updated with the provided tagging fields.`);
      router.refresh();
    });
  }

  function updateLoanTagging(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const loanId = Number(form.get("loanId"));
    const assignedToId = Number(form.get("assignedToId"));
    const zone = String(form.get("zone") ?? "").trim();
    const division = String(form.get("division") ?? "").trim();
    const province = String(form.get("province") ?? "").trim();
    const municipality = String(form.get("municipality") ?? "").trim();
    const barangay = String(form.get("barangay") ?? "").trim();

    if (!assignedToId && !zone && !division && !province && !municipality && !barangay) {
      setError("Provide at least one tagging field to update.");
      return;
    }

    setError(null);
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/account-tagging/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLoan",
          loanId,
          assignedToId,
          zone,
          division,
          province,
          municipality,
          barangay
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Unable to update this loan tagging.");
        return;
      }
      setMessage("Loan tagging updated.");
      router.refresh();
    });
  }

  function updateClientCondition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assignmentId = Number(form.get("assignmentId"));
    const action = String(form.get("action") ?? "report");
    const condition = String(form.get("condition") ?? "");
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/account-tagging/condition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, action, condition })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Unable to update client condition.");
        return;
      }
      setMessage(action === "approve" ? "Client condition approved." : "Client condition submitted for Area TL approval.");
      router.refresh();
    });
  }

  function syncHorizontalScroll(source: "top" | "table") {
    if (syncingScroll.current) return;
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    if (!top || !table) return;

    syncingScroll.current = true;
    if (source === "top") {
      table.scrollLeft = top.scrollLeft;
    } else {
      top.scrollLeft = table.scrollLeft;
    }
    window.requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }

  return (
    <div className="space-y-4">
      {!reportOnly ? <form onSubmit={submitSearch} className="panel grid gap-3 p-4 no-print lg:grid-cols-[1fr_1fr_1fr_1.2fr_1.2fr_auto_auto]">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Branch</span>
          <select name="branchId" className="field" defaultValue={selectedBranchId}>
            <option value="ALL">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.branchName} - {branch.branchCode}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Loan product</span>
          <select name="product" className="field" defaultValue={selectedProduct}>
            <option value="ALL">All products</option>
            {products.map((product) => (
              <option key={product} value={product}>{product}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Loan status</span>
          <select name="status" className="field" defaultValue={selectedStatus}>
            <option value="ALL">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Address area</span>
          <input className="field" value={addressQuery} onChange={(event) => setAddressQuery(event.target.value)} placeholder="Example: San Francisco" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Address detail</span>
          <input className="field" value={address2Query} onChange={(event) => setAddress2Query(event.target.value)} placeholder="Example: Brgy 1" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Customer name</span>
          <input className="field" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Search by customer name" />
        </label>
        <button className="btn-primary w-full self-end lg:w-auto" type="submit">
          <Search className="h-4 w-4" />
          Search
        </button>
        <Link className="btn-secondary w-full self-end lg:w-auto" href="/account-tagging">
          Clear
        </Link>
      </form> : null}

      {!reportOnly ? <section className="grid gap-3 no-print md:grid-cols-4 xl:grid-cols-7">
        <PortfolioMetric label="Principal balance" value={portfolioTotals.principal} detail={`Original ${money(portfolioTotals.originalPrincipal)}`} />
        <PortfolioMetric label="Interest balance" value={portfolioTotals.interest} detail={`Original ${money(portfolioTotals.originalInterest)}`} />
        <PortfolioMetric label="PDI balance" value={portfolioTotals.pdi} detail={`Original ${money(portfolioTotals.originalPdi)}`} />
        <PortfolioMetric label="Penalty balance" value={portfolioTotals.penalty} detail={`Original ${money(portfolioTotals.originalPenalty)}`} />
        <PortfolioMetric label="Total payments" value={portfolioTotals.payments} tone="green" />
        <PortfolioMetric label="Waived / deducted" value={portfolioTotals.waived} />
        <PortfolioMetric label="Balance portfolio" value={portfolioTotals.balance} tone="red" />
      </section> : null}

      {canAssign && !reportOnly ? (
        <form onSubmit={assignMatching} className="panel grid gap-4 p-4 no-print md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-sm font-bold text-slate-950">Bulk assignment</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{assignmentSummary}</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-500">Blank fields keep their current values.</p>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Account Officer</span>
            <select name="assignedToId" className="field" disabled={!officers.length || isPending}>
              <option value="">Select Account Officer</option>
              {officers.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name} - {officer.email}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Zone</span>
            <input name="zone" className="field" placeholder="Enter zone" disabled={isPending || !totalLoans || !hasFilters} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Division</span>
            <input name="division" className="field" placeholder="Enter division" disabled={isPending || !totalLoans || !hasFilters} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Province</span>
            <input name="province" className="field" placeholder="Enter province" disabled={isPending || !totalLoans || !hasFilters} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">City/Municipality</span>
            <input name="municipality" className="field" placeholder="Enter city/municipality" disabled={isPending || !totalLoans || !hasFilters} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Barangay</span>
            <input name="barangay" className="field" placeholder="Enter barangay" disabled={isPending || !totalLoans || !hasFilters} />
          </label>
          <div className="self-end">
            <button className="btn-primary w-full whitespace-nowrap" disabled={isPending || !totalLoans || !hasFilters}>
              <Tag className="h-4 w-4" />
              {isPending ? "Assigning..." : "Assign matching"}
            </button>
          </div>
          {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green md:col-span-2 xl:col-span-4">{message}</p> : null}
          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 md:col-span-2 xl:col-span-4">{error}</p> : null}
        </form>
      ) : null}

      <section className="panel overflow-hidden print-area">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <div className="mb-3 hidden print:block">
              <h1 className="text-lg font-bold text-slate-950">Agusan Lending Corporation</h1>
              <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-brand-green">Account Tagging Report</p>
              <div className="mt-2 grid gap-1 text-xs text-slate-700">
                <p><span className="font-semibold">Branch:</span> {branchLabel}</p>
                <p><span className="font-semibold">Loan product:</span> {selectedProduct === "ALL" ? "All" : selectedProduct}</p>
                <p><span className="font-semibold">Loan status:</span> {selectedStatus === "ALL" ? "All" : selectedStatus}</p>
                <p><span className="font-semibold">Address area:</span> {address || "All"}</p>
                <p><span className="font-semibold">Address detail:</span> {address2 || "All"}</p>
                <p><span className="font-semibold">Customer filter:</span> {customerName || "All"}</p>
                <p><span className="font-semibold">Result search:</span> {resultSearch || "All"}</p>
                <p>
                  <span className="font-semibold">Portfolio:</span>{" "}
                  Principal balance {money(portfolioTotals.principal)} | Interest balance {money(portfolioTotals.interest)} | PDI balance {money(portfolioTotals.pdi)} | Penalty balance {money(portfolioTotals.penalty)} | Payments {money(portfolioTotals.payments)} | Waived/Deducted {money(portfolioTotals.waived)} | Balance {money(portfolioTotals.balance)}
                </p>
                <p><span className="font-semibold">Date:</span> {dateOnly(reportDate)}</p>
              </div>
            </div>
            <p className="text-sm font-bold text-slate-950">
              {totalLoans
                ? printAllResults
                  ? `Showing all ${totalLoans.toLocaleString("en-US")} matching loan(s)`
                  : `Showing ${firstResult.toLocaleString("en-US")}-${lastResult.toLocaleString("en-US")} of ${totalLoans.toLocaleString("en-US")} loan(s)`
                : "Showing 0 loan(s)"}
            </p>
            <p className="text-xs font-semibold text-slate-500">
              {printAllResults ? "Printable full result list" : `Page ${safePage.toLocaleString("en-US")} of ${totalPages.toLocaleString("en-US")}`}
              {!printAllResults ? <span className="print-only"> - current printed page only</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="relative block no-print">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="field h-9 w-64 pl-9 text-xs"
                value={resultSearchQuery}
                onChange={(event) => setResultSearchQuery(event.target.value)}
                placeholder="Search all result fields"
              />
            </label>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Users className="h-4 w-4 text-brand-blue" />
              Account tagging queue
            </div>
            {printAllResults ? (
              <>
                <Link className="btn-secondary h-9 px-3 no-print" href={paginatedHref}>
                  Back to paginated list
                </Link>
                <Link className={`btn-secondary h-9 px-3 no-print ${!totalLoans ? "pointer-events-none opacity-50" : ""}`} href={excelHref}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Download Excel report
                </Link>
                <PrintReportButton label="Print full result list" />
              </>
            ) : (
              <>
                <Link className={`btn-secondary h-9 px-3 no-print ${!totalLoans ? "pointer-events-none opacity-50" : ""}`} href={excelHref}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Download Excel report
                </Link>
                <Link className={`btn-primary h-9 px-3 no-print ${!totalLoans ? "pointer-events-none opacity-50" : ""}`} href={printableHref}>
                  Print full result list
                </Link>
              </>
            )}
          </div>
        </div>
        <div
          ref={topScrollRef}
          className="sticky top-20 z-10 overflow-x-auto border-b border-slate-100 bg-white no-print"
          onScroll={() => syncHorizontalScroll("top")}
          aria-label="Account tagging horizontal scroll"
        >
          <div style={{ width: `${tableMinWidth}px`, height: 12 }} />
        </div>
        <div ref={tableScrollRef} className="overflow-x-auto" onScroll={() => syncHorizontalScroll("table")}>
          {canAssign
            ? loans.map((loan) => (
                <form key={loan.id} id={`tagging-row-${loan.id}`} onSubmit={updateLoanTagging} className="hidden">
                  <input type="hidden" name="loanId" value={loan.id} />
                </form>
              ))
            : null}
          <table className="w-full table-fixed text-left text-[11px]" style={{ minWidth: `${tableMinWidth}px` }}>
            <colgroup>
              <col className="w-9" />
              <col className="w-[168px]" />
              <col className="w-[204px]" />
              <col className="w-[104px]" />
              <col className="w-[120px]" />
              <col className="w-[78px]" />
              <col className="w-[92px]" />
              <col className="w-[92px]" />
              <col className="w-[70px]" />
              <col className="w-[92px]" />
              <col className="w-[92px]" />
              <col className="w-[72px]" />
              <col className="w-[92px]" />
              <col className="w-[112px]" />
              <col className="w-[116px]" />
              <col className="w-[116px]" />
              <col className="w-[120px]" />
              <col className="w-[140px]" />
              <col className="w-[120px]" />
              {reportOnly ? <col className="w-[160px]" /> : null}
              {reportOnly ? <col className="w-[130px]" /> : null}
              <col className="w-[196px]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">No.</th>
                <th className="px-2 py-2">Client</th>
                <th className="px-2 py-2">Address</th>
                <th className="px-2 py-2">Branch / Loan</th>
                <th className="px-2 py-2">Product / Branch AO</th>
                <th className="px-2 py-2">Maturity</th>
                <th className="px-2 py-2 text-right">Principal</th>
                <th className="px-2 py-2 text-right">Interest</th>
                <th className="px-2 py-2 text-right">PDI</th>
                <th className="px-2 py-2 text-right">Penalty</th>
                <th className="px-2 py-2 text-right">Payments</th>
                <th className="px-2 py-2 text-right">Waived</th>
                <th className="px-2 py-2 text-right">Balance</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Zone</th>
                <th className="px-2 py-2">Division</th>
                <th className="px-2 py-2">Province</th>
                <th className="px-2 py-2">City/Municipality</th>
                <th className="px-2 py-2">Barangay</th>
                {reportOnly ? <th className="px-2 py-2">Client Condition</th> : null}
                {reportOnly ? <th className="px-2 py-2">Approval</th> : null}
                <th className="px-2 py-2">Assigned AO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loans.map((loan, index) => (
                <tr key={loan.id} className="align-top">
                  <td className="px-2 py-2 font-semibold text-slate-600">{firstResult + index}</td>
                  <td className="px-2 py-2">
                    <p className="font-bold text-slate-950">{loan.clientName}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{[loan.clientId, loan.contactNumber].filter(Boolean).join(" - ") || "-"}</p>
                  </td>
                  <td className="px-2 py-2 text-slate-700">{loan.address || "-"}</td>
                  <td className="px-2 py-2">
                    <p className="font-semibold text-slate-700">{loan.branchName}</p>
                    <span className="mt-1 block no-print">
                      <LoanDetailLink loan={loan.loanDetail} label={loan.loanNumber} />
                    </span>
                    <span className="print-only font-bold text-brand-blue">{loan.loanNumber}</span>
                  </td>
                  <td className="px-2 py-2">
                    <p>{loan.loanProduct ?? "-"}</p>
                    <p className="mt-1 font-semibold text-slate-700">{loan.branchAo || "-"}</p>
                  </td>
                  <td className="px-2 py-2">{dateOnly(loan.maturityAt)}</td>
                  <AmountCell balance={loan.principalBalance} original={loan.originalPrincipal} />
                  <AmountCell balance={loan.interestBalance} original={loan.originalInterest} />
                  <AmountCell balance={loan.pdiBalance} original={loan.originalPdi} />
                  <AmountCell balance={loan.penaltyBalance} original={loan.originalPenalty} />
                  <td className="px-2 py-2 text-right font-semibold text-brand-green">{money(loan.totalPayments)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{money(loan.waivedAmount)}</td>
                  <td className="px-2 py-2 text-right font-bold text-red-700">{money(loan.balance)}</td>
                  <td className="px-2 py-2">
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-bold text-slate-700">
                      {loan.sourceStatusCode ?? "-"} {loan.sourceStatusName ? `- ${loan.sourceStatusName}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {canAssign ? (
                      <>
                        <input
                          className="field h-9 text-xs no-print"
                          form={`tagging-row-${loan.id}`}
                          name="zone"
                          defaultValue={loan.zone ?? ""}
                          placeholder="Zone"
                        />
                        <span className="print-only font-semibold text-slate-700">{loan.zone || "-"}</span>
                      </>
                    ) : (
                      <span className="font-semibold text-slate-700">{loan.zone || "-"}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {canAssign ? (
                      <>
                        <input
                          className="field h-9 text-xs no-print"
                          form={`tagging-row-${loan.id}`}
                          name="division"
                          defaultValue={loan.division ?? ""}
                          placeholder="Division"
                        />
                        <span className="print-only font-semibold text-slate-700">{loan.division || "-"}</span>
                      </>
                    ) : (
                      <span className="font-semibold text-slate-700">{loan.division || "-"}</span>
                    )}
                  </td>
                  <LocationTagCell canAssign={canAssign} formId={`tagging-row-${loan.id}`} name="province" value={loan.province} />
                  <LocationTagCell canAssign={canAssign} formId={`tagging-row-${loan.id}`} name="municipality" value={loan.municipality} placeholder="City/Municipality" />
                  <LocationTagCell canAssign={canAssign} formId={`tagging-row-${loan.id}`} name="barangay" value={loan.barangay} />
                  {reportOnly ? (
                    <td className="px-2 py-2">
                      {currentUserRole === "ACCOUNT_OFFICER" && loan.assignmentId ? (
                        <form onSubmit={updateClientCondition} className="flex gap-2 no-print">
                          <input type="hidden" name="assignmentId" value={loan.assignmentId} />
                          <input type="hidden" name="action" value="report" />
                          <select name="condition" className="field h-9 min-w-0 text-xs" defaultValue={loan.clientCondition ?? ""} required>
                            <option value="">Select condition</option>
                            <option value="UNLOCATED">Unlocated</option>
                            <option value="RIP">RIP</option>
                          </select>
                          <button className="btn-secondary h-9 px-2 text-xs" disabled={isPending}>Submit</button>
                        </form>
                      ) : (
                        <span className="font-semibold text-slate-700">{loan.clientCondition === "UNLOCATED" ? "Unlocated" : loan.clientCondition || "-"}</span>
                      )}
                      <span className="print-only font-semibold text-slate-700">{loan.clientCondition === "UNLOCATED" ? "Unlocated" : loan.clientCondition || "-"}</span>
                    </td>
                  ) : null}
                  {reportOnly ? (
                    <td className="px-2 py-2">
                      {loan.conditionApprovalStatus === "PENDING" && (currentUserRole === "AREA_TEAM_LEADER" || currentUserRole === "ADMIN") && loan.assignmentId ? (
                        <form onSubmit={updateClientCondition} className="no-print">
                          <input type="hidden" name="assignmentId" value={loan.assignmentId} />
                          <input type="hidden" name="action" value="approve" />
                          <button className="btn-primary h-9 px-3 text-xs" disabled={isPending}>Approve</button>
                        </form>
                      ) : (
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${loan.conditionApprovalStatus === "APPROVED" ? "bg-emerald-50 text-brand-green" : loan.conditionApprovalStatus === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                          {loan.conditionApprovalStatus ?? "Not reported"}
                        </span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-2 py-2">
                    {canAssign ? (
                      <>
                      <div className="flex gap-2 no-print">
                        <select
                          className="field h-9 min-w-0 flex-1 text-xs"
                          form={`tagging-row-${loan.id}`}
                          name="assignedToId"
                          defaultValue={loan.assignedOfficerId ?? ""}
                        >
                          <option value="">Select AO</option>
                          {officers.map((officer) => (
                            <option key={officer.id} value={officer.id}>
                              {officer.name}
                            </option>
                          ))}
                        </select>
                        <button className="btn-secondary h-9 px-3" form={`tagging-row-${loan.id}`} disabled={isPending}>
                          Update
                        </button>
                      </div>
                      <span className="print-only font-semibold text-slate-700">{loan.assignedOfficer || "Unassigned"}</span>
                      </>
                    ) : loan.assignedOfficer ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 font-bold text-brand-green">
                        <CheckSquare className="h-3.5 w-3.5" />
                        {loan.assignedOfficer}
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-50 px-2 py-1 font-bold text-amber-700">Unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loans.length ? (
                <tr>
                  <td className="px-4 py-8 text-sm font-semibold text-slate-500" colSpan={reportOnly ? 22 : 20}>
                    {hasFilters ? "No matching loans found." : "Use branch, address, or customer filters to load accounts for tagging."}
                  </td>
                </tr>
              ) : null}
            </tbody>
            {loans.length ? (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-[11px]">
                <tr className="align-top">
                  <td className="px-2 py-2 font-bold uppercase tracking-wide text-slate-600" colSpan={6}>
                    {printAllResults ? "Grand total" : "Page total"}
                  </td>
                  <TotalAmountCell value={visibleTotals.principal} tone="red" />
                  <TotalAmountCell value={visibleTotals.interest} tone="red" />
                  <TotalAmountCell value={visibleTotals.pdi} tone="red" />
                  <TotalAmountCell value={visibleTotals.penalty} tone="red" />
                  <TotalAmountCell value={visibleTotals.payments} tone="green" />
                  <TotalAmountCell value={visibleTotals.waived} />
                  <TotalAmountCell value={visibleTotals.balance} tone="red" />
                  <td className="px-2 py-2" colSpan={reportOnly ? 9 : 7} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {!printAllResults ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 no-print">
          <div className="flex items-center gap-2">
            <Link className={`btn-secondary h-9 px-3 ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`} href={firstHref}>
              First
            </Link>
            <Link className={`btn-secondary h-9 px-3 ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`} href={previousHref}>
              Previous
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {pageLinks.map((link) => (
              <span key={link.page} className="flex items-center gap-1">
                {link.showGap ? <span className="px-2 text-slate-400">...</span> : null}
                <Link
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm font-bold ${
                    link.page === safePage ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  href={link.href}
                >
                  {link.page}
                </Link>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link className={`btn-secondary h-9 px-3 ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`} href={nextHref}>
              Next
            </Link>
            <Link className={`btn-secondary h-9 px-3 ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`} href={lastHref}>
              Last
            </Link>
          </div>
        </div>
        ) : null}
      </section>
    </div>
  );
}

function PortfolioMetric({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: number;
  detail?: string;
  tone?: "default" | "red" | "green";
}) {
  const valueClass = tone === "red" ? "text-red-700" : tone === "green" ? "text-brand-green" : "text-slate-950";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${valueClass}`}>{money(value)}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p> : null}
    </div>
  );
}

function AmountCell({ balance, original }: { balance: number; original: number }) {
  return (
    <td className="px-2 py-2 text-right">
      <p className="font-bold text-red-700">{money(balance)}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Orig {money(original)}</p>
    </td>
  );
}

function LocationTagCell({
  canAssign,
  formId,
  name,
  value,
  placeholder
}: {
  canAssign: boolean;
  formId: string;
  name: "province" | "municipality" | "barangay";
  value: string | null;
  placeholder?: string;
}) {
  const label = placeholder ?? name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <td className="px-2 py-2">
      {canAssign ? (
        <>
          <input className="field h-9 text-xs no-print" form={formId} name={name} defaultValue={value ?? ""} placeholder={label} />
          <span className="print-only font-semibold text-slate-700">{value || "-"}</span>
        </>
      ) : (
        <span className="font-semibold text-slate-700">{value || "-"}</span>
      )}
    </td>
  );
}

function TotalAmountCell({ value, tone = "default" }: { value: number; tone?: "default" | "red" | "green" }) {
  const valueClass = tone === "red" ? "text-red-700" : tone === "green" ? "text-brand-green" : "text-slate-950";

  return (
    <td className={`px-2 py-2 text-right font-extrabold ${valueClass}`}>
      {money(value)}
    </td>
  );
}
