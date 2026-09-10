"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { UserRoundSearch } from "lucide-react";
import type { OfficerScope, ScopedOfficer } from "@/lib/officer-scope";

// One dropdown for the place, one for the officer. An area is answered by Remedial Officers
// and a branch by Loan Officers, so choosing the place already decides which kind of officer is
// on offer - which is why the place is a single list rather than an area filter and a branch
// filter that could be set to a combination nobody is in.
export function OfficerPicker({
  scopes,
  officers,
  selectedId,
  selectedAll = false,
  allowAll = false,
  basePath = "/my-clients",
  subject = "clients"
}: {
  scopes: OfficerScope[];
  officers: ScopedOfficer[];
  selectedId: number | null;
  selectedAll?: boolean;
  // My Clients can total a whole area or branch. My Schedule cannot: a calendar is one
  // person's day, and the schedule it draws is fetched for a single officer.
  allowAll?: boolean;
  basePath?: string;
  subject?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  // A team leader has one place, so there is nothing to decide and it starts chosen. A reader
  // with many - HO TL, or an administrator - starts on whatever the address bar already names,
  // so opening a link or refreshing the page does not empty the officer list underneath them.
  const [scopeId, setScopeId] = useState(() => {
    const fromUrl = params.get("scope") ?? "";
    if (fromUrl && scopes.some((candidate) => candidate.id === fromUrl)) return fromUrl;
    return scopes.length === 1 ? scopes[0].id : "";
  });

  const scope = scopes.find((candidate) => candidate.id === scopeId) ?? null;
  const matches = useMemo(
    () => (scopeId ? officers.filter((officer) => officer.scopeIds.includes(scopeId)) : []),
    [officers, scopeId]
  );

  // A scope yields one kind of officer by design, so this is usually exact; it falls back to
  // the umbrella only if a list somehow holds both.
  const roles = new Set(matches.map((officer) => (officer.role ?? "").trim()).filter(Boolean));
  const word = roles.size === 1 ? [...roles][0] : "Loan / Remedial Officer";
  const article = /^[aeiou]/i.test(word) ? "an" : "a";

  const areas = scopes.filter((candidate) => candidate.kind === "area");
  const branches = scopes.filter((candidate) => candidate.kind === "branch");

  function choose(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id) {
      next.set("officerId", id);
      next.set("scope", scopeId);
    } else {
      next.delete("officerId");
      next.delete("scope");
    }
    router.push(next.toString() ? `${basePath}?${next.toString()}` : basePath);
  }

  function chooseScope(value: string) {
    setScopeId(value);
    // The officer already chosen may not work in the new place.
    if (selectedId && !officers.some((officer) => officer.id === selectedId && officer.scopeIds.includes(value))) {
      choose("");
    }
  }

  if (!scopes.length) {
    return (
      <section className="panel p-5">
        <h3 className="font-bold text-slate-950">Nothing assigned to you</h3>
        <p className="mt-1 text-sm text-slate-600">
          This layout reads one officer at a time, chosen from the area or branch you lead. Neither is recorded against
          your account, so there is nobody to show. An administrator can set that on your user record.
        </p>
      </section>
    );
  }

  return (
    <section className="panel p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-brand-blue">
        <UserRoundSearch className="h-5 w-5" />
      </div>
      <h3 className="font-bold text-slate-950">Choose {article} {word.toLocaleLowerCase("en")}</h3>
      <p className="mt-1 text-sm text-slate-600">
        This layout shows one officer&rsquo;s {subject} at a time. Pick an area for its Remedial Officers, or a branch
        for its Loan Officers.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Area or branch
          <select
            className="field mt-1 loc-caps"
            value={scopeId}
            onChange={(event) => chooseScope(event.target.value)}
            disabled={scopes.length === 1}
          >
            {scopes.length === 1 ? null : <option value="">Select an area or branch</option>}
            {areas.length ? (
              <optgroup label="Areas">
                {areas.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                ))}
              </optgroup>
            ) : null}
            {branches.length ? (
              <optgroup label="Branches">
                {branches.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          {word}
          <select
            className="field mt-1 loc-caps"
            value={selectedAll ? "all" : selectedId ? String(selectedId) : ""}
            onChange={(event) => choose(event.target.value)}
            disabled={!scopeId}
          >
            <option value="">
              {scopeId ? `Select ${article} ${word.toLocaleLowerCase("en")}` : "Choose an area or branch first"}
            </option>
            {allowAll && scopeId && matches.length > 1 ? (
              <option value="all">[ ALL ] {matches.length} {word.toLocaleLowerCase("en")}(s)</option>
            ) : null}
            {matches.map((officer) => (
              <option key={officer.id} value={officer.id}>{officer.name}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        {scope
          ? `${matches.length.toLocaleString("en-US")} officer(s) in ${scope.label}.`
          : `${scopes.length.toLocaleString("en-US")} area(s) and branch(es) available to you.`}
      </p>
    </section>
  );
}
