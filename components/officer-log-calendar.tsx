"use client";

import { Banknote, CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, GripVertical, Printer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/format";
import { manilaDateKey } from "@/lib/location-loan-aging";

type ScheduleEntry = {
  id: number;
  date: string;
  originalDate: string | null;
  rescheduledAt: string | null;
  logType: string;
  subject: string | null;
  notes: string;
  amount: number | null;
  loggedAt: string;
  clientName: string;
  clientNumber: string | null;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
  address: string | null;
  branch: string;
};

// An instalment the branch expects from a client tagged to this officer. It belongs to the
// loan's own schedule rather than to anything the officer arranged, so it is never draggable.
type DueEntry = {
  id: number;
  date: string;
  amortNo: number;
  amount: number;
  // How many instalments on this loan are unsettled by the day this one falls due, counting
  // itself, and what they add up to. One month means a client who is up to date.
  monthsUnpaid: number;
  overallDue: number;
  loanNumber: string | null;
  clientName: string;
  clientNumber: string | null;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
  address: string | null;
  branch: string;
  isEmployeeLoan: boolean;
};

// Province, city/municipality and barangay read as one line wherever a row has room for it. A
// client whose loan has not been linked to a location yet still has the address the branch
// recorded, so that stands in rather than leaving the column empty.
function placeOf(row: { province: string | null; municipality: string | null; barangay: string | null; address: string | null }) {
  const parts = [row.barangay, row.municipality, row.province].filter(Boolean);
  return parts.length ? parts.join(", ") : row.address ?? "";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// An officer's month at a glance: the promise-to-pay dates they recorded on their client logs,
// and the amortization the branch expects from the clients tagged to them. Only a PTP can be
// dragged to a new day - a due belongs to the loan's own schedule.
export function OfficerLogCalendar({
  officerId,
  officerName,
  variant = "link"
}: {
  officerId: number;
  officerName: string;
  // "link" is a name you click to raise the schedule over the page it sits on. "inline" drops
  // the trigger and the overlay and puts the same calendar straight into a page, which is what
  // My Schedule is - a whole layout rather than something stacked on another one.
  variant?: "link" | "inline";
}) {
  const inline = variant === "inline";
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);
  const [dues, setDues] = useState<DueEntry[] | null>(null);
  const [duesError, setDuesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");

  async function moveEntry(entryId: number, date: string) {
    const entry = entries?.find((candidate) => candidate.id === entryId);
    if (!entry || entry.date === date || savingId !== null) return;
    // The server refuses this too; catching it here says so without a wasted round trip.
    if (date < manilaDateKey()) {
      setSaveError("A PTP date cannot be moved into the past. Choose today or a later date.");
      return;
    }
    const before = entries;
    setSaveError(null);
    setSavingId(entryId);
    setEntries((current) => current?.map((candidate) => candidate.id === entryId
      ? { ...candidate, date, originalDate: candidate.originalDate ?? candidate.date, rescheduledAt: new Date().toISOString() }
      : candidate) ?? null);
    try {
      const response = await fetch(`/api/client-logs/schedule/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Unable to reschedule the client.");
      setEntries((current) => current?.map((candidate) => candidate.id === entryId
        ? { ...candidate, date: data.date ?? date, originalDate: data.originalDate ?? null, rescheduledAt: data.rescheduledAt ?? null }
        : candidate) ?? null);
      setSelectedDay(date);
      setSelectedEntryId(null);
    } catch (requestError) {
      setEntries(before);
      setSaveError(requestError instanceof Error ? requestError.message : "Unable to reschedule the client.");
    } finally {
      setSavingId(null);
      setDraggedId(null);
      setDropDay(null);
    }
  }

  useEffect(() => {
    if (!inline && !open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/client-logs/schedule?officerId=${officerId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load the schedule.");
        setEntries(data.entries);
        // Open on the month holding the next upcoming entry, else the latest one.
        const today = manilaDateKey();
        const upcoming = data.entries.find((entry: ScheduleEntry) => entry.date >= today) ?? data.entries[data.entries.length - 1];
        if (upcoming) setCursor(new Date(`${upcoming.date}T00:00:00`));
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load the schedule.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [officerId, open, inline]);

  // Dues are fetched a month at a time: an officer can hold hundreds of clients, each with an
  // instalment every month for the life of their loan, so the whole schedule would never fit in
  // one response the way the promises to pay do.
  const visibleMonth = monthKey(cursor);
  useEffect(() => {
    if (!inline && !open) return;
    const controller = new AbortController();
    setDuesError(null);
    fetch(`/api/client-logs/schedule/dues?officerId=${officerId}&month=${visibleMonth}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load the amortization dues.");
        setDues(data.dues);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setDues([]);
        setDuesError(requestError instanceof Error ? requestError.message : "Unable to load the amortization dues.");
      });
    return () => controller.abort();
  }, [officerId, open, inline, visibleMonth]);

  useEffect(() => {
    if (inline || !open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, inline]);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of entries ?? []) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return map;
  }, [entries]);

  const duesByDay = useMemo(() => {
    const map = new Map<string, DueEntry[]>();
    for (const due of dues ?? []) {
      const list = map.get(due.date) ?? [];
      list.push(due);
      map.set(due.date, list);
    }
    return map;
  }, [dues]);

  // Everything the officer has to see this month, promises and dues together, so one address
  // can be searched for and the whole round printed or exported. Sorted by day, then by name,
  // which is the order the round is actually walked in.
  const monthRows = useMemo(() => {
    const today = manilaDateKey();
    const month = monthKey(cursor);
    const rows = [
      ...(entries ?? []).filter((entry) => entry.date.startsWith(month)).map((entry) => ({
        key: `ptp-${entry.id}`,
        date: entry.date,
        kind: entry.originalDate ? "PTP (rescheduled)" : "PTP",
        clientName: entry.clientName,
        clientNumber: entry.clientNumber,
        place: placeOf(entry),
        detail: [entry.logType.replace(/_/g, " "), entry.subject].filter(Boolean).join(" - "),
        amount: entry.amount ?? 0,
        // A promise to pay stands on its own - there is no loan behind it to be in arrears on.
        monthsUnpaid: null as number | null,
        overallDue: null as number | null,
        branch: entry.branch,
        isEmployeeLoan: false
      })),
      ...(dues ?? []).map((due) => ({
        key: `due-${due.id}`,
        date: due.date,
        kind: due.date < today ? "Overdue" : "Due",
        clientName: due.clientName,
        clientNumber: due.clientNumber,
        place: placeOf(due),
        detail: [due.loanNumber ? `Loan ${due.loanNumber}` : null, `Instalment no. ${due.amortNo}`].filter(Boolean).join(" - "),
        amount: due.amount,
        monthsUnpaid: due.monthsUnpaid as number | null,
        overallDue: due.overallDue as number | null,
        branch: due.branch,
        isEmployeeLoan: due.isEmployeeLoan
      }))
    ];
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
    // Every word has to appear somewhere on the row, so "buenavista rizal" narrows rather than
    // widens - the same way the client log search behaves.
    const terms = placeQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((row) => {
      const text = [row.place, row.clientName, row.clientNumber, row.branch, row.kind, row.detail].join(" ").toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [entries, dues, cursor, placeQuery]);

  // Promised and due are different kinds of money and adding them together would mean nothing,
  // so the list reports each on its own.
  const listPromised = monthRows.filter((row) => row.kind.startsWith("PTP")).reduce((sum, row) => sum + row.amount, 0);
  const listDue = monthRows.filter((row) => !row.kind.startsWith("PTP")).reduce((sum, row) => sum + row.amount, 0);

  function excel() {
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["No.", "Date", "Kind", "Client", "Client No.", "Barangay / Municipality / Province", "Detail", "Amount", "Months unpaid", "Total due", "Branch", "Employee loan"];
    const csv = [header, ...monthRows.map((row, index) => [
      index + 1, row.date, row.kind, row.clientName, row.clientNumber, row.place, row.detail, row.amount,
      row.monthsUnpaid ?? "", row.overallDue ?? "", row.branch, row.isEmployeeLoan ? "Yes" : ""
    ])].map((row) => row.map(cell).join(",")).join("\r\n");
    // The BOM is what makes Excel read the peso sign and the accented place names correctly.
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `schedule-${officerName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${monthKey(cursor)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  const showing = inline || open;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthEntries = (entries ?? []).filter((entry) => entry.date.startsWith(monthKey(cursor)));
  const monthPromised = monthEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const todayKey = manilaDateKey();
  const monthDue = (dues ?? []).reduce((sum, due) => sum + due.amount, 0);
  // Every due here is unpaid by definition - the endpoint returns nothing settled - so one
  // dated before today is simply one the client has already missed.
  const monthOverdue = (dues ?? []).filter((due) => due.date < todayKey).length;
  const selectedEntries = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const selectedDues = selectedDay ? duesByDay.get(selectedDay) ?? [] : [];

  const panel = (
              <section
                {...(inline ? {} : { role: "dialog", "aria-modal": true, "aria-label": `Schedule for ${officerName}` })}
                className={inline
                  ? "panel flex w-full flex-col overflow-hidden text-left"
                  : "flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Promise to Pay / Amortization Due</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">{officerName}</h3>
                    <p className="text-xs text-slate-500">Promises to pay recorded on their client logs, and the amortization falling due for the clients tagged to them.</p>
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
                    {inline ? null : (
                      <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900" onClick={() => setOpen(false)} aria-label="Close">
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </header>
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-600">
                  {entries
                    ? `${monthEntries.length.toLocaleString("en-US")} promise${monthEntries.length === 1 ? "" : "s"} to pay this month | ${money(monthPromised)} promised | ${entries.length.toLocaleString("en-US")} in total`
                    : "Loading..."}
                  {dues ? ` • ${dues.length.toLocaleString("en-US")} amortization due${dues.length === 1 ? "" : "s"}${monthOverdue ? ` (${monthOverdue.toLocaleString("en-US")} overdue)` : ""} | ${money(monthDue)} due` : null}
                  {/* Two kinds of day sit on this calendar and they behave differently, so the
                      legend names both and says which one can be moved. */}
                  {entries ? <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-medium">
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border-l-4 border-blue-500 bg-white" />PTP - original</span>
                    <span className="inline-flex items-center gap-1 text-amber-800"><i className="h-2.5 w-2.5 rounded-sm border-l-4 border-amber-500 bg-amber-100" />PTP - rescheduled</span>
                    <span className="inline-flex items-center gap-1 text-violet-900"><i className="h-2.5 w-2.5 rounded-sm border-l-4 border-violet-500 bg-violet-100" />Amortization due</span>
                    <span className="inline-flex items-center gap-1 text-rose-900"><i className="h-2.5 w-2.5 rounded-sm border-l-4 border-rose-600 bg-rose-200" />Amortization overdue</span>
                    <span className="inline-flex items-center gap-1 text-emerald-900"><i className="h-2.5 w-2.5 rounded-sm border-l-4 border-emerald-600 bg-emerald-100" />Employee loan</span>
                    <span className="text-slate-500">Drag a PTP, or select it then click a new date. An amortization due is the branch's own schedule and does not move.</span>
                  </span> : null}
                  {duesError ? <span className="ml-2 font-semibold text-red-700">{duesError}</span> : null}
                </div>
                <div className="overflow-auto p-4">
                  {loading && !entries ? <p className="px-5 py-12 text-center font-semibold text-slate-500">Loading schedule...</p> : null}
                  {error ? <p className="px-5 py-12 text-center font-semibold text-red-700">{error}</p> : null}
                  {saveError ? <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{saveError}</p> : null}
                  {selectedEntryId ? <div className="mb-3 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"><span><b>{entries?.find((entry) => entry.id === selectedEntryId)?.clientName}</b> selected. Click the destination date.</span><button type="button" className="font-bold text-brand-blue hover:underline" onClick={() => setSelectedEntryId(null)}>Cancel selection</button></div> : null}
                  {entries ? (
                    <>
                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {WEEKDAYS.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: firstWeekday }).map((_, index) => <div key={`blank-${index}`} className="min-h-14 rounded-md bg-slate-50/60 sm:min-h-24" />)}
                        {Array.from({ length: daysInMonth }).map((_, index) => {
                          const day = index + 1;
                          const key = dayKey(year, month, day);
                          const dayEntries = byDay.get(key) ?? [];
                          const dayDues = duesByDay.get(key) ?? [];
                          const dayCount = dayEntries.length + dayDues.length;
                          const promised = dayEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
                          const dueTotal = dayDues.reduce((sum, due) => sum + due.amount, 0);
                          const dueOverdue = Boolean(dayDues.length) && key < todayKey;
                          const isToday = key === todayKey;
                          return (
                            <div
                              key={key}
                              onClick={() => selectedEntryId ? void moveEntry(selectedEntryId, key) : setSelectedDay(dayCount ? key : null)}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectedEntryId ? void moveEntry(selectedEntryId, key) : setSelectedDay(dayCount ? key : null); } }}
                              onDragOver={(event) => { if (key < todayKey) return; event.preventDefault(); setDropDay(key); }}
                              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropDay(null); }}
                              onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData("text/plain") || draggedId); if (id) void moveEntry(id, key); }}
                              role="button"
                              tabIndex={0}
                              className={`min-h-14 rounded-md border p-1 text-left align-top transition sm:min-h-24 ${
                                dayEntries.length ? "border-blue-200 bg-blue-50/60 hover:bg-blue-100" : dueOverdue ? "border-rose-300 bg-rose-50/70 hover:bg-rose-100" : dayDues.length ? "border-violet-200 bg-violet-50/60 hover:bg-violet-100" : "border-slate-200 bg-white hover:bg-slate-50"
                              } ${isToday ? "ring-2 ring-brand-blue" : ""} ${selectedDay === key ? "ring-2 ring-brand-green" : ""} ${dropDay === key ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400" : ""}`}
                            >
                              <span className={`block text-xs font-bold ${isToday ? "text-brand-blue" : "text-slate-700"}`}>{day}</span>
                              {dayCount ? (
                                <span className={`mt-0.5 flex items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold leading-none text-white sm:hidden ${dayEntries.length ? "bg-brand-blue" : dueOverdue ? "bg-rose-600" : "bg-violet-600"}`}>
                                  {dayCount}
                                </span>
                              ) : null}
                              <span className="hidden sm:contents">
                              {dayEntries.slice(0, 3).map((entry) => (
                                <span
                                  key={entry.id}
                                  draggable={savingId === null}
                                  onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(entry.id)); setDraggedId(entry.id); }}
                                  onDragEnd={() => { setDraggedId(null); setDropDay(null); }}
                                  onClick={(event) => { event.stopPropagation(); setSelectedEntryId((current) => current === entry.id ? null : entry.id); }}
                                  className={`mt-0.5 flex cursor-grab items-center gap-0.5 truncate rounded px-0.5 text-[10px] leading-tight active:cursor-grabbing ${entry.originalDate ? "border-l-2 border-amber-500 bg-amber-100 font-semibold text-amber-950" : "border-l-2 border-blue-500 bg-white/70 text-slate-700"} ${savingId === entry.id ? "animate-pulse opacity-60" : ""} ${selectedEntryId === entry.id ? "ring-2 ring-brand-green" : ""}`}
                                  title={`${entry.clientName}${entry.amount ? ` - ${money(entry.amount)}` : ""}${entry.originalDate ? ` (moved from ${entry.originalDate})` : ""}`}
                                >
                                  <GripVertical className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />{entry.clientName}
                                </span>
                              ))}
                              {dayEntries.length > 3 ? <span className="mt-0.5 block text-[10px] font-bold text-brand-blue">+{dayEntries.length - 3} more</span> : null}
                              {dayDues.slice(0, 2).map((due) => (
                                <span
                                  key={`due-${due.id}`}
                                  className={`mt-0.5 flex items-center gap-0.5 truncate rounded border-l-2 px-0.5 text-[10px] leading-tight ${due.isEmployeeLoan ? "border-emerald-600 bg-emerald-100 font-semibold text-emerald-950" : dueOverdue ? "border-rose-600 bg-rose-200 font-semibold text-rose-950" : "border-violet-500 bg-violet-100 text-violet-950"}`}
                                  title={`${due.isEmployeeLoan ? "Employee loan - " : ""}${dueOverdue ? "Amortization overdue" : "Amortization due"} - ${due.clientName}${due.amount ? ` - ${money(due.amount)}` : ""}${due.loanNumber ? ` (loan ${due.loanNumber})` : ""} - ${placeOf(due) || "no address"}`}
                                >
                                  <Banknote className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />{due.clientName}
                                </span>
                              ))}
                              {dayDues.length > 2 ? <span className={`mt-0.5 block text-[10px] font-bold ${dueOverdue ? "text-rose-700" : "text-violet-700"}`}>+{dayDues.length - 2} more due</span> : null}
                              </span>
                              {promised ? <span className="mt-0.5 hidden text-[10px] font-bold text-red-700 sm:block">{money(promised)}</span> : null}
                              {dueTotal ? <span className={`mt-0.5 hidden text-[10px] font-bold sm:block ${dueOverdue ? "text-rose-700" : "text-violet-700"}`}>{money(dueTotal)} {dueOverdue ? "overdue" : "due"}</span> : null}
                            </div>
                          );
                        })}
                      </div>
                      {selectedDay ? (
                        <div className="mt-4 space-y-4">
                        {selectedEntries.length ? <div className="rounded-md border border-slate-200">
                          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                            <span className="mr-2 inline-block h-2 w-2 rounded-sm bg-blue-500 align-middle" aria-hidden="true" />
                            {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-US", { dateStyle: "full" })} - {selectedEntries.length} promise{selectedEntries.length === 1 ? "" : "s"} to pay
                          </p>
                          <table className="w-full text-left text-xs">
                            <thead className="bg-white uppercase tracking-wide text-slate-500">
                              <tr><th className="px-3 py-2">Client</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">Schedule</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Logged</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedEntries.map((entry) => (
                                <tr
                                  key={entry.id}
                                  draggable={savingId === null}
                                  onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(entry.id)); setDraggedId(entry.id); setSelectedEntryId(entry.id); }}
                                  onDragEnd={() => { setDraggedId(null); setDropDay(null); }}
                                  onClick={() => setSelectedEntryId((current) => current === entry.id ? null : entry.id)}
                                  className={`cursor-grab transition hover:bg-blue-50 active:cursor-grabbing ${selectedEntryId === entry.id ? "bg-blue-100 ring-1 ring-inset ring-brand-green" : ""} ${savingId === entry.id ? "animate-pulse opacity-60" : ""}`}
                                >
                                  <td className="px-3 py-2"><span className="flex items-center gap-1 font-bold text-slate-900"><GripVertical className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{entry.clientName}</span><span className="pl-5 text-slate-500">{entry.clientNumber ?? "-"}</span></td>
                                  <td className="px-3 py-2 text-slate-600">{placeOf(entry) || "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{entry.originalDate ? <span className="rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-800">Moved from {new Date(`${entry.originalDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">Original</span>}</td>
                                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-brand-blue">{entry.logType.replace(/_/g, " ")}</td>
                                  <td className="px-3 py-2">{entry.subject ? <span className="block font-bold">{entry.subject}</span> : null}<span className="text-slate-600">{entry.notes}</span></td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-red-700">{entry.amount ? money(entry.amount) : "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{entry.branch}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{new Date(entry.loggedAt).toLocaleDateString("en-US")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div> : null}
                        {/* A separate table, because these are the branch's own instalments: no
                            drag handle, no reschedule, nothing on them to move. */}
                        {selectedDues.length ? <div className={`rounded-md border ${selectedDay < todayKey ? "border-rose-300" : "border-violet-200"}`}>
                          <p className={`border-b px-3 py-2 text-xs font-bold ${selectedDay < todayKey ? "border-rose-300 bg-rose-50 text-rose-900" : "border-violet-200 bg-violet-50 text-violet-900"}`}>
                            <span className={`mr-2 inline-block h-2 w-2 rounded-sm align-middle ${selectedDay < todayKey ? "bg-rose-600" : "bg-violet-500"}`} aria-hidden="true" />
                            {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-US", { dateStyle: "full" })} - {selectedDues.length} amortization {selectedDay < todayKey ? "overdue" : `due${selectedDues.length === 1 ? "" : "s"}`}
                          </p>
                          <table className="w-full text-left text-xs">
                            <thead className="bg-white uppercase tracking-wide text-slate-500">
                              <tr><th className="px-3 py-2">Client</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">Loan</th><th className="px-3 py-2">Instalment</th><th className="px-3 py-2 text-right">Amount due</th><th className="px-3 py-2 text-center">Months unpaid</th><th className="px-3 py-2 text-right">Total due</th><th className="px-3 py-2">Branch</th></tr>
                            </thead>
                            <tbody className={`divide-y ${selectedDay < todayKey ? "divide-rose-100" : "divide-violet-100"}`}>
                              {selectedDues.map((due) => (
                                <tr key={due.id} className={`transition ${selectedDay < todayKey ? "hover:bg-rose-50" : "hover:bg-violet-50"}`}>
                                  <td className="px-3 py-2"><span className="block font-bold text-slate-900">{due.clientName}{due.isEmployeeLoan ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">Employee</span> : null}</span><span className="text-slate-500">{due.clientNumber ?? "-"}</span></td>
                                  <td className="px-3 py-2 text-slate-600">{placeOf(due) || "-"}</td>
                                  <td className={`whitespace-nowrap px-3 py-2 font-semibold ${selectedDay < todayKey ? "text-rose-800" : "text-violet-800"}`}>{due.loanNumber ?? "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2">No. {due.amortNo}{selectedDay < todayKey ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800">Overdue</span> : null}</td>
                                  <td className={`whitespace-nowrap px-3 py-2 text-right font-bold ${selectedDay < todayKey ? "text-rose-800" : "text-violet-800"}`}>{due.amount ? money(due.amount) : "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-center">
                                    <span className={`rounded-full px-2 py-0.5 font-bold ${due.monthsUnpaid > 1 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{due.monthsUnpaid}</span>
                                  </td>
                                  <td className={`whitespace-nowrap px-3 py-2 text-right font-bold ${due.monthsUnpaid > 1 ? "text-rose-800" : "text-slate-700"}`}>{due.overallDue ? money(due.overallDue) : "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{due.branch}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div> : null}
                        </div>
                      ) : (
                        <p className="mt-3 text-center text-xs text-slate-500">Select a highlighted day for its promises to pay and amortization dues.</p>
                      )}

                      {/* The whole month as one list, so a round can be searched by address and
                          taken out of the building on paper or in a spreadsheet. */}
                      <section className="print-area mt-6">
                        <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-700">Search address or client</span>
                            <input
                              className="field h-9 w-72"
                              value={placeQuery}
                              onChange={(event) => setPlaceQuery(event.target.value)}
                              placeholder="Barangay, municipality or province"
                            />
                          </label>
                          <div className="flex gap-2">
                            <button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={() => window.print()}>
                              <Printer className="h-4 w-4" />Print
                            </button>
                            <button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={excel}>
                              <FileSpreadsheet className="h-4 w-4" />Excel
                            </button>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-slate-950">{officerName} - {monthLabel}</p>
                        <p className="mb-2 text-xs font-semibold text-slate-600">
                          {monthRows.length.toLocaleString("en-US")} client visit{monthRows.length === 1 ? "" : "s"} this month
                          {listPromised ? ` | ${money(listPromised)} promised` : ""}
                          {listDue ? ` | ${money(listDue)} due` : ""}
                          {placeQuery.trim() ? ` | filtered by "${placeQuery.trim()}"` : ""}
                        </p>
                        <div className="overflow-x-auto rounded-md border border-slate-200">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">#</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Kind</th>
                                <th className="px-3 py-2">Client</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">Detail</th>
                                <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-center">Months unpaid</th>
                                <th className="px-3 py-2 text-right">Total due</th><th className="px-3 py-2">Branch</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {monthRows.map((row, index) => (
                                <tr key={row.key} className={row.isEmployeeLoan ? "bg-emerald-50/60" : row.kind === "Overdue" ? "bg-rose-50/50" : ""}>
                                  <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{new Date(`${row.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                                  <td className="whitespace-nowrap px-3 py-2">
                                    <span className={`rounded-full px-2 py-0.5 font-bold ${
                                      row.isEmployeeLoan ? "bg-emerald-100 text-emerald-800"
                                        : row.kind === "Overdue" ? "bg-rose-100 text-rose-800"
                                        : row.kind === "Due" ? "bg-violet-100 text-violet-800"
                                        : row.kind === "PTP (rescheduled)" ? "bg-amber-100 text-amber-800"
                                        : "bg-blue-100 text-blue-800"
                                    }`}>{row.kind}</span>
                                  </td>
                                  <td className="px-3 py-2"><span className="block font-bold text-slate-900">{row.clientName}</span><span className="text-slate-500">{row.clientNumber ?? "-"}</span></td>
                                  <td className="px-3 py-2 text-slate-600">{row.place || "-"}</td>
                                  <td className="px-3 py-2 text-slate-600">{row.detail || "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-slate-900">{row.amount ? money(row.amount) : "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-center">
                                    {row.monthsUnpaid === null ? "-" : <span className={`rounded-full px-2 py-0.5 font-bold ${row.monthsUnpaid > 1 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{row.monthsUnpaid}</span>}
                                  </td>
                                  <td className={`whitespace-nowrap px-3 py-2 text-right font-bold ${(row.monthsUnpaid ?? 0) > 1 ? "text-rose-800" : "text-slate-700"}`}>{row.overallDue ? money(row.overallDue) : "-"}</td>
                                  <td className="whitespace-nowrap px-3 py-2">{row.branch}</td>
                                </tr>
                              ))}
                              {!monthRows.length ? <tr><td colSpan={10} className="p-8 text-center font-semibold text-slate-500">
                                {placeQuery.trim() ? "No client this month matches that address." : "Nothing scheduled or falling due this month."}
                              </td></tr> : null}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </>
                  ) : null}
                </div>
              </section>
  );

  if (inline) return panel;

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
        title={`Promise-to-pay and amortization-due schedule for ${officerName}`}
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
              {panel}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
