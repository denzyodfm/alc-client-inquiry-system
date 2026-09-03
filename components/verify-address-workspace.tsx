"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { barangayOptions, municipalityOptions, provinceOptions, withCurrentValue } from "@/lib/location-options";
import { LazyLoanDetailLink } from "@/components/lazy-loan-detail-link";

export type VerifyAddressRow = {
  loanId: number;
  loanNumber: string;
  clientName: string;
  clientId: string | null;
  address: string | null;
  branchName: string;
  branchCode: string;
  province: string;
  municipality: string;
  barangay: string;
};

type LocationOption = { province: string; municipality: string; barangay: string };

export function VerifyAddressWorkspace({
  rows,
  totalRows,
  firstResult,
  lastResult,
  safePage,
  totalPages,
  previousHref,
  nextHref,
  locationOptions
}: {
  rows: VerifyAddressRow[];
  totalRows: number;
  firstResult: number;
  lastResult: number;
  safePage: number;
  totalPages: number;
  previousHref: string;
  nextHref: string;
  locationOptions: LocationOption[];
}) {
  const router = useRouter();
  const [fixed, setFixed] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<Record<number, { province: string; municipality: string; barangay: string }>>({});
  const [savingLoanId, setSavingLoanId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const provinces = useMemo(() => provinceOptions(locationOptions), [locationOptions]);

  function draftFor(row: VerifyAddressRow) {
    return draft[row.loanId] ?? { province: row.province, municipality: row.municipality, barangay: row.barangay };
  }

  // Changing a level clears the ones it scoped, so a correction cannot be saved with a
  // barangay left over from the province it was picked under.
  function updateDraft(loanId: number, field: "province" | "municipality" | "barangay", value: string, row: VerifyAddressRow) {
    setDraft((current) => {
      const existing = current[loanId] ?? { province: row.province, municipality: row.municipality, barangay: row.barangay };
      const next = field === "province"
        ? { province: value, municipality: "", barangay: "" }
        : field === "municipality"
          ? { ...existing, municipality: value, barangay: "" }
          : { ...existing, barangay: value };
      return { ...current, [loanId]: next };
    });
  }

  async function save(row: VerifyAddressRow) {
    const value = draftFor(row);
    setSavingLoanId(row.loanId);
    setErrors((current) => ({ ...current, [row.loanId]: "" }));
    try {
      const response = await fetch("/api/location-masterlist/verify-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: row.loanId, ...value })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors((current) => ({ ...current, [row.loanId]: data?.error ?? "Unable to save this correction." }));
        return;
      }
      setFixed((current) => new Set(current).add(row.loanId));
      router.refresh();
    } catch {
      setErrors((current) => ({ ...current, [row.loanId]: "Unable to save this correction." }));
    } finally {
      setSavingLoanId(null);
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <p className="text-sm font-bold text-slate-950">
          Showing {firstResult.toLocaleString("en-US")}-{lastResult.toLocaleString("en-US")} of {totalRows.toLocaleString("en-US")} unverified loan(s)
        </p>
        <p className="text-xs font-semibold text-slate-500">Page {safePage} of {totalPages}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px] text-left text-xs">
          <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Client</th>
              <th className="px-3 py-3">Loan</th>
              <th className="px-3 py-3">Branch</th>
              <th className="px-3 py-3">Address on file</th>
              <th className="px-3 py-3">Tagged as (wrong)</th>
              <th className="px-3 py-3">Correct Province</th>
              <th className="px-3 py-3">Correct City/Municipality</th>
              <th className="px-3 py-3">Correct Barangay</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const value = draftFor(row);
              const isFixed = fixed.has(row.loanId);
              const municipalityChoices = municipalityOptions(locationOptions, value.province);
              const barangayChoices = barangayOptions(locationOptions, value.province, value.municipality);
              return (
                <tr key={row.loanId} className={isFixed ? "bg-emerald-50" : undefined}>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-950">{row.clientName}</p>
                    <p className="text-slate-500">{row.clientId ?? "-"}</p>
                  </td>
                  <td className="px-3 py-3"><LazyLoanDetailLink loanId={row.loanId} label={row.loanNumber} /></td>
                  <td className="px-3 py-3">{row.branchName}<p className="text-slate-500">{row.branchCode}</p></td>
                  <td className="max-w-[260px] whitespace-normal px-3 py-3 text-slate-700">{row.address ?? "-"}</td>
                  <td className="loc-caps max-w-[200px] whitespace-normal px-3 py-3 text-red-700">
                    {row.barangay}, {row.municipality}, {row.province}
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="loc-caps field h-9 min-w-[150px] bg-white text-xs"
                      aria-label={`Correct province for ${row.clientName}`}
                      value={value.province}
                      disabled={isFixed}
                      onChange={(event) => updateDraft(row.loanId, "province", event.target.value, row)}
                    >
                      <option value="">Select province</option>
                      {withCurrentValue(provinces, value.province).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="loc-caps field h-9 min-w-[150px] bg-white text-xs"
                      aria-label={`Correct city or municipality for ${row.clientName}`}
                      value={value.municipality}
                      disabled={isFixed || !value.province}
                      onChange={(event) => updateDraft(row.loanId, "municipality", event.target.value, row)}
                    >
                      <option value="">{value.province ? "Select city/municipality" : "Select province first"}</option>
                      {withCurrentValue(municipalityChoices, value.municipality).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="loc-caps field h-9 min-w-[160px] bg-white text-xs"
                      aria-label={`Correct barangay for ${row.clientName}`}
                      value={value.barangay}
                      disabled={isFixed || !value.municipality}
                      onChange={(event) => updateDraft(row.loanId, "barangay", event.target.value, row)}
                    >
                      <option value="">{value.municipality ? "Select barangay" : "Select city/municipality first"}</option>
                      {withCurrentValue(barangayChoices, value.barangay).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    {isFixed ? (
                      <span className="font-bold text-brand-green">Saved</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary h-9 px-3 text-xs"
                        disabled={savingLoanId === row.loanId}
                        onClick={() => save(row)}
                      >
                        {savingLoanId === row.loanId ? "Saving..." : "Save"}
                      </button>
                    )}
                    {errors[row.loanId] ? <p className="mt-1 max-w-[180px] whitespace-normal text-red-600">{errors[row.loanId]}</p> : null}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td className="px-3 py-10 text-center font-semibold text-slate-500" colSpan={9}>
                  No unverified addresses on this page.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <Link className={`btn-secondary h-9 px-3 ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`} href={previousHref}>
          Previous
        </Link>
        <Link className={`btn-secondary h-9 px-3 ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`} href={nextHref}>
          Next
        </Link>
      </div>
    </section>
  );
}
