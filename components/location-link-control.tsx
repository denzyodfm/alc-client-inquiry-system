"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UnlinkedLoansManager } from "@/components/unlinked-loans-manager";

export function LocationLinkControl({ unlinkedLoans }: { unlinkedLoans: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function runLinker() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/location-masterlist/link", { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error ?? "Unable to link loans.");
        return;
      }
      setMessage(
        `Completed: ${result.linked.toLocaleString("en-US")} linked, ${result.unmatched.toLocaleString("en-US")} unmatched.`
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="text-right">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Unlinked loans</p>
        <p className="font-bold text-slate-950">
          <UnlinkedLoansManager count={unlinkedLoans} onUpdated={() => router.refresh()} />
        </p>
      </div>
      <button className="btn-primary" type="button" onClick={runLinker} disabled={isPending || !unlinkedLoans}>
        {isPending ? "Linking loans..." : "Link New Loans"}
      </button>
      {message ? <p className={`w-full text-right text-xs font-semibold ${message.startsWith("Completed") ? "text-green-700" : "text-red-700"}`}>{message}</p> : null}
    </div>
  );
}
