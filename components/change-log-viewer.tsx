"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ChangeLogEntry } from "@/lib/change-log";

const PAGE_SIZE = 40;

function longDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export function ChangeLogViewer({ entries }: { entries: ChangeLogEntry[] }) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Newest first: the most recent change is the one an administrator is usually checking.
  const ordered = useMemo(() => [...entries].sort((a, b) => b.number - a.number), [entries]);
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
    if (!terms.length) return ordered;
    return ordered.filter((entry) => {
      const haystack = `${entry.number} ${entry.date} ${entry.commit} ${entry.title} ${entry.request ?? ""}`.toLocaleLowerCase("en");
      return terms.every((term) => haystack.includes(term));
    });
  }, [ordered, query]);

  const shown = filtered.slice(0, visible);
  const withRequest = entries.filter((entry) => entry.request).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="relative block min-w-[280px] flex-1">
          <span className="sr-only">Search the change log</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="field pl-9"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setVisible(PAGE_SIZE); }}
            placeholder="Search by number, date, change, or request"
          />
        </label>
        <p className="text-xs font-semibold text-slate-500">
          {filtered.length.toLocaleString("en-US")} of {entries.length.toLocaleString("en-US")} change(s)
          {withRequest ? ` · ${withRequest.toLocaleString("en-US")} with the original request` : ""}
        </p>
      </div>

      <ol className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {shown.map((entry) => (
          <li key={entry.commit} className="grid grid-cols-[auto_1fr] gap-3 px-4 py-3 hover:bg-blue-50/50">
            <span className="mt-0.5 inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded bg-blue-50 px-2 text-xs font-extrabold tabular-nums text-brand-blue">
              {entry.number}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-bold text-slate-950">{entry.title}</span>
                <span className="text-xs font-semibold text-slate-500">{longDate(entry.date)}</span>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{entry.commit}</code>
              </div>
              {entry.request ? (
                <p className="mt-1.5 border-l-2 border-brand-yellow pl-3 text-xs italic text-slate-600">
                  <span className="font-bold uppercase not-italic tracking-wide text-brand-green">Requested: </span>
                  {entry.request}
                </p>
              ) : null}
            </div>
          </li>
        ))}
        {!shown.length ? <li className="px-4 py-10 text-center font-semibold text-slate-500">No changes match that search.</li> : null}
      </ol>

      {visible < filtered.length ? (
        <div className="text-center">
          <button type="button" className="btn-secondary" onClick={() => setVisible((current) => current + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
          </button>
        </div>
      ) : null}
    </div>
  );
}
