"use client";

import { Printer, ShieldCheck } from "lucide-react";

type FunctionGroup = { key: string; label: string; purpose: string };
type AppFunctionality = { key: string; label: string; explanation: string; group: string };

export function AppFunctionalities({
  groups,
  functions,
  holders
}: {
  groups: FunctionGroup[];
  functions: AppFunctionality[];
  holders: Record<string, string[]>;
}) {
  const asOf = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());

  // Only groups that actually have functions are shown, so an empty group added ahead of its
  // features does not leave a bare heading on a page meant to be handed to management.
  const populated = groups
    .map((group) => ({ ...group, items: functions.filter((item) => item.group === group.key) }))
    .filter((group) => group.items.length > 0);

  // A function whose group is missing from FUNCTION_GROUPS would otherwise vanish silently. The
  // `satisfies` clause on APP_FUNCTIONS makes that a build error, but if the two ever do drift
  // the page says so rather than under-reporting what the system can do.
  const orphaned = functions.filter((item) => !groups.some((group) => group.key === item.group));

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-xl font-bold text-slate-950">App Functionalities</h3>
        <p className="mt-1 text-sm text-slate-600">
          Every function this system provides, grouped by the part of the business it serves, with a plain-language
          explanation of what it does. {functions.length} functions in {populated.length} groups, as of {asOf}.
        </p>
      </div>
      <button type="button" className="btn-secondary px-3 py-1.5 text-xs print:hidden" onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" />Print
      </button>
    </div>

    <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-brand-green">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      Administrators hold every function. Everyone else holds only what their privilege is granted on the Access Matrix tab.
    </div>

    {populated.map((group) => <section key={group.key} className="panel p-4">
      <div className="border-b border-slate-200 pb-3">
        <h4 className="font-bold text-slate-950">{group.label}</h4>
        <p className="mt-1 text-xs leading-5 text-slate-600">{group.purpose}</p>
      </div>
      <dl className="divide-y divide-slate-100">
        {group.items.map((item) => {
          const held = holders[item.key] ?? [];
          return <div key={item.key} className="grid gap-1 py-3 md:grid-cols-[14rem_1fr] md:gap-4">
            <dt className="font-bold text-slate-900">{item.label}</dt>
            <dd>
              <p className="text-sm leading-6 text-slate-600">{item.explanation}</p>
              <p className="mt-1.5 text-xs text-slate-500">
                <span className="font-semibold">Granted to:</span>{" "}
                {held.length
                  ? held.join(", ")
                  : "no privilege yet - administrators only"}
              </p>
            </dd>
          </div>;
        })}
      </dl>
    </section>)}

    {orphaned.length ? <section className="panel border-amber-200 p-4">
      <h4 className="font-bold text-amber-900">Ungrouped</h4>
      <p className="mt-1 text-xs text-amber-800">
        These functions name a group that no longer exists, so they are listed here rather than left out.
      </p>
      <dl className="mt-2 divide-y divide-slate-100">
        {orphaned.map((item) => <div key={item.key} className="grid gap-1 py-3 md:grid-cols-[14rem_1fr] md:gap-4">
          <dt className="font-bold text-slate-900">{item.label}</dt>
          <dd className="text-sm leading-6 text-slate-600">{item.explanation}</dd>
        </div>)}
      </dl>
    </section> : null}
  </div>;
}
