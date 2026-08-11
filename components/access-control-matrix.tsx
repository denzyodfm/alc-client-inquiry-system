"use client";

import { CheckCircle2, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";

type Privilege = { id: number; name: string; permissions: Array<{ functionKey: string }> };
type AppFunction = { key: string; label: string; description: string };

export function AccessControlMatrix({ privileges, functions }: { privileges: Privilege[]; functions: AppFunction[] }) {
  const initial = privileges.flatMap((privilege) => privilege.permissions.map((permission) => `${privilege.id}:${permission.functionKey}`));
  const [checked, setChecked] = useState(() => new Set(initial));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(key: string) {
    setChecked((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
    setNotice(null);
  }

  async function save() {
    setLoading(true); setError(null); setNotice(null);
    try {
      const matrix = privileges.map((privilege) => ({
        privilegeTemplateId: privilege.id,
        functionKeys: functions.filter((item) => checked.has(`${privilege.id}:${item.key}`)).map((item) => item.key)
      }));
      const response = await fetch("/api/privileges/matrix", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matrix }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to save access matrix.");
      setNotice("Access matrix saved. Changes now apply to every user assigned to these privileges.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save access matrix."); }
    finally { setLoading(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold text-slate-950">Privilege Access Matrix</h3><p className="mt-1 text-sm text-slate-600">Rows are app functions. Columns are privileges. A checked box grants access.</p></div><div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green"><ShieldCheck className="h-4 w-4" />Admin always has full access</div></div>
    {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
    {notice ? <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}
    <div className="panel overflow-x-auto">
      {privileges.length ? <table className="w-full min-w-max border-collapse text-sm"><thead><tr className="bg-slate-50"><th className="sticky left-0 z-20 min-w-72 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-600">App Functionality</th>{privileges.map((privilege) => <th key={privilege.id} className="min-w-40 border-b border-slate-200 px-4 py-3 text-center text-slate-900">{privilege.name}</th>)}</tr></thead><tbody>{functions.map((item) => <tr key={item.key} className="border-b border-slate-100 last:border-0"><td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3"><span className="block font-bold text-slate-900">{item.label}</span><span className="block text-xs text-slate-500">{item.description}</span></td>{privileges.map((privilege) => { const key = `${privilege.id}:${item.key}`; return <td key={privilege.id} className="px-4 py-3 text-center"><input type="checkbox" checked={checked.has(key)} onChange={() => toggle(key)} aria-label={`${privilege.name}: ${item.label}`} className="h-5 w-5 rounded border-slate-300 text-brand-blue" /></td>; })}</tr>)}</tbody></table> : <p className="p-5 text-sm text-slate-500">Create at least one privilege before configuring the access matrix.</p>}
    </div>
    {privileges.length ? <div className="flex justify-end"><button type="button" className="btn-primary" onClick={save} disabled={loading}><Save className="h-4 w-4" />{loading ? "Saving..." : "Save Access Matrix"}</button></div> : null}
  </div>;
}
