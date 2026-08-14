"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileClock, Save, Search, X } from "lucide-react";
import { dateOnly, dateTime, money } from "@/lib/format";

type ClientOption = {
  id: number;
  fullName: string;
  clientId: string | null;
  contactNumber: string | null;
  address: string | null;
  branch: { branchName: string; branchCode: string };
};

type ClientLogRow = {
  id: number;
  logType: string;
  subject: string | null;
  notes: string;
  newDate: string | null;
  newAmount: string | null;
  visitAt: string;
  createdAt: string;
  client: ClientOption;
  encodedBy: { name: string; email: string };
};

type Filters = { branchId: string; product: string; status: string; addressArea: string; addressDetail: string };

export function ClientLogsWorkspace({
  clients,
  logs,
  searchText,
  filters,
  branches,
  products,
  statuses,
  selectedClientId,
  currentUserName
}: {
  clients: ClientOption[];
  logs: ClientLogRow[];
  searchText: string;
  filters: Filters;
  branches: { id: number; branchName: string; branchCode: string }[];
  products: string[];
  statuses: { code: number; name: string | null }[];
  selectedClientId: number | null;
  currentUserName: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(selectedClientId ? String(selectedClientId) : "");
  const [entryOpen, setEntryOpen] = useState(false);
  const [logType, setLogType] = useState("INQUIRY");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedClient = useMemo(() => clients.find((client) => String(client.id) === clientId), [clientId, clients]);

  function openEntry(client: ClientOption) {
    setClientId(String(client.id));
    setError(null);
    setEntryOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const response = await fetch("/api/client-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: Number(clientId), logType, subject, notes, newDate, newAmount })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Unable to save client log.");
      return;
    }
    setSubject("");
    setNotes("");
    setNewDate("");
    setNewAmount("");
    setEntryOpen(false);
    setMessage("Client log saved.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <form className="panel p-4" action="/client-logs">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Client</span>
            <input className="field" name="customer" defaultValue={searchText} placeholder="Client name or number" />
          </label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Branch</span>
            <select className="field" name="branchId" defaultValue={filters.branchId}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branchName}</option>)}</select>
          </label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Loan product</span>
            <select className="field" name="product" defaultValue={filters.product}><option value="">All products</option>{products.map((product) => <option key={product} value={product}>{product}</option>)}</select>
          </label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Loan status</span>
            <select className="field" name="status" defaultValue={filters.status}><option value="">All statuses</option>{statuses.map((status) => <option key={`${status.code}-${status.name}`} value={status.code}>{status.name || status.code}</option>)}</select>
          </label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Address area</span>
            <input className="field" name="addressArea" defaultValue={filters.addressArea} placeholder="Example: San Francisco" />
          </label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Address detail</span>
            <input className="field" name="addressDetail" defaultValue={filters.addressDetail} placeholder="Example: Brgy 1" />
          </label>
        </div>
        <div className="mt-3 flex gap-3">
          <button className="btn-primary" type="submit"><Search className="h-4 w-4" />Search</button>
          <Link className="btn-secondary" href="/client-logs">Clear</Link>
        </div>
      </form>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green">{message}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3"><p className="text-sm font-bold text-slate-950">Matching customers</p><p className="text-xs text-slate-500">{clients.length.toLocaleString("en-US")} result(s)</p></div>
          <div className="max-h-[620px] overflow-auto">
            {clients.map((client, index) => <button key={client.id} type="button" onClick={() => openEntry(client)} className="block w-full border-b border-slate-100 bg-white px-4 py-3 text-left transition hover:bg-blue-50">
              <div className="flex gap-3"><span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-brand-blue">{index + 1}</span><div><p className="font-bold text-slate-950">{client.fullName}</p><p className="text-xs font-semibold text-slate-500">{client.branch.branchName} - {client.clientId ?? "No client no."}</p><p className="mt-1 text-xs text-slate-500">{client.contactNumber ?? "No contact"} | {client.address ?? "No address"}</p></div></div>
            </button>)}
            {!clients.length ? <div className="px-4 py-6 text-sm text-slate-500">Use one or more filters to find a customer and create a log entry.</div> : null}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3"><p className="text-sm font-bold text-slate-950">Historical logs</p><p className="text-xs text-slate-500">Latest entries for the matching customer set</p></div>
          <div className="max-h-[620px] divide-y divide-slate-100 overflow-auto">
            {logs.map((log) => <article key={log.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{log.client.fullName}</p><p className="text-xs font-semibold text-slate-500">{log.client.branch.branchName} - {log.client.clientId ?? "No client no."}</p></div><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{log.logType.replace(/_/g, " ")}</span></div>
              {log.subject ? <h4 className="mt-3 font-bold text-slate-900">{log.subject}</h4> : null}<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{log.notes}</p>
              {log.newDate || log.newAmount ? <div className="mt-3 flex flex-wrap gap-4 rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-slate-700">{log.newDate ? <span>New date: {dateOnly(log.newDate)}</span> : null}{log.newAmount ? <span>New amount: {money(log.newAmount)}</span> : null}</div> : null}
              <p className="mt-3 text-xs font-semibold text-slate-500">{dateTime(log.visitAt)} | Encoded by {log.encodedBy.name}</p>
            </article>)}
            {!logs.length ? <div className="px-4 py-6 text-sm text-slate-500">No historical logs found for the current search.</div> : null}
          </div>
        </div>
      </section>

      {entryOpen && selectedClient ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="New client log entry" onMouseDown={(event) => { if (event.target === event.currentTarget) setEntryOpen(false); }}>
        <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-brand-green">New client log</p><h3 className="mt-1 text-xl font-bold text-slate-950">{selectedClient.fullName}</h3><p className="text-sm text-slate-500">Encoded by {currentUserName}. Entry time is recorded automatically.</p></div><button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEntryOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
          {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Type</span><select className="field" value={logType} onChange={(event) => setLogType(event.target.value)}><option value="INQUIRY">Inquiry</option><option value="REQUEST">Request</option><option value="VISIT">Branch Visit</option><option value="COMPLAINT">Complaint</option><option value="FOLLOW_UP">Follow-up</option><option value="OTHER">Other</option></select></label>
          <label className="mt-3 block"><span className="mb-2 block text-sm font-semibold text-slate-700">Subject</span><input className="field" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Short title or purpose" /></label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">New date <span className="font-normal text-slate-400">(optional)</span></span><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="date" className="field pl-10" value={newDate} onChange={(event) => setNewDate(event.target.value)} /></div></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">New amount <span className="font-normal text-slate-400">(optional)</span></span><input type="number" min="0" step="0.01" className="field" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} placeholder="0.00" /></label>
          </div>
          <label className="mt-3 block"><span className="mb-2 block text-sm font-semibold text-slate-700">Customer inquiry / request / notes</span><textarea className="min-h-36 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-blue-100" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Type what the customer asked, requested, or discussed during the visit." required /></label>
          <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setEntryOpen(false)}>Cancel</button><button className="btn-primary" disabled={isPending || !notes.trim()}><Save className="h-4 w-4" />Save Client Log</button></div>
        </form>
      </div> : null}
    </div>
  );
}
