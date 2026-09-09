"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Save, Search, X } from "lucide-react";
import { type ClientLogTypeOption, normalizeClientLogType } from "@/lib/client-log-types";

type ClientOption = {
  id: number;
  fullName: string;
  clientId: string | null;
  contactNumber: string | null;
  address: string | null;
  branch: { branchName: string; branchCode: string };
};

type Filters = { branchId: string; addressArea: string; addressDetail: string };

// Sentinel for the "add a type of your own" row in the Type dropdown. Not a storable value.
const ADD_TYPE = "__ADD_TYPE__";

export function ClientLogsWorkspace({
  clients,
  searchText,
  filters,
  branches,
  selectedClientId,
  currentUserName,
  logTypes
}: {
  clients: ClientOption[];
  searchText: string;
  filters: Filters;
  branches: { id: number; branchName: string; branchCode: string }[];
  selectedClientId: number | null;
  currentUserName: string;
  logTypes: ClientLogTypeOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clientSearch, setClientSearch] = useState(searchText);
  const [clientId, setClientId] = useState(selectedClientId ? String(selectedClientId) : "");
  const [entryOpen, setEntryOpen] = useState(false);
  const [logType, setLogType] = useState("INQUIRY");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [customType, setCustomType] = useState("");
  const [isPtp, setIsPtp] = useState(false);
  const [isCollection, setIsCollection] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [collectionDate, setCollectionDate] = useState("");
  const [collectionAmount, setCollectionAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedClient = useMemo(() => clients.find((client) => String(client.id) === clientId), [clientId, clients]);

  useEffect(() => {
    if (clientSearch.trim() === searchText) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const value = clientSearch.trim();
      if (value) params.set("customer", value);
      else params.delete("customer");
      router.replace(`/client-logs${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [clientSearch, router, searchParams, searchText]);

  function openEntry(client: ClientOption) {
    setClientId(String(client.id));
    setError(null);
    setEntryOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const resolvedType = logType === ADD_TYPE ? normalizeClientLogType(customType) : logType;
    if (!resolvedType) {
      setError("Please name the new type.");
      return;
    }
    const response = await fetch("/api/client-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: Number(clientId),
        logType: resolvedType,
        subject,
        notes,
        isPtp,
        newDate: isPtp ? newDate : "",
        newAmount: isPtp ? newAmount : "",
        isCollection,
        collectionDate,
        collectionAmount
      })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Unable to save client log.");
      return;
    }
    // The type stays selected for the next entry; a newly added one is now in the list the
    // refresh brings back, so the sentinel has to give way to the value it created.
    if (logType === ADD_TYPE) setLogType(resolvedType);
    setCustomType("");
    setSubject("");
    setNotes("");
    setIsPtp(false);
    setIsCollection(false);
    setNewDate("");
    setNewAmount("");
    setCollectionDate("");
    setCollectionAmount("");
    setEntryOpen(false);
    setMessage("Client log saved.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <form className="panel p-4" action="/client-logs">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Client</span>
            <input className="field" name="customer" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Client name or number" autoComplete="off" />
          </label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Branch</span>
            <select className="field" name="branchId" defaultValue={filters.branchId}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branchName}</option>)}</select>
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

      <section>
        <div className="panel overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3"><p className="text-sm font-bold text-slate-950">Matching customers</p><p className="text-xs text-slate-500">{clients.length.toLocaleString("en-US")} result(s)</p></div>
          <div className="grid max-h-[620px] overflow-auto sm:grid-cols-2 xl:grid-cols-3">
            {clients.map((client, index) => <button key={client.id} type="button" onClick={() => openEntry(client)} className="block border-b border-r border-slate-100 bg-white px-3 py-2 text-left transition hover:bg-blue-50">
              <div className="flex gap-2"><span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-slate-100 text-[11px] font-bold text-brand-blue">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{client.fullName}</p><p className="truncate text-[11px] font-semibold text-slate-500">{client.branch.branchName} - {client.clientId ?? "No client no."}</p><p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">{client.contactNumber ?? "No contact"} | {client.address ?? "No address"}</p></div></div>
            </button>)}
            {!clients.length ? <div className="px-4 py-6 text-sm text-slate-500">Use one or more filters to find a customer and create a log entry.</div> : null}
          </div>
        </div>

      </section>

      {entryOpen && selectedClient ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="New client log entry" onMouseDown={(event) => { if (event.target === event.currentTarget) setEntryOpen(false); }}>
        <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-brand-green">New client log</p><h3 className="mt-1 text-xl font-bold text-slate-950">{selectedClient.fullName}</h3><p className="text-sm text-slate-500">Encoded by {currentUserName}. Entry time is recorded automatically.</p></div><button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEntryOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
          {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Type</span><select className="field" value={logType} onChange={(event) => setLogType(event.target.value)}>{logTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}<option value={ADD_TYPE}>+ Add a new type...</option></select></label>
          {logType === ADD_TYPE ? <label className="mt-3 block"><span className="mb-2 block text-sm font-semibold text-slate-700">New type name</span><input className="field" value={customType} onChange={(event) => setCustomType(event.target.value)} placeholder="Example: Home visit" required /><span className="mt-1 block text-xs text-slate-500">Saved with this log and offered in the list from then on.</span></label> : null}
          <label className="mt-3 block"><span className="mb-2 block text-sm font-semibold text-slate-700">Subject</span><input className="field" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Short title or purpose" /></label>
          <fieldset className="mt-3 rounded-md border border-slate-200 px-3 py-2">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment outcome</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue" checked={isPtp} onChange={(event) => setIsPtp(event.target.checked)} />PTP (promise to pay)</label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue" checked={isCollection} onChange={(event) => setIsCollection(event.target.checked)} />Collection</label>
            </div>
          </fieldset>
          {isPtp ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">PTP date</span><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="date" className="field pl-10" value={newDate} onChange={(event) => setNewDate(event.target.value)} required /></div></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">PTP amount</span><input type="number" min="0" step="0.01" className="field" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} placeholder="0.00" required /></label>
          </div> : null}
          {isCollection ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Collection date</span><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="date" className="field pl-10" value={collectionDate} onChange={(event) => setCollectionDate(event.target.value)} required /></div></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Collection amount</span><input type="number" min="0" step="0.01" className="field" value={collectionAmount} onChange={(event) => setCollectionAmount(event.target.value)} placeholder="0.00" required /></label>
          </div> : null}
          <label className="mt-3 block"><span className="mb-2 block text-sm font-semibold text-slate-700">Customer inquiry / request / notes</span><textarea className="min-h-36 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-blue-100" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Type what the customer asked, requested, or discussed during the visit." required /></label>
          <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setEntryOpen(false)}>Cancel</button><button className="btn-primary" disabled={isPending || !notes.trim()}><Save className="h-4 w-4" />Save Client Log</button></div>
        </form>
      </div> : null}
    </div>
  );
}
