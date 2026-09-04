"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { UserRoundSearch } from "lucide-react";

export type PickableOfficer = { id: number; name: string; detail: string | null };

// An administrator reads somebody else's book, so they have to say whose first. An officer
// never sees this - their own name is not a choice they need to make.
export function OfficerPicker({ officers, selectedId }: { officers: PickableOfficer[]; selectedId: number | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
    if (!terms.length) return officers;
    return officers.filter((officer) => {
      const haystack = `${officer.name} ${officer.detail ?? ""}`.toLocaleLowerCase("en");
      return terms.every((term) => haystack.includes(term));
    });
  }, [officers, query]);

  function choose(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("officerId", id);
    else next.delete("officerId");
    router.push(next.toString() ? `/my-clients?${next.toString()}` : "/my-clients");
  }

  return (
    <section className="panel p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-brand-blue">
        <UserRoundSearch className="h-5 w-5" />
      </div>
      <h3 className="font-bold text-slate-950">Choose an account officer</h3>
      <p className="mt-1 text-sm text-slate-600">
        This layout shows one officer&rsquo;s clients at a time. Pick whose book to read.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_2fr]">
        <input
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name, area, or branch"
        />
        <select className="field loc-caps" value={selectedId ? String(selectedId) : ""} onChange={(event) => choose(event.target.value)}>
          <option value="">Select an account officer</option>
          {matches.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.name}{officer.detail ? ` \u2014 ${officer.detail}` : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        {matches.length.toLocaleString("en-US")} of {officers.length.toLocaleString("en-US")} officer(s) listed.
      </p>
    </section>
  );
}
