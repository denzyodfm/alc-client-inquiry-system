"use client";

import { CheckCircle2, MapPinned, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";

type TeamLeaderOption = { id: number; name: string };
type Area = {
  id: number;
  name: string;
  description: string | null;
  areaTeamLeaderId: number | null;
  areaTeamLeader: TeamLeaderOption | null;
  _count?: { users: number };
};

export function AreaManager({ initialAreas, teamLeaders }: { initialAreas: Area[]; teamLeaders: TeamLeaderOption[] }) {
  const [areas, setAreas] = useState(initialAreas);
  const [editing, setEditing] = useState<Area | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/areas");
    if (!response.ok) throw new Error("Unable to refresh areas.");
    setAreas(await response.json());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch(editing ? `/api/areas/${editing.id}` : "/api/areas", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), description: form.get("description"), areaTeamLeaderId: form.get("areaTeamLeaderId") })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to save area.");
      formElement.reset(); setEditing(null); await refresh();
      setNotice(editing ? "Area updated." : "Area created. It is now available in the user form.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save area."); }
    finally { setLoading(false); }
  }

  async function remove(area: Area) {
    if (!window.confirm(`Delete area "${area.name}"?`)) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/areas/${area.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to delete area.");
      if (editing?.id === area.id) setEditing(null);
      await refresh(); setNotice("Area deleted.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to delete area."); }
    finally { setLoading(false); }
  }

  return <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
    <form key={editing?.id ?? "new"} onSubmit={submit} className="panel space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-lg font-bold text-slate-950">{editing ? "Edit Area" : "Create Area"}</h3><p className="mt-1 text-sm text-slate-500">Define the areas that can be assigned to Account Officers.</p></div>
        {editing ? <button type="button" className="btn-secondary h-9 px-3" onClick={() => setEditing(null)}><X className="h-4 w-4" />Cancel</button> : null}
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}
      <input name="name" className="field" placeholder="Area name, e.g. Area 1 - Butuan" defaultValue={editing?.name ?? ""} maxLength={120} required />
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">Area Team Leader</span>
        <select name="areaTeamLeaderId" className="field" defaultValue={editing?.areaTeamLeaderId ?? ""}>
          <option value="">No Area Team Leader</option>
          {teamLeaders.map((leader) => <option key={leader.id} value={leader.id}>{leader.name}</option>)}
        </select>
        <span className="mt-1 block text-xs text-slate-500">Account Officers assigned to this area report to this Area Team Leader.</span>
      </label>
      <textarea name="description" className="field min-h-24" placeholder="Description (optional)" defaultValue={editing?.description ?? ""} maxLength={255} />
      <button className="btn-primary w-full" disabled={loading}>{editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{loading ? "Saving..." : editing ? "Update Area" : "Create Area"}</button>
    </form>
    <div className="panel overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="font-bold text-slate-950">Available Areas</h3></div>
      <div className="max-h-[calc(100vh-32rem)] min-h-64 overflow-auto overscroll-contain">
        {areas.map((area) => <div key={area.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
          <div className="min-w-0"><p className="flex items-center gap-2 font-bold text-slate-950"><MapPinned className="h-4 w-4 text-brand-blue" />{area.name}</p><p className="mt-1 text-sm text-slate-500">{area.areaTeamLeader ? <span className="font-semibold text-brand-blue">Area TL: {area.areaTeamLeader.name}</span> : <span className="font-semibold text-red-600">No Area TL</span>}{area._count ? ` · ${area._count.users} officer(s)` : ""}</p><p className="text-sm text-slate-500">{area.description || "No description"}</p></div>
          <div className="flex gap-2"><button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={() => { setEditing(area); setError(null); setNotice(null); }} disabled={loading}><Pencil className="h-4 w-4" />Edit</button><button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={() => remove(area)} disabled={loading}><Trash2 className="h-4 w-4" />Delete</button></div>
        </div>)}
        {!areas.length ? <p className="p-5 text-sm text-slate-500">No areas yet. Create one to make it selectable when assigning Account Officers.</p> : null}
      </div>
    </div>
  </div>;
}
