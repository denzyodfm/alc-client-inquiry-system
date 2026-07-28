"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AccountTaggingLoanRow } from "@/components/account-tagging-workspace";
import { LoanDetailLink } from "@/components/loan-detail-link";
import { dateOnly } from "@/lib/format";

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
        {loan.principalBalance.toLocaleString("en-US", { style: "currency", currency: "PHP" })}
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
