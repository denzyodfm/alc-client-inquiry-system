"use client";

import { FileClock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "@/lib/format";

type LogRow = {
  id: number;
  logType: string;
  subject: string | null;
  notes: string;
  newDate: string | null;
  newAmount: number | null;
  visitAt: string;
  branch: string;
  encodedBy: string;
};

type ClientInfo = {
  id: number;
  fullName: string;
  clientNumber: string | null;
  contactNumber: string | null;
  address: string | null;
  branch: string;
};

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-US");
}

function dateOnly(value: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US") : "-";
}

// Shows every client log recorded for one client. Rendered either as a button (Client
// Inquiry) or as the client name itself (dashboard log list).
export function ClientLogHistory({
  clientId,
  clientName,
  variant = "button",
  children
}: {
  clientId: number;
  clientName: string;
  variant?: "button" | "inline";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/client-logs/history?clientId=${clientId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load the client logs.");
        setClient(data.client);
        setLogs(data.logs);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load the client logs.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [clientId, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const promised = (logs ?? []).reduce((sum, log) => sum + (log.newAmount ?? 0), 0);

  return (
    <>
      <button
        type="button"
        className={variant === "button"
          ? "btn-secondary h-8 px-3 text-xs"
          : "text-left font-bold text-brand-blue hover:underline"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        title={`Client logs for ${clientName}`}
      >
        {variant === "button" ? <><FileClock className="h-3.5 w-3.5" />Client Log</> : children ?? clientName}
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
                aria-label={`Client logs for ${clientName}`}
                className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Client Log History</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">{client?.fullName ?? clientName}</h3>
                    <p className="text-xs text-slate-500">
                      {client ? `${client.clientNumber ?? "No client number"} | ${client.branch}${client.contactNumber ? ` | ${client.contactNumber}` : ""}` : "Loading..."}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {logs ? (
                      <p className="text-right text-xs font-semibold text-slate-600">
                        {logs.length.toLocaleString("en-US")} log(s)
                        <span className="block font-bold text-red-700">{money(promised)} promised</span>
                      </p>
                    ) : null}
                    <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900" onClick={() => setOpen(false)} aria-label="Close">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </header>
                <div className="overflow-auto">
                  {loading && !logs ? <p className="px-5 py-12 text-center font-semibold text-slate-500">Loading client logs...</p> : null}
                  {error ? <p className="px-5 py-12 text-center font-semibold text-red-700">{error}</p> : null}
                  {logs ? (
                    <table className="w-full min-w-[900px] text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">#</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Activity</th><th className="px-3 py-2">Promised</th>
                          <th className="px-3 py-2">Branch</th><th className="px-3 py-2">Encoded by</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logs.map((log, index) => (
                          <tr key={log.id}>
                            <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                            <td className="whitespace-nowrap px-3 py-2">{dateTime(log.visitAt)}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-semibold text-brand-blue">{log.logType.replace(/_/g, " ")}</td>
                            <td className="px-3 py-2">
                              {log.subject ? <span className="block font-bold text-slate-900">{log.subject}</span> : null}
                              <span className="whitespace-normal text-slate-600">{log.notes}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className="block font-semibold text-slate-700">{dateOnly(log.newDate)}</span>
                              <span className="block font-bold text-red-700">{log.newAmount ? money(log.newAmount) : "-"}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">{log.branch}</td>
                            <td className="whitespace-nowrap px-3 py-2">{log.encodedBy}</td>
                          </tr>
                        ))}
                        {!logs.length ? <tr><td colSpan={7} className="p-10 text-center font-semibold text-slate-500">No client logs recorded yet.</td></tr> : null}
                      </tbody>
                    </table>
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
