"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckSquare, Search, Tag, Users } from "lucide-react";
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
  maturityAt: string | null;
  sourceStatusName: string | null;
  sourceStatusCode: number | null;
  balance: number;
  assignedOfficer: string | null;
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
  loans: AccountTaggingLoanRow[];
  selectedBranchId: string;
  selectedProduct: string;
  address: string;
  customerName: string;
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
  canAssign: boolean;
  reportDate: string;
};

export function AccountTaggingWorkspace({
  branches,
  officers,
  products,
  loans,
  selectedBranchId,
  selectedProduct,
  address,
  customerName,
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
  canAssign,
  reportDate
}: AccountTaggingWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addressQuery, setAddressQuery] = useState(address);
  const [customerQuery, setCustomerQuery] = useState(customerName);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const mounted = useRef(false);
  const hasFilters = Boolean(selectedBranchId !== "ALL" || selectedProduct !== "ALL" || address.trim() || customerName.trim());
  const selectedBranch = branches.find((branch) => String(branch.id) === selectedBranchId);
  const branchLabel = selectedBranch ? `${selectedBranch.branchName} (${selectedBranch.branchCode})` : "All branches";

  const buildHref = useCallback(
    (formData?: FormData, nextAddress = addressQuery, nextCustomer = customerQuery) => {
      const params = new URLSearchParams(searchParams.toString());
      const branchId = String(formData?.get("branchId") ?? selectedBranchId);
      const product = String(formData?.get("product") ?? selectedProduct);
      const normalizedAddress = nextAddress.trim();
      const normalizedCustomer = nextCustomer.trim();

      params.delete("page");
      branchId === "ALL" ? params.delete("branchId") : params.set("branchId", branchId);
      product === "ALL" ? params.delete("product") : params.set("product", product);
      normalizedAddress ? params.set("address", normalizedAddress) : params.delete("address");
      normalizedCustomer ? params.set("customer", normalizedCustomer) : params.delete("customer");

      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [addressQuery, customerQuery, pathname, searchParams, selectedBranchId, selectedProduct]
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      router.replace(buildHref(undefined, addressQuery, customerQuery));
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [addressQuery, buildHref, customerQuery, router]);

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
    if (!assignedToId) {
      setError("Select an Account Officer first.");
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
          assignedToId,
          branchId: selectedBranchId,
          product: selectedProduct,
          address,
          customerName
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Unable to assign matching accounts.");
        return;
      }
      setMessage(`${data.count.toLocaleString("en-US")} loan${data.count === 1 ? "" : "s"} tagged to Account Officer.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submitSearch} className="panel grid gap-3 p-4 no-print lg:grid-cols-[1fr_1fr_1.4fr_1.4fr_auto_auto]">
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
          <span className="mb-2 block text-sm font-semibold text-slate-700">Address</span>
          <input className="field" value={addressQuery} onChange={(event) => setAddressQuery(event.target.value)} placeholder="Search by address or area" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Customer name</span>
          <input className="field" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Search by customer name" />
        </label>
        <button className="btn-primary self-end" type="submit">
          <Search className="h-4 w-4" />
          Search
        </button>
        <Link className="btn-secondary self-end" href="/account-tagging">
          Clear
        </Link>
      </form>

      {canAssign ? (
        <form onSubmit={assignMatching} className="panel grid gap-3 p-4 no-print lg:grid-cols-[1fr_1.6fr_auto]">
          <div>
            <p className="text-sm font-bold text-slate-950">Bulk assignment</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{assignmentSummary}</p>
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
          <button className="btn-primary self-end" disabled={isPending || !officers.length || !totalLoans || !hasFilters}>
            <Tag className="h-4 w-4" />
            {isPending ? "Assigning..." : "Assign matching"}
          </button>
          {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green lg:col-span-3">{message}</p> : null}
          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 lg:col-span-3">{error}</p> : null}
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
                <p><span className="font-semibold">Address filter:</span> {address || "All"}</p>
                <p><span className="font-semibold">Customer filter:</span> {customerName || "All"}</p>
                <p><span className="font-semibold">Date:</span> {dateOnly(reportDate)}</p>
              </div>
            </div>
            <p className="text-sm font-bold text-slate-950">
              {totalLoans
                ? `Showing ${firstResult.toLocaleString("en-US")}-${lastResult.toLocaleString("en-US")} of ${totalLoans.toLocaleString("en-US")} loan(s)`
                : "Showing 0 loan(s)"}
            </p>
            <p className="text-xs font-semibold text-slate-500">
              Page {safePage.toLocaleString("en-US")} of {totalPages.toLocaleString("en-US")}
              <span className="print-only"> - current printed page only</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Users className="h-4 w-4 text-brand-blue" />
              Account tagging queue
            </div>
            <PrintReportButton />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-12" />
              <col className="w-[230px]" />
              <col className="w-[290px]" />
              <col className="w-24" />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-40" />
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">No.</th>
                <th className="px-3 py-3">Client</th>
                <th className="px-3 py-3">Address</th>
                <th className="px-3 py-3">Branch</th>
                <th className="px-3 py-3">Loan</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Maturity</th>
                <th className="px-3 py-3 text-right">Balance</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Account Officer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loans.map((loan, index) => (
                <tr key={loan.id} className="align-top">
                  <td className="px-3 py-3 font-semibold text-slate-600">{firstResult + index}</td>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-950">{loan.clientName}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{[loan.clientId, loan.contactNumber].filter(Boolean).join(" - ") || "-"}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{loan.address || "-"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{loan.branchName}</td>
                  <td className="px-3 py-3 font-bold text-brand-blue">{loan.loanNumber}</td>
                  <td className="px-3 py-3">{loan.loanProduct ?? "-"}</td>
                  <td className="px-3 py-3">{dateOnly(loan.maturityAt)}</td>
                  <td className="px-3 py-3 text-right font-bold text-red-700">{money(loan.balance)}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-bold text-slate-700">
                      {loan.sourceStatusCode ?? "-"} {loan.sourceStatusName ? `- ${loan.sourceStatusName}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {loan.assignedOfficer ? (
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
                  <td className="px-4 py-8 text-sm font-semibold text-slate-500" colSpan={10}>
                    {hasFilters ? "No matching loans found." : "Use branch, address, or customer filters to load accounts for tagging."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
      </section>
    </div>
  );
}
