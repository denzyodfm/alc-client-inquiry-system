"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { CalendarClock, LoaderCircle } from "lucide-react";

// The date that divides the verification backlog from newly arrived loans. One value for the
// whole organisation, so everyone's "as of" progress means the same thing.
export function VerificationBaselineForm({ startDate }: { startDate: string }) {
  const router = useRouter();
  const [value, setValue] = useState(startDate);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/verification-baseline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: value })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to save the baseline date.");
      setMessage("Baseline saved. Verify Loans now measures against this date.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save the baseline date.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel p-5" onSubmit={submit}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-brand-green">
        <CalendarClock className="h-5 w-5" />
      </div>
      <h3 className="font-bold text-slate-950">Verification Baseline</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Loans already in the system on this date are the backlog Verify Loans measures down to 100%. Anything that
        syncs in later is counted separately, so a growing queue never hides the progress made.
      </p>
      <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-600">
        Start date
        <input className="field mt-1" type="date" value={value} onChange={(event) => setValue(event.target.value)} required />
      </label>
      {message ? <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <button className="btn-primary h-9 px-3 text-xs" type="submit" disabled={saving || !value}>
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Save baseline
        </button>
      </div>
    </form>
  );
}
