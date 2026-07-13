"use client";

import { Database, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { dateTime } from "@/lib/format";

type Branch = {
  id: number;
  branchName: string;
  branchCode: string;
  publicIp: string | null;
  dynamicIp: string | null;
  dbHost: string;
  dbName: string;
  dbUser: string;
  status: string;
  lastSyncAt: string | null;
  connection?: {
    status: "ONLINE" | "OFFLINE";
    checkedAt: string;
    message: string;
  };
};

type SyncResult = {
  error?: string;
  branch?: string;
  status?: string;
  clientsPulled?: number;
  loansPulled?: number;
  paymentsPulled?: number;
  message?: string;
  results?: SyncResult[];
};

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function summarizeSync(result: SyncResult) {
  const results = result.results ?? [result];
  const completed = results.filter((item) => item.status === "SUCCESS").length;
  const failed = results.filter((item) => item.status === "FAILED").length;
  const clients = results.reduce((total, item) => total + (item.clientsPulled ?? 0), 0);
  const loans = results.reduce((total, item) => total + (item.loansPulled ?? 0), 0);
  const payments = results.reduce((total, item) => total + (item.paymentsPulled ?? 0), 0);

  return `${completed} completed, ${failed} failed. Synced ${clients.toLocaleString()} clients, ${loans.toLocaleString()} loans, ${payments.toLocaleString()} payments.`;
}

function canSyncBranch(branch: Branch) {
  return branch.status === "ACTIVE" && branch.connection?.status === "ONLINE";
}

export function BranchManager({ initialBranches }: { initialBranches: Branch[] }) {
  const [branches, setBranches] = useState(initialBranches);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingBranchId, setSyncingBranchId] = useState<number | "all" | null>(null);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!syncStartedAt) return;

    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - syncStartedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [syncStartedAt]);

  const syncLabel = useMemo(() => {
    if (syncingBranchId === "all") return "all active branches";
    const branch = branches.find((item) => item.id === syncingBranchId);
    return branch?.branchName ?? "selected branch";
  }, [branches, syncingBranchId]);
  const onlineBranchCount = branches.filter(canSyncBranch).length;

  async function refresh() {
    const response = await fetch("/api/branches");
    if (!response.ok) throw new Error("Unable to refresh branches.");
    setBranches(await response.json());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    const endpoint = editingBranch ? `/api/branches/${editingBranch.id}` : "/api/branches";

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: editingBranch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Unable to save branch.");
      }

      formElement.reset();
      setEditingBranch(null);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save branch.");
    } finally {
      setLoading(false);
    }
  }

  function editBranch(branch: Branch) {
    setEditingBranch(branch);
    setError(null);
  }

  function cancelEdit() {
    setEditingBranch(null);
    setError(null);
  }

  async function deleteBranch(branch: Branch) {
    const typed = window.prompt(
      `Deleting ${branch.branchName} will remove the branch and its synced clients, loans, payments, amortization schedules, and sync logs.\n\nType DELETE to proceed.`
    );
    if (typed !== "DELETE") {
      setError("Delete cancelled. Type DELETE exactly to confirm branch deletion.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Unable to delete branch.");
      }

      if (editingBranch?.id === branch.id) {
        setEditingBranch(null);
      }
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete branch.");
    } finally {
      setLoading(false);
    }
  }

  async function runSync(branch?: Branch) {
    if (branch && !canSyncBranch(branch)) {
      setError(`${branch.branchName} is ${branch.connection?.status ?? "not checked"}. Sync is available only for online active branches.`);
      return;
    }

    setLoading(true);
    setSyncingBranchId(branch?.id ?? "all");
    setSyncStartedAt(Date.now());
    setElapsedSeconds(0);
    setSyncSummary(null);
    setError(null);

    try {
      const response = await fetch(branch ? `/api/sync/branches/${branch.id}` : "/api/sync/run", { method: "POST" });
      const data = (await response.json().catch(() => null)) as SyncResult | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Unable to run ${branch ? branch.branchName : "branch"} sync.`);
      }
      if (data) {
        setSyncSummary(summarizeSync(data));
      }
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to run branch sync.");
    } finally {
      setLoading(false);
      setSyncingBranchId(null);
      setSyncStartedAt(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <form key={editingBranch?.id ?? "new"} onSubmit={submit} className="panel p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-950">{editingBranch ? "Edit Branch" : "Add Branch"}</h3>
          {editingBranch ? (
            <button type="button" className="btn-secondary h-9 px-3" onClick={cancelEdit} disabled={loading}>
              <X className="h-4 w-4" />
              Cancel
            </button>
          ) : null}
        </div>
        <div className="grid gap-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}
          <input name="branchName" className="field" placeholder="Branch name" defaultValue={editingBranch?.branchName ?? ""} required />
          <input name="branchCode" className="field" placeholder="Branch code" defaultValue={editingBranch?.branchCode ?? ""} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <input name="publicIp" className="field" placeholder="Public/static IP" defaultValue={editingBranch?.publicIp ?? ""} />
            <input name="dynamicIp" className="field" placeholder="Dynamic IP fallback" defaultValue={editingBranch?.dynamicIp ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <input name="dbHost" className="field" placeholder="DB host" defaultValue={editingBranch?.dbHost ?? ""} required />
            <input name="dbName" className="field" placeholder="DB name" defaultValue={editingBranch?.dbName ?? ""} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <input name="dbUser" className="field" placeholder="Read-only DB user" defaultValue={editingBranch?.dbUser ?? ""} required />
            <input
              name="dbPassword"
              type="password"
              className="field"
              placeholder={editingBranch ? "New DB password (optional)" : "DB password"}
              required={!editingBranch}
            />
          </div>
          <select name="status" className="field" defaultValue={editingBranch?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
          <button className="btn-primary" disabled={loading}>
            <Plus className="h-4 w-4" />
            {editingBranch ? "Update Branch" : "Save Branch"}
          </button>
        </div>
      </form>

      <section className="space-y-4">
        <div className="flex justify-end">
          <button className="btn-secondary" onClick={() => runSync()} disabled={loading || onlineBranchCount === 0} title={onlineBranchCount === 0 ? "No online active branches available to sync." : "Sync online active branches."}>
            <RotateCcw className="h-4 w-4" />
            {syncingBranchId === "all" ? "Syncing..." : "Run All"}
          </button>
        </div>
        {syncingBranchId ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-brand-navy">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Syncing {syncLabel}</p>
                <p className="mt-1 text-xs text-slate-600">Elapsed time: {formatElapsed(elapsedSeconds)}. This can take several minutes for large branches.</p>
              </div>
              <RotateCcw className="h-5 w-5 animate-spin" />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-brand-blue" />
            </div>
          </div>
        ) : syncSummary ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-brand-green">
            {syncSummary}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {branches.map((branch) => {
            const syncable = canSyncBranch(branch);

            return (
            <div key={branch.id} className="panel p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-blue-50 p-2.5 text-brand-blue">
                  <Database className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="min-w-[6rem] flex-1 text-sm font-bold leading-tight text-slate-950">{branch.branchName}</h4>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">{branch.status}</span>
                      <span
                        className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                          branch.connection?.status === "ONLINE" ? "bg-emerald-50 text-brand-green" : "bg-red-50 text-red-700"
                        }`}
                        title={branch.connection?.message}
                      >
                        {branch.connection?.status ?? "CHECKING"}
                      </span>
                      </div>
                    </div>
                    <p className="break-all text-xs text-slate-500">{branch.branchCode} - {branch.dbHost}</p>
                  </div>
                </div>
              </div>
              <dl className="mt-3 grid gap-1.5 text-xs">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Database</dt><dd className="font-semibold">{branch.dbName}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Fallback IP</dt><dd className="break-all text-right font-semibold">{branch.dynamicIp || "-"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">User</dt><dd className="font-semibold">{branch.dbUser}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Connection</dt><dd className="font-semibold">{branch.connection?.status ?? "Not checked"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Last sync</dt><dd className="font-semibold">{dateTime(branch.lastSyncAt)}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button type="button" className="btn-secondary h-9 px-2 text-xs" onClick={() => editBranch(branch)} disabled={loading}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-secondary h-9 px-2 text-xs"
                  onClick={() => runSync(branch)}
                  disabled={loading || !syncable}
                  title={syncable ? `Sync ${branch.branchName}` : "Sync is available only when this branch is online."}
                >
                  <RotateCcw className="h-4 w-4" />
                  {syncingBranchId === branch.id ? "Syncing" : "Sync"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => deleteBranch(branch)}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          );
          })}
        </div>
      </section>
    </div>
  );
}
