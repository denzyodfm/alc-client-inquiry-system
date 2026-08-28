"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

// Ticked means verified. Unticking sends the loan back to Verify Loans and records the return,
// so it asks first - the check being undone was someone's recorded work.
export function UnverifyCheckbox({
  loanId,
  loanNumber,
  clientName,
  canUnverify
}: {
  loanId: number;
  loanNumber: string;
  clientName: string;
  canUnverify: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unverify() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/verify-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId, verified: false })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to return this loan.");
      setConfirming(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to return this loan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <label className="inline-flex cursor-pointer items-center gap-2" title={canUnverify ? "Untick to return this loan to Verify Loans" : "You do not have permission to return verified loans"}>
        <span className="sr-only">Return {loanNumber} to Verify Loans</span>
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer accent-brand-green disabled:cursor-not-allowed"
          checked
          disabled={!canUnverify || saving}
          onChange={() => setConfirming(true)}
        />
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin text-brand-blue" /> : null}
      </label>

      {confirming ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm returning this loan"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirming(false); }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-950">Return this loan?</h3>
            <p className="mt-2 text-sm text-slate-600">
              <b>{clientName}</b> — loan <b>{loanNumber}</b> goes back to Verify Loans and its verification is
              cleared. The return is recorded in the returned-verifications log.
            </p>
            {error ? <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary h-9 px-3 text-xs" disabled={saving} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className="btn-primary h-9 px-3 text-xs" disabled={saving} onClick={() => void unverify()}>
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Return the loan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
