"use client";

import { FormEvent, useState } from "react";
import { Save } from "lucide-react";
import type { FooterBrandingValues } from "@/lib/footer-branding";

export function FooterBrandingForm({ initialValues }: { initialValues: FooterBrandingValues }) {
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Unable to save footer branding.");
      setValues(payload.footerBranding);
      setMessage("Footer branding saved. Refresh open pages to see the updated footer.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save footer branding.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className="panel p-5 xl:col-span-2">
    <h3 className="font-bold text-slate-950">Footer Branding</h3>
    <p className="mt-1 text-sm text-slate-500">These labels appear on both the sign-in page and every application layout.</p>
    {message ? <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green">{message}</p> : null}
    {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <label><span className="mb-1 block text-xs font-semibold text-slate-600">Powered-by label</span><input className="field" maxLength={80} value={values.poweredByLabel} onChange={(event) => setValues({ ...values, poweredByLabel: event.target.value })} required /></label>
      <label><span className="mb-1 block text-xs font-semibold text-slate-600">Partner / company name</span><input className="field" maxLength={180} value={values.partnerName} onChange={(event) => setValues({ ...values, partnerName: event.target.value })} required /></label>
      <label><span className="mb-1 block text-xs font-semibold text-slate-600">IT team label</span><input className="field" maxLength={180} value={values.itTeamLabel} onChange={(event) => setValues({ ...values, itTeamLabel: event.target.value })} required /></label>
    </div>
    <button className="btn-primary mt-4" disabled={saving}><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Footer Branding"}</button>
  </form>;
}
