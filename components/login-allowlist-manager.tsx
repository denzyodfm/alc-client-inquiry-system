"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LoaderCircle, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";

export type AllowlistRow = {
  id: number;
  address: string;
  label: string | null;
  enabled: boolean;
  createdAt: string;
};

export function LoginAllowlistManager({ rows, currentIp }: { rows: AllowlistRow[]; currentIp: string | null }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = rows.filter((row) => row.enabled);
  const enforcing = active.length > 0;

  async function send(init: RequestInit & { url?: string }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(init.url ?? "/api/login-allowlist", init);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to update the allowlist.");
      setAddress("");
      setLabel("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update the allowlist.");
    } finally {
      setBusy(false);
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, label }) });
  }

  return (
    <section className="panel p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-brand-green">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <h3 className="font-bold text-slate-950">Sign-in IP Allowlist</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Restricts where people may sign in from. While the list is empty, or everything on it is turned off, sign-in
        works from anywhere &mdash; a half-finished list can never lock the business out.
      </p>

      <p className={`mt-3 rounded px-3 py-2 text-xs font-semibold ${enforcing ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {enforcing
          ? `In force: only the ${active.length} enabled address(es) below can sign in.`
          : "Not in force: sign-in is currently allowed from any address."}
      </p>
      <p className="mt-2 text-xs text-slate-500">You are connecting from <b className="tabular-nums">{currentIp ?? "an address the server cannot read"}</b>.</p>

      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={add}>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Address or range
          <input
            className="field mt-1"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="192.168.4.0/24"
            required
          />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Label
          <input className="field mt-1" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Head office" />
        </label>
        <button className="btn-primary mt-5 h-10 px-3 text-xs" type="submit" disabled={busy || !address.trim()}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Allow
        </button>
      </form>
      {error ? <p role="alert" className="mt-2 rounded bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"><TriangleAlert className="mr-1 inline h-3.5 w-3.5" />{error}</p> : null}

      <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0">
              <span className="block font-bold tabular-nums text-slate-950">{row.address}</span>
              <span className="block text-xs text-slate-500">{row.label ?? "No label"}</span>
            </span>
            <span className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-brand-green"
                  checked={row.enabled}
                  disabled={busy}
                  onChange={(event) => void send({
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: row.id, enabled: event.target.checked })
                  })}
                />
                Enabled
              </label>
              <button
                type="button"
                className="rounded border border-slate-200 p-1.5 text-slate-500 hover:border-red-300 hover:text-red-700"
                title="Remove"
                disabled={busy}
                onClick={() => void send({ method: "DELETE", url: `/api/login-allowlist?id=${row.id}` })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
        ))}
        {!rows.length ? <li className="px-3 py-6 text-center text-sm font-semibold text-slate-500">No addresses configured.</li> : null}
      </ul>
    </section>
  );
}
