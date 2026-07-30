"use client";

import { useState } from "react";

export type AccountOfficerSummaryRow = {
  key: string;
  name: string;
  numberOfClients: number;
  portfolio: number;
  current: number;
  delayed: number;
  pastDue: number;
  litigated: number;
};

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
}

export function AccountOfficerSummary({
  locationName,
  rows
}: {
  locationName: string;
  rows: AccountOfficerSummaryRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative ml-3 inline-block">
      <button
        type="button"
        className="rounded border border-blue-300 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-blue hover:bg-blue-50"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        Account Officers
      </button>
      {open ? (
        <span
          className="absolute left-0 top-full z-30 mt-2 block w-[760px] max-w-[80vw] overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xl"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <span className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <span>
              <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">Account Officer Summary</span>
              <span className="mt-1 block font-bold text-slate-950">{locationName}</span>
            </span>
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-white"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }}
            >
              Close
            </button>
          </span>
          <span className="block max-h-80 overflow-auto">
            <span className="grid min-w-[720px] grid-cols-[minmax(180px,1fr)_80px_130px_repeat(4,70px)] gap-2 border-b border-slate-200 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span>Account Officer</span><span className="text-right">Clients</span><span className="text-right">Portfolio</span>
              <span className="text-right">Current</span><span className="text-right">Delayed</span>
              <span className="text-right">Past Due</span><span className="text-right">Litigated</span>
            </span>
            {rows.map((row) => (
              <span key={row.key} className="grid min-w-[720px] grid-cols-[minmax(180px,1fr)_80px_130px_repeat(4,70px)] gap-2 border-b border-slate-100 px-4 py-2 last:border-b-0">
                <span className="font-semibold text-slate-800">{row.name}</span>
                <span className="text-right font-bold text-brand-blue">{row.numberOfClients.toLocaleString("en-US")}</span>
                <span className="text-right font-bold text-red-700">{money(row.portfolio)}</span>
                <span className="text-right">{row.current.toLocaleString("en-US")}</span>
                <span className="text-right">{row.delayed.toLocaleString("en-US")}</span>
                <span className="text-right">{row.pastDue.toLocaleString("en-US")}</span>
                <span className="text-right">{row.litigated.toLocaleString("en-US")}</span>
              </span>
            ))}
            {!rows.length ? <span className="block px-4 py-6 text-center font-semibold text-slate-500">No linked outstanding loans.</span> : null}
          </span>
        </span>
      ) : null}
    </span>
  );
}
