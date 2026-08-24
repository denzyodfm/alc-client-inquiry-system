"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

export type FilterOption = { value: string; label: string; count?: number };

// One checkbox group in the Rediscounting filters. Its options can be sorted by name or by
// how many loans carry them, so a long list can be read either way.
export function RediscountingFilterGroup({
  title,
  name,
  options,
  selected
}: {
  title: string;
  name: string;
  options: FilterOption[];
  selected: string[];
}) {
  const [sort, setSort] = useState<{ key: "label" | "count"; dir: "asc" | "desc" }>({ key: "label", dir: "asc" });
  const sorted = useMemo(() => {
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...options].sort((a, b) => direction * (sort.key === "label"
      ? a.label.localeCompare(b.label, "en", { numeric: true, sensitivity: "base" })
      : (a.count ?? 0) - (b.count ?? 0)));
  }, [options, sort]);

  function toggle(key: "label" | "count") {
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "label" ? "asc" : "desc" });
  }

  const arrow = (key: "label" | "count") => sort.key !== key
    ? null
    : sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;

  return (
    <fieldset className="rounded-md border border-slate-200">
      <legend className="ml-2 px-1 text-xs font-semibold text-slate-600">{title}</legend>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <button type="button" className={`inline-flex items-center gap-1 transition hover:text-brand-blue ${sort.key === "label" ? "text-brand-blue" : ""}`} onClick={() => toggle("label")}>
          Name{arrow("label")}
        </button>
        {options.some((option) => option.count !== undefined) ? (
          <button type="button" className={`inline-flex items-center gap-1 transition hover:text-brand-blue ${sort.key === "count" ? "text-brand-blue" : ""}`} onClick={() => toggle("count")}>
            Loans{arrow("count")}
          </button>
        ) : null}
      </div>
      <div className="max-h-40 space-y-1 overflow-auto p-2">
        {sorted.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-300"
              name={name}
              value={option.value}
              defaultChecked={selected.includes(option.value)}
            />
            <span className="flex-1 truncate" title={option.label}>{option.label}</span>
            {option.count === undefined ? null : <span className="text-slate-400">{option.count.toLocaleString("en-US")}</span>}
          </label>
        ))}
        {!options.length ? <p className="text-xs text-slate-500">Nothing to choose from yet.</p> : null}
      </div>
    </fieldset>
  );
}
