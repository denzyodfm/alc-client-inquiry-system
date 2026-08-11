"use client";

import { CheckCircle2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type AppFunction = { key: string; label: string; description: string };
type UserOption = { id: number; name: string; email: string; role: string; isActive: boolean };
type Privilege = {
  id: number;
  name: string;
  description: string | null;
  permissions: Array<{ functionKey: string }>;
  users: Array<{ id: number; name: string; email: string; role: string }>;
};

export function PrivilegeManager({ initialPrivileges, functions, users }: { initialPrivileges: Privilege[]; functions: AppFunction[]; users: UserOption[] }) {
  const [privileges, setPrivileges] = useState(initialPrivileges);
  const [selectedId, setSelectedId] = useState<number | null>(initialPrivileges[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = privileges.find((item) => item.id === selectedId) ?? null;
  const assignedElsewhere = useMemo(
    () => new Map(privileges.filter((item) => item.id !== selectedId).flatMap((item) => item.users.map((user) => [user.id, item.name] as const))),
    [privileges, selectedId]
  );

  async function refresh(preferredId?: number) {
    const response = await fetch("/api/privileges");
    if (!response.ok) throw new Error("Unable to refresh privileges.");
    const next = await response.json() as Privilege[];
    setPrivileges(next);
    setSelectedId(preferredId ?? next[0]?.id ?? null);
  }

  async function createPrivilege(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/privileges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), description: form.get("description") })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to create privilege.");
      formElement.reset();
      await refresh(data.id);
      setNotice("Privilege template created. Select its functions and users below.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to create privilege."); }
    finally { setLoading(false); }
  }

  async function savePrivilege(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/privileges/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), description: form.get("description"),
          functionKeys: form.getAll("functionKeys"),
          userIds: form.getAll("userIds").map(Number)
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to save privilege.");
      await refresh(selected.id);
      setNotice("Privilege access updated for every assigned user.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save privilege."); }
    finally { setLoading(false); }
  }

  async function deletePrivilege() {
    if (!selected || !window.confirm(`Delete privilege “${selected.name}”? Assigned users will return to their original role-based access.`)) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/privileges/${selected.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to delete privilege.");
      await refresh();
      setNotice("Privilege deleted. Its users now use their original role-based access.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to delete privilege."); }
    finally { setLoading(false); }
  }

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-xl font-bold text-slate-950">Privilege Management</h3>
        <p className="mt-1 text-sm text-slate-600">Create reusable access templates. A change to a template applies to every assigned user.</p>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-4">
          <form onSubmit={createPrivilege} className="panel space-y-3 p-4">
            <h4 className="font-bold text-slate-950">Add Privilege</h4>
            <input name="name" className="field" placeholder="Privilege name, e.g. Branch Manager" maxLength={120} required />
            <input name="description" className="field" placeholder="Description (optional)" maxLength={255} />
            <button className="btn-primary w-full" disabled={loading}><Plus className="h-4 w-4" />Create Privilege</button>
          </form>
          <div className="panel overflow-hidden">
            {privileges.map((privilege) => (
              <button key={privilege.id} type="button" onClick={() => { setSelectedId(privilege.id); setError(null); setNotice(null); }} className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 ${selectedId === privilege.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                <span className="block font-bold text-slate-950">{privilege.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{privilege.users.length} user(s) · {privilege.permissions.length} function(s)</span>
              </button>
            ))}
            {!privileges.length ? <p className="p-4 text-sm text-slate-500">No privilege templates yet.</p> : null}
          </div>
        </div>

        {selected ? <form key={selected.id} onSubmit={savePrivilege} className="panel overflow-hidden">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h4 className="font-bold text-slate-950">Access Control Matrix</h4><p className="mt-1 text-xs text-slate-500">Editing this matrix updates all users assigned to the template.</p></div>
              <button type="button" onClick={deletePrivilege} className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50" disabled={loading}><Trash2 className="h-4 w-4" />Delete</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input name="name" className="field" defaultValue={selected.name} maxLength={120} required />
              <input name="description" className="field" defaultValue={selected.description ?? ""} placeholder="Description" maxLength={255} />
            </div>
          </div>
          <div className="grid lg:grid-cols-2">
            <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
              <h5 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">App Functionality</h5>
              <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                {functions.map((item) => <label key={item.key} className="flex items-start gap-3 rounded-md border border-slate-100 p-3 hover:bg-slate-50">
                  <input name="functionKeys" type="checkbox" value={item.key} defaultChecked={selected.permissions.some((permission) => permission.functionKey === item.key)} className="mt-1 h-4 w-4 rounded border-slate-300" />
                  <span><span className="block text-sm font-bold text-slate-900">{item.label}</span><span className="block text-xs text-slate-500">{item.description}</span></span>
                </label>)}
              </div>
            </div>
            <div className="p-4">
              <h5 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">Users</h5>
              <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                {users.map((user) => {
                  const admin = user.role === "ADMIN";
                  const elsewhere = assignedElsewhere.get(user.id);
                  return <label key={user.id} className={`flex items-start gap-3 rounded-md border p-3 ${admin ? "border-emerald-100 bg-emerald-50" : "border-slate-100 hover:bg-slate-50"}`}>
                    <input name="userIds" type="checkbox" value={user.id} defaultChecked={admin || selected.users.some((item) => item.id === user.id)} disabled={admin} className="mt-1 h-4 w-4 rounded border-slate-300" />
                    <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-bold text-slate-900">{user.name}{admin ? <ShieldCheck className="h-4 w-4 text-brand-green" /> : null}{!user.isActive ? <span className="text-[10px] uppercase text-slate-400">Inactive</span> : null}</span><span className="block truncate text-xs text-slate-500">{user.email} · {admin ? "Admin always has full access" : elsewhere ? `Currently assigned to ${elsewhere}` : "Uses role access until assigned"}</span></span>
                  </label>;
                })}
              </div>
            </div>
          </div>
          <div className="border-t border-slate-200 p-4"><button className="btn-primary w-full" disabled={loading}><Save className="h-4 w-4" />{loading ? "Saving..." : "Save Access Template"}</button></div>
        </form> : <div className="panel flex min-h-64 items-center justify-center p-6 text-sm text-slate-500">Create a privilege template to configure access.</div>}
      </div>
    </section>
  );
}
