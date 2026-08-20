"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/format";

type ScheduleEntry = {
  id: number;
  date: string;
  logType: string;
  subject: string | null;
  notes: string;
  amount: number | null;
  loggedAt: string;
  clientName: string;
  clientNumber: string | null;
  branch: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// The follow-up and promise-to-pay dates an officer recorded, laid out as a month calendar.
export function OfficerLogCalendar({ officerId, officerName }: { officerId: number; officerName: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/client-logs/schedule?officerId=${officerId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load the schedule.");
        setEntries(data.entries);
        // Open on the month holding the next upcoming entry, else the latest one.
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = data.entries.find((entry: ScheduleEntry) => entry.date >= today) ?? data.entries[data.entries.length - 1];
        if (upcoming) setCursor(new Date(`${upcoming.date}T00:00:00`));
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load the schedule.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [officerId, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of entries ?? []) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return map;
  }, [entries]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthEntries = (entries ?? []).filter((entry) => entry.date.startsWith(monthKey(cursor)));
  const monthPromised = monthEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  const selectedEntries = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <>
      <button
        type="button"
        className="text-left font-semibold text-brand-blue hover:underline"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        title={`Follow-up and promise-to-pay schedule for ${officerName}`}
      >
        {officerName}
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
              role="presentation"
              onMouseDown={() => setOpen(false)}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-label={`Schedule for ${officerName}`}
                className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Follow-up / Promise to Pay</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">{officerName}</h3>
                    <p className="text-xs text-slate-500">Scheduled from the dates recorded on their client logs.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn-secondary h-9 px-2" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-40 text-center text-sm font-bold text-slate-900">{monthLabel}</span>
                    <button type="button" className="btn-secondary h-9 px-2" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={() => setCursor(new Date())}>
                      <CalendarDays className="h-4 w-4" />Today
                    </button>
                    <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900" onClick={() => setOpen(false)} aria-label="Close">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </header>
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-600">
                  {entries
                    ? `${monthEntries.length.toLocaleString("en-US")} scheduled entr${monthEntries.length === 1 ? "y" : "ies"} this month | ${money(monthPromised)} promised | ${entries.length.toLocaleString("en-US")} in total`
                    : "Loading..."}
                </div>
                <div className="overflow-auto p-4">
                  {loading && !entries ? <p className="px-5 py-12 text-center font-semibold text-slate-500">Loading schedule...</p> : null}
                  {error ? <p className="px-5 py-12 text-center font-semibold text-red-700">{error}</p> : null}
                  {entries ? (
                    <>
                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {WEEKDAYS.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: firstWeekday }).map((_, index) => <div key={`blank-${index}`} className="min-h-24 rounded-md bg-slate-50/60" />)}
                        {Array.from({ length: daysInMonth }).map((_, index) => {
                          const day = index + 1;
                          const key = dayKey(year, month, day);
                          const dayEntries = byDay.get(key) ?? [];
                          const promised = dayEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
                          const isToday = key === todayKey;
                          return (
                            <button
                              type="button"
                              key={key}
                              onClick={() => setSelectedDay(dayEntries.length ? key : null)}
                              className={`min-h-24 rounded-md border p-1 text-left align-top transition ${
                                dayEntries.length ? "border-blue-200 bg-blue-50/60 hover:bg-blue-100" : "border-slate-200 bg-white hover:bg-slate-50"
                              } ${isToday ? "ring-2 ring-brand-blue" : ""} ${selectedDay === key ? "ring-2 ring-brand-green" : ""}`}
                            >
                              <span className={`block text-xs font-bold ${isToday ? "text-brand-blue" : "text-slate-700"}`}>{day}</span>
                              {dayEntries.slice(0, 3).map((entry) => (
                                <span key={entry.id} className="mt-0.5 block truncate text-[10px] leading-tight text-slate-700" title={`${entry.clientName}${entry.amount ? ` - ${money(entry.amount)}` : ""}`}>
                                  {entry.clientName}
                                </span>
                              ))}
                              {dayEntries.length > 3 ? <span className="mt-0.5 block text-[10px] font-bold text-brand-blue">+{dayEntries.length - 3} more</span> : null}
                              {promised ? <span className="mt-0.5 block text-[10px] font-bold text-red-700">{money(promised)}</span> : null}
                            </button>
                          );
                        })}
                      </div>
                      {selectedDay ? (
                        <div className="mt-4 rounded-md border border-slate-200">
                          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                            {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-US", { dateStyle: "full" })} - {selectedEntries.length} entr{selectedEntries.length === 1 ? "y" : "ies"}
                          </p>
                          <table className="w-full text-left text-xs">
                            <thead className="bg-white uppercase tracking-wide text-slate-500">
                              <tr><th className="px-3 py-2">Client</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Logged</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedEntries.map((entry) => (
                                <tr key={entry.id}>
                                  <td className="px-3 py-2"><span className="block font-bold text-slate-900">{entry.clientName}</span><span className="text-slate-500">{entry.clientNumber ?? "-"}</span></td>
                                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-brand-blue">{entry.logType.replace(/_/g, " ")}</td>
                                  <td className="px-3 py-2">{entry.subject ? <span className="block font-bold">{entry.subject}</span> : null}<span className="text-slate-600">{entry.notes}</span></td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-red-700">{entry.amount ? money(entry.amount) : "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{entry.branch}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{new Date(entry.loggedAt).toLocaleDateString("en-US")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="mt-3 text-center text-xs text-slate-500">Select a highlighted day for its entries.</p>
                      )}
                    </>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
