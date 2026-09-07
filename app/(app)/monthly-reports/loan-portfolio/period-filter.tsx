"use client";

import { useRouter } from "next/navigation";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Year and month pickers for the captured months. They are always shown, even when only one
// month exists: a control that appears once there is something to choose leaves the reader
// wondering whether the report can look back at all.
export function PeriodFilter({
  years,
  months,
  captured,
  year,
  month
}: {
  years: number[];
  // Every month of the chosen year that has ended, captured or not.
  months: string[];
  // Which of those actually hold figures.
  captured: string[];
  year: number;
  month: string;
}) {
  const router = useRouter();

  function go(nextYear: number, nextMonth: string) {
    const params = new URLSearchParams();
    params.set("year", String(nextYear));
    if (nextMonth) params.set("month", nextMonth);
    router.push(`/monthly-reports/loan-portfolio?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
        Year
        <select
          className="field mt-1 h-10 min-w-28"
          value={String(year)}
          onChange={(event) => go(Number(event.target.value), "")}
        >
          {years.map((candidate) => (
            <option key={candidate} value={candidate}>{candidate}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
        Month
        <select
          className="field mt-1 h-10 min-w-44"
          value={month}
          onChange={(event) => go(year, event.target.value)}
        >
          <option value="">All captured months ({captured.length})</option>
          {months.map((candidate) => (
            <option key={candidate} value={candidate}>
              {MONTHS[Number(candidate.slice(5, 7)) - 1]} {candidate.slice(0, 4)}
              {captured.includes(candidate) ? "" : " — not captured"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
