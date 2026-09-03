"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { barangayOptions, municipalityOptions, provinceOptions, type LocationOption } from "@/lib/location-options";
import { LazyLoanDetailLink } from "@/components/lazy-loan-detail-link";

export type InvalidAddressRow = {
  id: number;
  loanNumber: string;
  clientName: string;
  clientNumber: string | null;
  address: string | null;
  branch: string;
  product: string | null;
  principalBalance: number;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
};

const peso = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "PHP" });

export function InvalidAddressWorkspace({
  rows,
  locations,
  startIndex
}: {
  rows: InvalidAddressRow[];
  locations: LocationOption[];
  startIndex: number;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, { province: string; municipality: string; barangay: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [done, setDone] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Seeded from whatever the loan is currently tagged with, so a leader can see what it says
  // before changing it. Choosing a level clears the ones below it.
  function draftFor(row: InvalidAddressRow) {
    return drafts[row.id] ?? {
      province: row.province ?? "",
      municipality: row.municipality ?? "",
      barangay: row.barangay ?? ""
    };
  }

  function update(row: InvalidAddressRow, field: "province" | "municipality" | "barangay", value: string) {
    setDrafts((current) => {
      const existing = current[row.id] ?? draftFor(row);
      const next = field === "province"
        ? { province: value, municipality: "", barangay: "" }
        : field === "municipality"
          ? { ...existing, municipality: value, barangay: "" }
          : { ...existing, barangay: value };
      return { ...current, [row.id]: next };
    });
  }

  async function send(row: InvalidAddressRow, body: Record<string, unknown>, message: string) {
    setSavingId(row.id);
    setError(null);
    try {
      const response = await fetch("/api/invalid-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: row.id, ...body })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to update this loan.");
      setDone((current) => ({ ...current, [row.id]: message }));
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update this loan.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <TriangleAlert className="mr-2 inline h-4 w-4" />{error}
        </p>
      ) : null}

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[1500px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500 shadow-sm">
            <tr>
              <th className="px-3 py-3 text-right">#</th>
              <th className="px-3 py-3">Client</th>
              <th className="px-3 py-3">Loan</th>
              <th className="px-3 py-3">Branch</th>
              <th className="px-3 py-3">Address on file</th>
              <th className="px-3 py-3">Tagged as</th>
              <th className="px-3 py-3 text-right">Principal Balance</th>
              <th className="px-3 py-3">Correct Province</th>
              <th className="px-3 py-3">Correct City/Municipality</th>
              <th className="px-3 py-3">Correct Barangay</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const value = draftFor(row);
              const finished = done[row.id];
              const cities = municipalityOptions(locations, value.province);
              const barangays = barangayOptions(locations, value.province, value.municipality);
              return (
                <tr key={row.id} className={finished ? "bg-emerald-50" : "hover:bg-blue-50/50"}>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">{startIndex + index + 1}</td>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-950">{row.clientName}</p>
                    <p className="text-slate-500">{row.clientNumber ?? "-"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <LazyLoanDetailLink loanId={row.id} label={row.loanNumber} />
                  </td>
                  <td className="px-3 py-3">{row.branch}</td>
                  <td className="max-w-[240px] whitespace-normal px-3 py-3 text-slate-700">{row.address ?? "-"}</td>
                  <td className="loc-caps max-w-[200px] whitespace-normal px-3 py-3 text-red-700">
                    {row.barangay ? `${row.barangay}, ${row.municipality}, ${row.province}` : "Not tagged"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-red-700">{peso(row.principalBalance)}</td>
                  <td className="px-2 py-2">
                    <select
                      className="loc-caps field h-9 min-w-[150px] bg-white text-xs"
                      aria-label={`Correct province for ${row.clientName}`}
                      value={value.province}
                      disabled={Boolean(finished)}
                      onChange={(event) => update(row, "province", event.target.value)}
                    >
                      <option value="">Select province</option>
                      {provinceOptions(locations).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="loc-caps field h-9 min-w-[160px] bg-white text-xs"
                      aria-label={`Correct city or municipality for ${row.clientName}`}
                      value={value.municipality}
                      disabled={Boolean(finished) || !value.province}
                      onChange={(event) => update(row, "municipality", event.target.value)}
                    >
                      <option value="">{value.province ? "Select city/municipality" : "Select province first"}</option>
                      {cities.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="loc-caps field h-9 min-w-[160px] bg-white text-xs"
                      aria-label={`Correct barangay for ${row.clientName}`}
                      value={value.barangay}
                      disabled={Boolean(finished) || !value.municipality}
                      onChange={(event) => update(row, "barangay", event.target.value)}
                    >
                      <option value="">{value.municipality ? "Select barangay" : "Select city/municipality first"}</option>
                      {barangays.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    {finished ? (
                      <span className="font-bold text-brand-green">{finished}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn-primary h-9 px-3 text-xs"
                          disabled={savingId === row.id || !value.province || !value.municipality || !value.barangay}
                          onClick={() => void send(row, { province: value.province, municipality: value.municipality, barangay: value.barangay }, "Re-tagged")}
                        >
                          {savingId === row.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
                        </button>
                        <button
                          type="button"
                          className="btn-secondary h-9 px-2 text-xs"
                          title="Clear the flag without re-tagging, for an address flagged by mistake"
                          disabled={savingId === row.id}
                          onClick={() => void send(row, { clearOnly: true }, "Flag cleared")}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr><td className="px-3 py-10 text-center font-semibold text-slate-500" colSpan={11}>No loans are flagged as having an invalid address.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
