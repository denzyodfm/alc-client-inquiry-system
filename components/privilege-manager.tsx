"use client";

import { CheckCircle2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";

type Privilege = { id: number; name: string; description: string | null; _count?: { users: number } };

export function PrivilegeManager({ initialPrivileges }: { initialPrivileges: Privilege[] }) {
  const [privileges, setPrivileges] = useState(initialPrivileges);
  const [editing, setEditing] = useState<Privilege | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/privileges");
    if (!response.ok) throw new Error("Unable to refresh privileges.");
    setPrivileges(await response.json());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch(editing ? `/api/privileges/${editing.id}` : "/api/privileges", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), description: form.get("description") })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to save privilege.");
      formElement.reset(); setEditing(null); await refresh();
      setNotice(editing ? "Privilege updated." : "Privilege created. It is now available in User Management and the Access Matrix.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save privilege."); }
    finally { setLoading(false); }
  }

  async function remove(privilege: Privilege) {
    if (!window.confirm(`Delete privilege "${privilege.name}"? Assigned users will lose app-function access until another privilege is assigned.`)) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/privileges/${privilege.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to delete privilege.");
      if (editing?.id === privilege.id) setEditing(null);
      await refresh(); setNotice("Privilege deleted.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to delete privilege."); }
    finally { setLoading(false); }
  }

  return <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
    <form key={editing?.id ?? "new"} onSubmit={submit} className="panel space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-lg font-bold text-slate-950">{editing ? "Edit Privilege" : "Create Privilege"}</h3><p className="mt-1 text-sm text-slate-500">Define the privilege names available to users.</p></div>
        {editing ? <button type="button" className="btn-secondary h-9 px-3" onClick={() => setEditing(null)}><X className="h-4 w-4" />Cancel</button> : null}
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}
      <input name="name" className="field" placeholder="Privilege name, e.g. Branch Manager" defaultValue={editing?.name ?? ""} maxLength={120} required />
      <textarea name="description" className="field min-h-24" placeholder="Description (optional)" defaultValue={editing?.description ?? ""} maxLength={255} />
      <button className="btn-primary w-full" disabled={loading}>{editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{loading ? "Saving..." : editing ? "Update Privilege" : "Create Privilege"}</button>
    </form>
    <div className="panel overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="font-bold text-slate-950">Available Privileges</h3></div>
      {privileges.map((privilege) => <div key={privilege.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
        <div className="min-w-0"><p className="font-bold text-slate-950">{privilege.name}</p><p className="mt-1 text-sm text-slate-500">{privilege.description || "No description"}{privilege._count ? ` · ${privilege._count.users} user(s)` : ""}</p></div>
        <div className="flex gap-2"><button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={() => { setEditing(privilege); setError(null); setNotice(null); }} disabled={loading}><Pencil className="h-4 w-4" />Edit</button><button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={() => remove(privilege)} disabled={loading}><Trash2 className="h-4 w-4" />Delete</button></div>
      </div>)}
      {!privileges.length ? <p className="p-5 text-sm text-slate-500">No privileges yet. Create one to add it to the matrix and user form.</p> : null}
    </div>
  </div>;
}
