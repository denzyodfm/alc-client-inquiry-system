"use client";

import { MapPinned, X } from "lucide-react";
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

type BarangayRow = TotalsSummary & { locationId: number; name: string };
type MunicipalityRow = TotalsSummary & { name: string; barangays: BarangayRow[] };
type ProvinceRow = TotalsSummary & { name: string; municipalities: MunicipalityRow[] };

const ROW_GRID = "grid min-w-[980px] grid-cols-[minmax(220px,1fr)_100px_130px_repeat(4,125px)] items-center gap-2";

function countValue(value: number) {
  return value ? value.toLocaleString("en-US") : "-";
}

export function OfficerLocationSummary({ officerId, officerName }: { officerId: number; officerName: string }) {
  const [open, setOpen] = useState(false);
  const [provinces, setProvinces] = useState<ProvinceRow[] | null>(null);
  const [totals, setTotals] = useState<TotalsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/location-masterlist/officer-locations?officerId=${officerId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load the location summary.");
        setProvinces(data.provinces);
        setTotals(data.totals);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load the location summary.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [officerId, open]);

  return (
    <span className="ml-2 inline-block">
      <button
        type="button"
        className="rounded border border-emerald-300 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-green hover:bg-emerald-50"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        Location
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
                aria-label={`${officerName} - Loans by Location`}
                className="flex max-h-[92vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Loans by Location</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">{officerName}</h3>
                    <p className="text-xs text-slate-500">Province, city/municipality, and barangay of this officer&apos;s assigned loans. Click a client count for the loan details.</p>
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
                  {loading && !provinces ? <p className="px-5 py-12 text-center font-semibold text-slate-500">Loading location summary...</p> : null}
                  {error ? <p className="px-5 py-12 text-center font-semibold text-red-700">{error}</p> : null}
                  {provinces ? (
                    <>
                      <div className={`sticky top-0 z-10 ${ROW_GRID} border-b border-slate-200 bg-white px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
                        <span>Province / City-Municipality / Barangay</span>
                        <span className="text-right">Clients</span>
                        <span className="text-right">Portfolio</span>
                        <SummaryHeader label="Current" />
                        <SummaryHeader label="Delayed" />
                        <SummaryHeader label="Past Due" />
                        <SummaryHeader label="Litigated" />
                      </div>
                      {provinces.map((province) => (
                        <details key={province.name} className="group/province border-b border-slate-100 last:border-b-0" open>
                          <summary className={`${ROW_GRID} cursor-pointer list-none bg-slate-50 px-4 py-3 hover:bg-blue-50`}>
                            <span className="font-extrabold text-slate-950 before:mr-2 before:inline-block before:text-[10px] before:content-['▶'] group-open/province:before:rotate-90">
                              {province.name}<MapScopeLink officerId={officerId} province={province.name} label={`${province.name} province`} />
                            </span>
                            <span className="text-right font-bold text-brand-blue">{countValue(province.numberOfClients)}</span>
                            <span className="text-right font-bold text-red-700">{money(province.portfolio)}</span>
                            <SummaryMetric count={province.current} balance={province.currentBalance} />
                            <SummaryMetric count={province.delayed} balance={province.delayedBalance} />
                            <SummaryMetric count={province.pastDue} balance={province.pastDueBalance} />
                            <SummaryMetric count={province.litigated} balance={province.litigatedBalance} />
                          </summary>
                          {province.municipalities.map((municipality) => (
                            <details key={`${province.name}-${municipality.name}`} className="group/city border-t border-slate-100">
                              <summary className={`${ROW_GRID} cursor-pointer list-none bg-white px-4 py-3 pl-8 hover:bg-blue-50`}>
                                <span className="font-bold text-slate-800 before:mr-2 before:inline-block before:text-[10px] before:content-['▶'] group-open/city:before:rotate-90">
                                  {municipality.name}<MapScopeLink officerId={officerId} province={province.name} municipality={municipality.name} label={municipality.name} />
                                </span>
                                <span className="text-right font-bold text-brand-blue">{countValue(municipality.numberOfClients)}</span>
                                <span className="text-right font-bold text-red-700">{money(municipality.portfolio)}</span>
                                <SummaryMetric count={municipality.current} balance={municipality.currentBalance} />
                                <SummaryMetric count={municipality.delayed} balance={municipality.delayedBalance} />
                                <SummaryMetric count={municipality.pastDue} balance={municipality.pastDueBalance} />
                                <SummaryMetric count={municipality.litigated} balance={municipality.litigatedBalance} />
                              </summary>
                              {municipality.barangays.map((barangay) => (
                                <div key={barangay.locationId} className={`${ROW_GRID} border-t border-slate-100 px-4 py-3 pl-12`}>
                                  <span className="text-slate-700">{barangay.name}<MapScopeLink officerId={officerId} province={province.name} municipality={municipality.name} locationId={barangay.locationId} label={barangay.name} /></span>
                                  <span className="text-right font-bold text-brand-blue">
                                    <BarangayLoanReport
                                      officerId={officerId}
                                      locationId={barangay.locationId}
                                      clientCount={barangay.numberOfClients}
                                      officerName={officerName}
                                      locationName={`${barangay.name}, ${municipality.name}, ${province.name}`}
                                    />
                                  </span>
                                  <span className="text-right font-bold text-red-700">{money(barangay.portfolio)}</span>
                                  <SummaryMetric count={barangay.current} balance={barangay.currentBalance} />
                                  <SummaryMetric count={barangay.delayed} balance={barangay.delayedBalance} />
                                  <SummaryMetric count={barangay.pastDue} balance={barangay.pastDueBalance} />
                                  <SummaryMetric count={barangay.litigated} balance={barangay.litigatedBalance} />
                                </div>
                              ))}
                            </details>
                          ))}
                        </details>
                      ))}
                      {!provinces.length ? <p className="px-4 py-10 text-center font-semibold text-slate-500">No linked outstanding loans.</p> : null}
                      {totals && provinces.length ? (
                        <div className={`${ROW_GRID} border-t-2 border-slate-300 bg-slate-50 px-4 py-3 font-extrabold text-slate-950`}>
                          <span>Total</span>
                          <span className="text-right text-brand-blue">{countValue(totals.numberOfClients)}</span>
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

function MapScopeLink({ officerId, province, municipality, locationId, label }: { officerId: number; province: string; municipality?: string; locationId?: number; label: string }) {
  const params = new URLSearchParams({ province });
  if (municipality) params.set("municipality", municipality);
  if (locationId) params.set("locationId", String(locationId));
  return <a href={`/location-map/${officerId}?${params}`} target="_blank" rel="noreferrer" aria-label={`Open ${label} collection map`} title={`Open ${label} collection map`} className="ml-2 inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-50" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}><MapPinned className="h-3 w-3" />Map</a>;
}

function SummaryHeader({ label }: { label: string }) {
  return <span className="text-right"><span className="block">{label}</span><span className="block text-[9px] normal-case tracking-normal">Clients / Principal</span></span>;
}

function SummaryMetric({ count, balance }: { count: number; balance: number }) {
  return (
    <span className="text-right">
      <span className="block font-bold text-slate-900">{countValue(count)}</span>
      <span className="mt-0.5 block text-[10px] font-bold text-red-700">{money(balance)}</span>
    </span>
  );
}
