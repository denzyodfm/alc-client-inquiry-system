"use client";

import { useEffect, useState } from "react";
import { BarangayLoanReport } from "@/components/officer-barangay-loans";
import { money } from "@/lib/format";

type Metrics = { numberOfClients: number; portfolio: number; current: number; currentBalance: number; delayed: number; delayedBalance: number; pastDue: number; pastDueBalance: number; litigated: number; litigatedBalance: number };
type Barangay = Metrics & { locationId: number; name: string };
type Municipality = Metrics & { name: string; barangays: Barangay[] };
type Province = Metrics & { name: string; municipalities: Municipality[] };
const GRID = "grid min-w-[1350px] grid-cols-[minmax(300px,1fr)_100px_160px_repeat(4,150px)] items-center";
const count = (value: number) => value ? value.toLocaleString("en-US") : "-";

export function OfficerInlineLocationRows({ officerId, officerName }: { officerId: number; officerName: string }) {
  const [provinces, setProvinces] = useState<Province[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/location-masterlist/officer-locations?officerId=${officerId}`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error ?? "Unable to load locations."); setProvinces(data.provinces); })
      .catch((requestError) => { if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError(requestError instanceof Error ? requestError.message : "Unable to load locations."); });
    return () => controller.abort();
  }, [officerId]);

  if (error) return <p className="px-4 py-3 font-semibold text-red-700">{error}</p>;
  if (!provinces) return <p className="px-4 py-3 font-semibold text-slate-500">Loading assigned locations...</p>;
  if (!provinces.length) return <p className="px-4 py-3 text-slate-500">No linked outstanding loans.</p>;
  return <div className="divide-y divide-slate-100">{provinces.map((province) => <details key={province.name} className="group/province" open>
    <summary className={`${GRID} cursor-pointer list-none bg-slate-50 px-4 py-3 hover:bg-blue-50`}><LocationName level="Province" name={province.name} /><MetricsCells metrics={province} /></summary>
    <div className="pl-5">{province.municipalities.map((municipality) => <details key={`${province.name}-${municipality.name}`} className="group/municipality border-t border-slate-100">
      <summary className={`${GRID} cursor-pointer list-none px-4 py-3 hover:bg-blue-50`}><LocationName level="City / Municipality" name={municipality.name} /><MetricsCells metrics={municipality} /></summary>
      <div className="pl-5">{municipality.barangays.map((barangay) => <div key={barangay.locationId} className={`${GRID} selected-report-row border-t border-slate-100 px-4 py-3`}>
        <LocationName level="Barangay" name={barangay.name} leaf />
        <span className="text-right font-bold text-brand-blue"><BarangayLoanReport officerId={officerId} locationId={barangay.locationId} clientCount={barangay.numberOfClients} officerName={officerName} locationName={`${barangay.name}, ${municipality.name}, ${province.name}`} /></span>
        <BalanceAndStatuses metrics={barangay} />
      </div>)}</div>
    </details>)}</div>
  </details>)}</div>;
}

function LocationName({ level, name, leaf = false }: { level: string; name: string; leaf?: boolean }) {
  return <span className={`font-semibold text-slate-800 ${leaf ? "pl-4" : "before:mr-2 before:inline-block before:text-[9px] before:content-['▶'] group-open/province:before:rotate-90 group-open/municipality:before:rotate-90"}`}><span className="mr-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{level}</span>{name}</span>;
}
function MetricsCells({ metrics }: { metrics: Metrics }) { return <><span className="text-right font-bold text-brand-blue">{count(metrics.numberOfClients)}</span><BalanceAndStatuses metrics={metrics} /></>; }
function BalanceAndStatuses({ metrics }: { metrics: Metrics }) { return <><span className="text-right font-bold text-red-700">{money(metrics.portfolio)}</span><Status count={metrics.current} balance={metrics.currentBalance} /><Status count={metrics.delayed} balance={metrics.delayedBalance} /><Status count={metrics.pastDue} balance={metrics.pastDueBalance} /><Status count={metrics.litigated} balance={metrics.litigatedBalance} /></>; }
function Status({ count: value, balance }: { count: number; balance: number }) { return <span className="px-2 text-right"><span className="block font-bold text-slate-900">{count(value)}</span><span className="block text-[10px] font-bold text-red-700">{money(balance)}</span></span>; }
