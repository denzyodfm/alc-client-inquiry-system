"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { UserRoundSearch } from "lucide-react";

export type PickableOfficer = {
  id: number;
  name: string;
  // Where the officer is read from. A Remedial Officer answers to an area, a Loan Officer to a
  // branch, and both are carried so either filter can narrow the list.
  area: string | null;
  branch: string | null;
  role: string | null;
};

// Whatever the officers on offer actually are. With one kind on the list the layout can say so
// exactly; with both it has to keep the umbrella term, because calling a Loan Officer a
// Remedial Officer would simply be wrong.
function roleWord(officers: PickableOfficer[]) {
  const roles = new Set(officers.map((officer) => (officer.role ?? "").trim()).filter(Boolean));
  if (roles.size === 1) return [...roles][0];
  return "Loan / Remedial Officer";
}

// An administrator reads somebody else's book, so they have to say whose first. An officer
// never sees this - their own name is not a choice they need to make.
export function OfficerPicker({ officers, selectedId }: { officers: PickableOfficer[]; selectedId: number | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [area, setArea] = useState("");
  const [branch, setBranch] = useState("");

  const areas = useMemo(
    () => Array.from(new Set(officers.map((officer) => officer.area).filter((value): value is string => Boolean(value)))).sort(),
    [officers]
  );

  // Branches narrow to the chosen area, so the two filters cannot be set to a combination
  // nobody is in.
  const branches = useMemo(() => {
    const inArea = area ? officers.filter((officer) => officer.area === area) : officers;
    return Array.from(new Set(inArea.map((officer) => officer.branch).filter((value): value is string => Boolean(value)))).sort();
  }, [officers, area]);

  const matches = useMemo(
    () => officers.filter((officer) => (!area || officer.area === area) && (!branch || officer.branch === branch)),
    [officers, area, branch]
  );

  const word = roleWord(matches.length ? matches : officers);
  const article = /^[aeiou]/i.test(word) ? "an" : "a";

  function choose(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("officerId", id);
    else next.delete("officerId");
    router.push(next.toString() ? `/my-clients?${next.toString()}` : "/my-clients");
  }

  function chooseArea(value: string) {
    setArea(value);
    // The branch that was chosen may not exist inside the new area.
    if (value && branch && !officers.some((officer) => officer.area === value && officer.branch === branch)) {
      setBranch("");
    }
  }

  return (
    <section className="panel p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-brand-blue">
        <UserRoundSearch className="h-5 w-5" />
      </div>
      <h3 className="font-bold text-slate-950">Choose {article} {word.toLocaleLowerCase("en")}</h3>
      <p className="mt-1 text-sm text-slate-600">
        This layout shows one officer&rsquo;s clients at a time. Narrow by area or branch, then pick whose book to read.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Area
          <select className="field mt-1 loc-caps" value={area} onChange={(event) => chooseArea(event.target.value)}>
            <option value="">All areas</option>
            {areas.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Branch
          <select className="field mt-1 loc-caps" value={branch} onChange={(event) => setBranch(event.target.value)}>
            <option value="">All branches</option>
            {branches.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          {word}
          <select
            className="field mt-1 loc-caps"
            value={selectedId ? String(selectedId) : ""}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">Select {article} {word.toLocaleLowerCase("en")}</option>
            {matches.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}
                {officer.role ? ` — ${officer.role}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        {matches.length.toLocaleString("en-US")} of {officers.length.toLocaleString("en-US")} officer(s) listed.
      </p>
    </section>
  );
}
