"use client";

import { CheckCircle2, Pencil, Plus, Trash2, UserCog, X } from "lucide-react";
import { FormEvent, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  allBranches: boolean;
  isActive: boolean;
  branchAccess: Array<{ branchId: number }>;
};

type BranchOption = {
  id: number;
  branchName: string;
  branchCode: string;
};

function roleLabel(role: string) {
  return role.replace(/_/g, " ");
}

function branchAccessLabel(user: User, branches: BranchOption[]) {
  if (user.role === "ADMIN" || user.allBranches) return "All branches";

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const labels = user.branchAccess
    .map((access) => branchById.get(access.branchId))
    .filter((branch): branch is BranchOption => Boolean(branch))
    .map((branch) => `${branch.branchName} - ${branch.branchCode}`);

  return labels.length ? labels.join(", ") : "No branch access";
}

export function UserManager({ initialUsers, branches }: { initialUsers: User[]; branches: BranchOption[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [allBranches, setAllBranches] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/users");
    if (!response.ok) throw new Error("Unable to refresh users.");
    setUsers(await response.json());
  }

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  function editUser(user: User) {
    resetMessages();
    setEditingUser(user);
    setAllBranches(user.allBranches);
  }

  function cancelEdit() {
    resetMessages();
    setEditingUser(null);
    setAllBranches(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    const endpoint = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
    const password = String(payload.password ?? "");
    const confirmPassword = String(payload.confirmPassword ?? "");
    const branchIds = form.getAll("branchIds").map((value) => Number(value)).filter((value) => Number.isFinite(value));
    const hasAllBranches = form.get("allBranches") === "on";

    setLoading(true);
    resetMessages();

    try {
      if (password || confirmPassword) {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
      }

      const response = await fetch(endpoint, {
        method: editingUser ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          isActive: form.get("isActive") === "on",
          allBranches: hasAllBranches,
          branchIds: hasAllBranches ? [] : branchIds
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to save user.");
      }

      formElement.reset();
      setEditingUser(null);
      setNotice(editingUser ? "User updated." : "User created.");
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save user.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleUser(user: User) {
    setLoading(true);
    resetMessages();

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: user.name,
        email: user.email,
        role: user.role,
        allBranches: user.allBranches,
        branchIds: user.branchAccess.map((access) => access.branchId),
        isActive: !user.isActive
      })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to update user status.");
      }

      setNotice(user.isActive ? "User deactivated." : "User activated.");
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update user status.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(user: User) {
    const typed = window.prompt(`Deleting ${user.name} will remove their login account.\n\nType DELETE to proceed.`);
    if (typed !== "DELETE") {
      setError("Delete cancelled. Type DELETE exactly to confirm user deletion.");
      return;
    }

    setLoading(true);
    resetMessages();

    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to delete user.");
      }

      if (editingUser?.id === user.id) setEditingUser(null);
      setNotice("User deleted.");
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete user.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <form key={editingUser?.id ?? "new"} onSubmit={submit} className="panel p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-950">{editingUser ? "Edit User" : "Create User"}</h3>
          {editingUser ? (
            <button type="button" className="btn-secondary h-9 px-3" onClick={cancelEdit} disabled={loading}>
              <X className="h-4 w-4" />
              Cancel
            </button>
          ) : null}
        </div>

        <div className="grid gap-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green">
              <CheckCircle2 className="h-4 w-4" />
              {notice}
            </div>
          ) : null}

          <input name="name" className="field" placeholder="Full name" defaultValue={editingUser?.name ?? ""} required />
          <input name="email" className="field" type="email" placeholder="Email" defaultValue={editingUser?.email ?? ""} required />
          <input
            name="password"
            className="field"
            type="password"
            placeholder={editingUser ? "New password (optional)" : "Temporary password"}
            required={!editingUser}
          />
          <input
            name="confirmPassword"
            className="field"
            type="password"
            placeholder={editingUser ? "Confirm new password" : "Confirm temporary password"}
            required={!editingUser}
          />
          <select name="role" className="field" defaultValue={editingUser?.role ?? "INQUIRY_USER"}>
            <option value="ADMIN">Admin</option>
            <option value="INQUIRY_USER">Inquiry User</option>
            <option value="AUDITOR">Auditor</option>
            <option value="ACCOUNT_OFFICER">Account Officer</option>
            <option value="AREA_TEAM_LEADER">Area Team Leader</option>
            <option value="CREDIT_COMMITTEE">Credit Committee</option>
          </select>
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                name="allBranches"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={allBranches}
                onChange={(event) => setAllBranches(event.target.checked)}
              />
              Access all branches
            </label>
            {!allBranches ? (
              <div className="mt-3 grid max-h-56 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                {branches.map((branch) => {
                  const checked = editingUser?.branchAccess.some((access) => access.branchId === branch.id) ?? false;
                  return (
                    <label key={branch.id} className="flex items-start gap-2 rounded-md border border-slate-100 px-2 py-2 text-sm text-slate-700">
                      <input
                        name="branchIds"
                        type="checkbox"
                        value={branch.id}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        defaultChecked={checked}
                      />
                      <span>
                        <span className="block font-semibold text-slate-900">{branch.branchName}</span>
                        <span className="text-xs text-slate-500">{branch.branchCode}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              name="isActive"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              defaultChecked={editingUser?.isActive ?? true}
            />
            Active user
          </label>
          <button className="btn-primary" disabled={loading}>
            <Plus className="h-4 w-4" />
            {loading ? "Saving..." : editingUser ? "Update User" : "Save User"}
          </button>
        </div>
      </form>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Branches</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <UserCog className="h-4 w-4 text-brand-blue" />
                      {user.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{roleLabel(user.role)}</td>
                  <td className="px-4 py-3">
                    {user.role === "ADMIN" || user.allBranches ? (
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-brand-blue">All branches</span>
                    ) : (
                      <span className="block max-w-72 whitespace-normal text-sm text-slate-600">
                        {branchAccessLabel(user, branches)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${user.isActive ? "bg-emerald-50 text-brand-green" : "bg-slate-100 text-slate-600"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={() => editUser(user)} disabled={loading}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                      <button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={() => toggleUser(user)} disabled={loading}>
                        {user.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => deleteUser(user)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>No users found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
