"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

export type LocationCustomerRecord = {
  loanId: number;
  provinceKey: string;
  municipalityKey: string;
  clientName: string;
  clientNumber: string | null;
  loanNumber: string;
  accountOfficer: string;
  status: string;
  principalBalance: number;
  address: string | null;
};

type DetailScope = {
  type: "province" | "municipality";
  key: string;
  name: string;
};

const LocationDetailsContext = createContext<{
  openDetails: (scope: DetailScope) => void;
} | null>(null);

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
}

export function LocationDetailsProvider({
  records,
  children
}: {
  records: LocationCustomerRecord[];
  children: ReactNode;
}) {
  const [scope, setScope] = useState<DetailScope | null>(null);
  const visibleRecords = useMemo(() => {
    if (!scope) return [];
    return records.filter((record) =>
      scope.type === "province" ? record.provinceKey === scope.key : record.municipalityKey === scope.key
    );
  }, [records, scope]);

  return (
    <LocationDetailsContext.Provider value={{ openDetails: setScope }}>
      {children}
      {scope ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[88vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Customer Details</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{scope.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{visibleRecords.length.toLocaleString("en-US")} outstanding loan(s)</p>
              </div>
              <button className="btn-secondary" type="button" onClick={() => setScope(null)}>Close</button>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[1050px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Loan</th>
                    <th className="px-4 py-3">Account Officer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Principal Balance</th>
                    <th className="px-4 py-3">Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRecords.map((record) => (
                    <tr key={record.loanId}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-950">{record.clientName}</p>
                        <p className="text-slate-500">{record.clientNumber || "-"}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-brand-blue">{record.loanNumber}</td>
                      <td className="px-4 py-3">{record.accountOfficer}</td>
                      <td className="px-4 py-3">{record.status}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">{money(record.principalBalance)}</td>
                      <td className="max-w-md whitespace-normal px-4 py-3 text-slate-700">{record.address || "-"}</td>
                    </tr>
                  ))}
                  {!visibleRecords.length ? (
                    <tr><td className="px-4 py-10 text-center font-semibold text-slate-500" colSpan={6}>No linked outstanding loans.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </LocationDetailsContext.Provider>
  );
}

export function LocationClientCount({
  value,
  scope
}: {
  value: number;
  scope: DetailScope;
}) {
  const context = useContext(LocationDetailsContext);

  return (
    <span className="text-right">
      <button
        type="button"
        className="font-bold text-brand-blue underline decoration-dotted underline-offset-2"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          context?.openDetails(scope);
        }}
        title="Click to view customer details"
      >
        {value.toLocaleString("en-US")}
      </button>
    </span>
  );
}
