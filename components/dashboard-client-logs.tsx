"use client";

import { BarChart3, CalendarDays, FileSpreadsheet, Pencil, Printer, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClientLogHistory } from "@/components/client-log-history";
import { OfficerLogCalendar } from "@/components/officer-log-calendar";

type Row = { id: number; clientId: number; accountOfficerId: number; client: string; clientNumber: string | null; branch: string; accountOfficer: string; type: string; subject: string | null; notes: string; newDate: string | null; newAmount: string | null; visitAt: string };

// Mirrors the New Client Log entry form so editing and encoding look the same.
const LOG_TYPES = [
  { value: "INQUIRY", label: "Inquiry" },
  { value: "REQUEST", label: "Request" },
  { value: "VISIT", label: "Branch Visit" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "OTHER", label: "Other" }
];

export function DashboardClientLogs({ rows, canDelete = false, initialSearch = "", periodLabel }: { rows: Row[]; canDelete?: boolean; initialSearch?: string; periodLabel?: string }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ type: "", subject: "", notes: "", newDate: "", newAmount: "" });
  const [query, setQuery] = useState(initialSearch);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const listener = (event: Event) => setQuery(String((event as CustomEvent).detail ?? "")); window.addEventListener("client-log-live-filter", listener); return () => window.removeEventListener("client-log-live-filter", listener); }, []);
  useEffect(() => { if (!editingRow) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setEditingRow(null); setError(null); } }; document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown); }, [editingRow]);
  const visibleRows = useMemo(() => { const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean); if (!terms.length) return rows; return rows.filter((row) => { const text = [row.client, row.clientNumber, row.branch, row.accountOfficer, row.type, row.subject, row.notes].join(" ").toLowerCase(); return terms.every((term) => text.includes(term)); }); }, [query, rows]);
  // "Promise to pay" is the optional amount captured on the log, so the totals follow whatever
  // period and filters are in effect rather than a separate query.
  const summary = useMemo(() => {
    const byOfficer = new Map<string, { logs: number; ptp: number }>();
    const byBranch = new Map<string, { logs: number; ptp: number }>();
    let ptpTotal = 0;
    let ptpCount = 0;
    for (const row of visibleRows) {
      const amount = Number(row.newAmount ?? 0);
      const ptp = Number.isFinite(amount) ? amount : 0;
      if (ptp > 0) ptpCount += 1;
      ptpTotal += ptp;
      const officer = byOfficer.get(row.accountOfficer) ?? { logs: 0, ptp: 0 };
      officer.logs += 1;
      officer.ptp += ptp;
      byOfficer.set(row.accountOfficer, officer);
      const branch = byBranch.get(row.branch) ?? { logs: 0, ptp: 0 };
      branch.logs += 1;
      branch.ptp += ptp;
      byBranch.set(row.branch, branch);
    }
    const rank = (entries: Map<string, { logs: number; ptp: number }>) =>
      Array.from(entries.entries()).map(([name, value]) => ({ name, ...value })).sort((a, b) => b.logs - a.logs || a.name.localeCompare(b.name));
    return {
      officers: rank(byOfficer),
      branches: rank(byBranch),
      ptpTotal,
      ptpCount,
      clients: new Set(visibleRows.map((row) => `${row.client}|${row.clientNumber ?? ""}`)).size
    };
  }, [visibleRows]);
  const peso = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  function excel() { const csv = [["No.", "Date", "Client", "Client No.", "Branch", "Account Officer", "Type", "Subject", "Notes", "Promised Date", "Promised Amount"], ...visibleRows.map((r, index) => [index + 1, r.visitAt, r.client, r.clientNumber, r.branch, r.accountOfficer, r.type, r.subject, r.notes, r.newDate, r.newAmount])].map((r) => r.map(cell).join(",")).join("\r\n"); const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "client-logs.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }
  async function remove(row: Row) { const confirmation = window.prompt(`Deleting the client log for ${row.client} cannot be undone.\n\nType DELETE to proceed.`); if (confirmation === null) return; if (confirmation !== "DELETE") { setError("Delete cancelled. Type DELETE exactly to confirm deletion."); return; } setDeletingId(row.id); setError(null); try { const response = await fetch(`/api/client-logs/${row.id}`, { method: "DELETE" }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.error ?? "Unable to delete client log."); router.refresh(); } catch (error) { setError(error instanceof Error ? error.message : "Unable to delete client log."); } finally { setDeletingId(null); } }
  function beginEdit(row: Row) { setEditingRow(row); setDraft({ type: row.type, subject: row.subject ?? "", notes: row.notes, newDate: row.newDate ?? "", newAmount: row.newAmount ?? "" }); setError(null); }
  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRow) return;
    if (!draft.notes.trim()) { setError("Activity notes are required."); return; }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/client-logs/${editingRow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to update client log.");
      setEditingRow(null);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update client log.");
    } finally {
      setSaving(false);
    }
  }
  return <div className="space-y-3">{error && !editingRow ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}<div className="flex items-center justify-between gap-2 print:hidden"><span className="text-xs font-semibold text-slate-500">Showing {visibleRows.length} of {rows.length} log(s){periodLabel ? ` | ${periodLabel}` : ""}</span><div className="flex gap-2"><button className={`px-3 py-1.5 text-xs ${summaryOpen ? "btn-primary" : "btn-secondary"}`} onClick={() => setSummaryOpen((open) => !open)}><BarChart3 className="h-4 w-4" />{summaryOpen ? "Hide Summary" : "Report Summary"}</button><button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</button><button className="btn-secondary px-3 py-1.5 text-xs" onClick={excel}><FileSpreadsheet className="h-4 w-4" />Excel</button></div></div>{summaryOpen ? <div className="panel px-3 py-2 text-xs"><p className="font-bold text-slate-900">Report summary<span className="ml-2 font-semibold text-slate-500">{summary.clients.toLocaleString("en-US")} client(s), {visibleRows.length.toLocaleString("en-US")} log(s), {peso(summary.ptpTotal)} promised{periodLabel ? ` | ${periodLabel}` : ""}</span></p>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-slate-200">
          <p className="border-b border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-700">Logs by Account Officer</p>
          <table className="w-full"><tbody>{summary.officers.map((officer) => <tr key={officer.name} className="border-b border-slate-100 last:border-b-0"><td className="px-2 py-1">{officer.name}</td><td className="px-2 py-1 text-right font-bold text-brand-blue">{officer.logs.toLocaleString("en-US")}</td><td className="whitespace-nowrap px-2 py-1 text-right font-bold text-red-700">{peso(officer.ptp)}</td></tr>)}{!summary.officers.length ? <tr><td className="px-2 py-2 text-slate-500">No logs in this period.</td></tr> : null}</tbody></table>
        </div>
        <div className="rounded-md border border-slate-200">
          <p className="border-b border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-700">Logs by Branch</p>
          <table className="w-full"><tbody>{summary.branches.map((branch) => <tr key={branch.name} className="border-b border-slate-100 last:border-b-0"><td className="px-2 py-1">{branch.name}</td><td className="px-2 py-1 text-right font-bold text-brand-blue">{branch.logs.toLocaleString("en-US")}</td><td className="whitespace-nowrap px-2 py-1 text-right font-bold text-red-700">{peso(branch.ptp)}</td></tr>)}{!summary.branches.length ? <tr><td className="px-2 py-2 text-slate-500">No logs in this period.</td></tr> : null}</tbody></table>
        </div>
      </div>
      <p className="mt-2 rounded-md bg-slate-50 px-2 py-1 font-semibold text-slate-700">Promise to pay: <span className="font-bold text-red-700">{peso(summary.ptpTotal)}</span> across {summary.ptpCount.toLocaleString("en-US")} log(s) with an amount.</p>
    </div> : null}<div className="panel max-h-[calc(100vh-24rem)] min-h-[360px] overflow-auto"><table className="w-full min-w-[1000px] text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Client</th><th className="px-3 py-2 text-left">Branch</th><th className="px-3 py-2 text-left">Account Officer</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Activity</th>{canDelete ? <th className="px-3 py-2 text-right print:hidden">Action</th> : null}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id} className="border-t border-slate-100"><td className="px-3 py-2 text-slate-400">{index + 1}</td><td className="whitespace-nowrap px-3 py-2">{new Date(row.visitAt).toLocaleString("en-US")}</td><td className="px-3 py-2"><ClientLogHistory clientId={row.clientId} clientName={row.client} variant="inline" /><br /><span className="text-slate-500">{row.clientNumber ?? "-"}</span></td><td className="px-3 py-2">{row.branch}</td><td className="px-3 py-2"><OfficerLogCalendar officerId={row.accountOfficerId} officerName={row.accountOfficer} /></td><td className="px-3 py-2">{row.type.replace(/_/g, " ")}</td><td className="px-3 py-2"><b>{row.subject}</b>{row.subject ? <br /> : null}{row.notes}</td>{canDelete ? <td className="px-3 py-2 text-right print:hidden"><div className="flex justify-end gap-1"><button type="button" className="btn-secondary h-8 px-2 text-xs" onClick={() => beginEdit(row)}><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50" onClick={() => remove(row)} disabled={deletingId === row.id}><Trash2 className="h-3.5 w-3.5" />{deletingId === row.id ? "Deleting..." : "Delete"}</button></div></td> : null}</tr>)}{!visibleRows.length ? <tr><td colSpan={canDelete ? 8 : 7} className="p-8 text-center text-slate-500">No client logs match the filters.</td></tr> : null}</tbody></table></div>

    {editingRow ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 print:hidden" role="dialog" aria-modal="true" aria-label="Edit client log entry" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRow(null); }}>
      <form onSubmit={saveEdit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Edit client log</p><h3 className="mt-1 text-xl font-bold text-slate-950">{editingRow.client}</h3><p className="text-sm text-slate-500">Encoded by {editingRow.accountOfficer} on {new Date(editingRow.visitAt).toLocaleString("en-US")}.</p></div><button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEditingRow(null)} aria-label="Close"><X className="h-5 w-5" /></button></div>
        {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
        <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Type</span><select className="field" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{LOG_TYPES.some((option) => option.value === draft.type) ? null : <option value={draft.type}>{draft.type.replace(/_/g, " ")}</option>}{LOG_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="mt-3 block"><span className="mb-2 block text-sm font-semibold text-slate-700">Subject</span><input className="field" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} placeholder="Short title or purpose" /></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">New date <span className="font-normal text-slate-400">(optional)</span></span><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="date" className="field pl-10" value={draft.newDate} onChange={(event) => setDraft({ ...draft, newDate: event.target.value })} /></div></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">New amount <span className="font-normal text-slate-400">(optional)</span></span><input type="number" min="0" step="0.01" className="field" value={draft.newAmount} onChange={(event) => setDraft({ ...draft, newAmount: event.target.value })} placeholder="0.00" /></label>
        </div>
        <label className="mt-3 block"><span className="mb-2 block text-sm font-semibold text-slate-700">Customer inquiry / request / notes</span><textarea className="min-h-36 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-blue-100" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Type what the customer asked, requested, or discussed during the visit." required /></label>
        <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setEditingRow(null)} disabled={saving}>Cancel</button><button className="btn-primary" disabled={saving || !draft.notes.trim()}><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Client Log"}</button></div>
      </form>
    </div> : null}
  </div>;
}
