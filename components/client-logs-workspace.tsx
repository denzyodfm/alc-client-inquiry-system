"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileClock, Save, Search } from "lucide-react";
import { dateTime } from "@/lib/format";

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
  visitAt: string;
  createdAt: string;
  client: ClientOption;
  encodedBy: { name: string; email: string };
};

export function ClientLogsWorkspace({
  clients,
  logs,
  searchText,
  selectedClientId,
  currentUserName
}: {
  clients: ClientOption[];
  logs: ClientLogRow[];
  searchText: string;
  selectedClientId: number | null;
  currentUserName: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(selectedClientId ? String(selectedClientId) : clients[0]?.id ? String(clients[0].id) : "");
  const [logType, setLogType] = useState("INQUIRY");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedClient = useMemo(() => clients.find((client) => String(client.id) === clientId), [clientId, clients]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const response = await fetch("/api/client-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: Number(clientId),
        logType,
        subject,
        notes
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Unable to save client log.");
      return;
    }

    setSubject("");
    setNotes("");
    setMessage("Client log saved.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <form className="panel grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]" action="/client-logs">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Search customer</span>
          <input className="field" name="q" defaultValue={searchText} placeholder="Customer name, client no., contact, address" />
        </label>
        <button className="btn-primary self-end" type="submit">
          <Search className="h-4 w-4" />
          Search
        </button>
        <Link className="btn-secondary self-end" href="/client-logs">
          Clear
        </Link>
      </form>

      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-950">Matching customers</p>
            <p className="text-xs text-slate-500">{clients.length.toLocaleString("en-US")} result(s)</p>
          </div>
          <div className="max-h-[620px] overflow-auto">
            {clients.map((client, index) => (
              <button
                key={client.id}
                type="button"
                onClick={() => setClientId(String(client.id))}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-blue-50 ${
                  String(client.id) === clientId ? "bg-blue-50" : "bg-white"
                }`}
              >
                <div className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-brand-blue">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-bold text-slate-950">{client.fullName}</p>
                    <p className="text-xs font-semibold text-slate-500">{client.branch.branchName} - {client.clientId ?? "No client no."}</p>
                    <p className="mt-1 text-xs text-slate-500">{client.contactNumber ?? "No contact"} | {client.address ?? "No address"}</p>
                  </div>
                </div>
              </button>
            ))}
            {!clients.length ? (
              <div className="px-4 py-6 text-sm text-slate-500">Search for a customer to create or view historical logs.</div>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          <form onSubmit={submit} className="panel p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">New client log</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{selectedClient?.fullName ?? "Select customer"}</h3>
                <p className="text-sm text-slate-500">
                  Encoded by {currentUserName}. Date and time are recorded automatically.
                </p>
              </div>
              <div className="rounded-md bg-blue-50 p-2 text-brand-blue">
                <FileClock className="h-5 w-5" />
              </div>
            </div>

            {message ? <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green">{message}</div> : null}
            {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}

            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Customer</span>
                <select className="field" value={clientId} onChange={(event) => setClientId(event.target.value)} required>
                  <option value="">Select customer</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.fullName} - {client.branch.branchCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Type</span>
                <select className="field" value={logType} onChange={(event) => setLogType(event.target.value)}>
                  <option value="INQUIRY">Inquiry</option>
                  <option value="REQUEST">Request</option>
                  <option value="VISIT">Branch Visit</option>
                  <option value="COMPLAINT">Complaint</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </div>
            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Subject</span>
              <input className="field" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Short title or purpose" />
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Customer inquiry / request / notes</span>
              <textarea
                className="min-h-36 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-blue-100"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Type what the customer asked, requested, or discussed during the visit."
                required
              />
            </label>
            <button className="btn-primary mt-4" disabled={isPending || !clientId || !notes.trim()}>
              <Save className="h-4 w-4" />
              Save Client Log
            </button>
          </form>

          <div className="panel overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-bold text-slate-950">Historical logs</p>
              <p className="text-xs text-slate-500">Latest entries for the matching customer set</p>
            </div>
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <article key={log.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{log.client.fullName}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        {log.client.branch.branchName} - {log.client.clientId ?? "No client no."}
                      </p>
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{log.logType.replace(/_/g, " ")}</span>
                  </div>
                  {log.subject ? <h4 className="mt-3 font-bold text-slate-900">{log.subject}</h4> : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{log.notes}</p>
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    {dateTime(log.visitAt)} | Encoded by {log.encodedBy.name}
                  </p>
                </article>
              ))}
              {!logs.length ? (
                <div className="px-4 py-6 text-sm text-slate-500">No historical logs found for the current search.</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
