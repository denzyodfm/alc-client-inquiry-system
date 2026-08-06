"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AccountTaggingLoanRow } from "@/components/account-tagging-workspace";
import { LoanDetailLink } from "@/components/loan-detail-link";
import { dateOnly, money } from "@/lib/format";

export function LocationReportLoanList({
  loans,
  canEdit
}: {
  loans: AccountTaggingLoanRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isBulkPending, startBulkTransition] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const filteredLoans = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("en");
    if (!term) return loans;
    return loans.filter((loan) =>
      [
        loan.clientName,
        loan.clientId,
        loan.loanNumber,
        loan.branchName,
        loan.branchCode,
        loan.loanProduct,
        loan.sourceStatusName,
        loan.address,
        loan.province,
        loan.municipality,
        loan.barangay
      ].some((value) => value?.toLocaleLowerCase("en").includes(term))
    );
  }, [loans, query]);

  function updateFilteredLocations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const province = String(form.get("province") ?? "").trim();
    const municipality = String(form.get("municipality") ?? "").trim();
    const barangay = String(form.get("barangay") ?? "").trim();
    if (!filteredLoans.length) {
      setBulkMessage("No filtered loans to update.");
      return;
    }
    if (!province && !municipality && !barangay) {
      setBulkMessage("Enter at least one location field.");
      return;
    }

    setBulkMessage(null);
    startBulkTransition(async () => {
      const response = await fetch("/api/account-tagging/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLoans",
          loanIds: filteredLoans.map((loan) => loan.id),
          province,
          municipality,
          barangay
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setBulkMessage(data?.error ?? "Unable to update the filtered loans.");
        return;
      }
      setBulkMessage(`${data.count.toLocaleString("en-US")} loan(s) updated.`);
      router.refresh();
    });
  }

  return (
    <div className="min-w-0">
      <div className="space-y-3 border-b border-blue-100 bg-blue-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-700" htmlFor={`location-search-${loans[0]?.id ?? "empty"}`}>
            Search results
          </label>
          <input
            id={`location-search-${loans[0]?.id ?? "empty"}`}
            className="field h-9 w-full max-w-lg bg-white text-xs"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search client, loan, address, branch, or location"
            aria-label="Search loans in this barangay"
          />
          <span className="text-xs font-semibold text-slate-600">
            Showing {filteredLoans.length.toLocaleString("en-US")} of {loans.length.toLocaleString("en-US")} loan(s)
          </span>
        </div>
        {canEdit ? (
          <form className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end" onSubmit={updateFilteredLocations}>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
              Province
              <input className="field mt-1 h-9 bg-white text-xs" name="province" placeholder="Keep current if blank" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
              City/Municipality
              <input className="field mt-1 h-9 bg-white text-xs" name="municipality" placeholder="Keep current if blank" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
              Barangay
              <input className="field mt-1 h-9 bg-white text-xs" name="barangay" placeholder="Keep current if blank" />
            </label>
            <button className="btn-primary h-9 px-4 text-xs" type="submit" disabled={isBulkPending || !filteredLoans.length}>
              {isBulkPending ? "Updating..." : `Update ${filteredLoans.length.toLocaleString("en-US")} filtered`}
            </button>
          </form>
        ) : null}
        {bulkMessage ? (
          <p className={`text-xs font-semibold ${bulkMessage.endsWith("updated.") ? "text-green-700" : "text-red-700"}`}>{bulkMessage}</p>
        ) : null}
      </div>
      <div className="overflow-x-auto overflow-y-visible px-4 py-3">
        <table className="w-full min-w-[1680px] text-left text-xs">
        <thead className="bg-white uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Loan</th>
            <th className="px-3 py-2">Branch</th>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">Maturity</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Principal Balance</th>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">Province</th>
            <th className="px-3 py-2">City/Municipality</th>
            <th className="px-3 py-2">Barangay</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {filteredLoans.map((loan) => <LocationReportLoanRow key={loan.id} loan={loan} canEdit={canEdit} />)}
          {!filteredLoans.length ? (
            <tr>
              <td className="px-3 py-8 text-center font-semibold text-slate-500" colSpan={12}>
                No matching clients or loans found.
              </td>
            </tr>
          ) : null}
        </tbody>
        </table>
      </div>
    </div>
  );
}

export function LocationReportLoanRow({
  loan,
  canEdit
}: {
  loan: AccountTaggingLoanRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function updateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const province = String(form.get("province") ?? "").trim();
    const municipality = String(form.get("municipality") ?? "").trim();
    const barangay = String(form.get("barangay") ?? "").trim();
    if (!province && !municipality && !barangay) {
      setMessage("Enter at least one location.");
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/account-tagging/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLoan",
          loanId: loan.id,
          province,
          municipality,
          barangay
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(data?.error ?? "Unable to update the location.");
        return;
      }
      setMessage("Saved");
      router.refresh();
    });
  }

  const formId = `location-report-loan-${loan.id}`;

  return (
    <tr>
      <td className="px-3 py-2">
        <p className="font-bold text-slate-950">{loan.clientName}</p>
        <p className="text-slate-500">{loan.clientId || "-"}</p>
      </td>
      <td className="px-3 py-2 font-bold text-brand-blue">
        <LoanDetailLink loan={loan.loanDetail} label={loan.loanNumber} />
      </td>
      <td className="px-3 py-2">{loan.branchName}</td>
      <td className="px-3 py-2">{loan.loanProduct || "-"}</td>
      <td className="px-3 py-2">{dateOnly(loan.maturityAt)}</td>
      <td className="px-3 py-2">{loan.sourceStatusName || "-"}</td>
      <td className="px-3 py-2 text-right font-bold text-red-700">
        {money(loan.principalBalance)}
      </td>
      <td className="max-w-[300px] whitespace-normal px-3 py-2 text-slate-700">{loan.address || "-"}</td>
      {canEdit ? (
        <>
          <td className="px-2 py-2">
            <input className="field h-8 min-w-[150px] text-xs" form={formId} name="province" defaultValue={loan.province ?? ""} placeholder="Province" />
          </td>
          <td className="px-2 py-2">
            <input className="field h-8 min-w-[170px] text-xs" form={formId} name="municipality" defaultValue={loan.municipality ?? ""} placeholder="City/Municipality" />
          </td>
          <td className="px-2 py-2">
            <input className="field h-8 min-w-[150px] text-xs" form={formId} name="barangay" defaultValue={loan.barangay ?? ""} placeholder="Barangay" />
          </td>
          <td className="px-2 py-2">
            <form id={formId} onSubmit={updateLocation}>
              <input type="hidden" name="loanId" value={loan.id} />
              <button className="btn-primary h-8 px-3 text-xs" type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </button>
              {message ? <p className={`mt-1 max-w-[150px] text-[10px] ${message === "Saved" ? "text-green-700" : "text-red-700"}`}>{message}</p> : null}
            </form>
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2">{loan.province || "-"}</td>
          <td className="px-3 py-2">{loan.municipality || "-"}</td>
          <td className="px-3 py-2">{loan.barangay || "-"}</td>
          <td className="px-3 py-2 text-slate-400">View only</td>
        </>
      )}
    </tr>
  );
}
