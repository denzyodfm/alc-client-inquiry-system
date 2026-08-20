"use client";

import { CheckCircle2, Pencil, Plus, Search, Trash2, UserCog, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  position: string | null;
  baseBranchId: number | null;
  baseBranch: BranchOption | null;
  allBranches: boolean;
  isActive: boolean;
  branchAccess: Array<{ branchId: number }>;
  privilegeTemplateId: number | null;
  privilegeTemplate: PrivilegeOption | null;
  areaId: number | null;
  area: AreaOption | null;
  areaTeamLeaderId: number | null;
  areaTeamLeader: TeamLeaderOption | null;
  branchTeamLeaderId: number | null;
  branchTeamLeader: TeamLeaderOption | null;
};


type PrivilegeOption = { id: number; name: string };

type AreaOption = { id: number; name: string; areaTeamLeaderName?: string | null };

type TeamLeaderOption = { id: number; name: string };

type BranchOption = {
  id: number;
  branchName: string;
  branchCode: string;
  branchTeamLeaderName?: string | null;
};

function branchAccessLabel(user: User, branches: BranchOption[]) {
  if (user.role === "ADMIN" || user.allBranches) return "All branches";

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const labels = user.branchAccess
    .map((access) => branchById.get(access.branchId))
    .filter((branch): branch is BranchOption => Boolean(branch))
    .map((branch) => `${branch.branchName} - ${branch.branchCode}`);

  return labels.length ? labels.join(", ") : "No branch access";
}

export function UserManager({
  initialUsers,
  branches,
  currentUserRole,
  canGrantAllBranches,
  privileges,
  areas,
  teamLeaders,
  branchTeamLeaders
}: {
  initialUsers: User[];
  branches: BranchOption[];
  currentUserRole: string;
  canGrantAllBranches: boolean;
  privileges: PrivilegeOption[];
  areas: AreaOption[];
  teamLeaders: TeamLeaderOption[];
  branchTeamLeaders: TeamLeaderOption[];
}) {
  const isAdmin = currentUserRole === "ADMIN";
  const canEditUsers = isAdmin || currentUserRole === "AREA_TEAM_LEADER";
  const [users, setUsers] = useState(initialUsers);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [allBranches, setAllBranches] = useState(canGrantAllBranches);
  const [searchFilter, setSearchFilter] = useState("");
  const [privilegeFilter, setPrivilegeFilter] = useState("ALL");
  const [baseBranchFilter, setBaseBranchFilter] = useState("ALL");
  const [areaFilter, setAreaFilter] = useState("ALL");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedBaseBranchId, setSelectedBaseBranchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const positions = useMemo(
    () => Array.from(new Set(users.map((user) => user.position).filter((position): position is string => Boolean(position)))).sort(),
    [users]
  );
  const privilegeNames = useMemo(
    () => Array.from(new Set(users.map((user) => user.privilegeTemplate?.name).filter((name): name is string => Boolean(name)))).sort(),
    [users]
  );
  const visibleUsers = useMemo(
    () => users.filter((user) => {
      const term = searchFilter.trim().toLowerCase();
      const matchesSearch = !term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term);
      const matchesPrivilege = privilegeFilter === "ALL"
        || (privilegeFilter === "UNSET" ? !user.privilegeTemplate : user.privilegeTemplate?.name === privilegeFilter);
      const matchesBranch = baseBranchFilter === "ALL" || (baseBranchFilter === "UNSET" ? !user.baseBranchId : user.baseBranchId === Number(baseBranchFilter));
      const matchesArea = areaFilter === "ALL" || (areaFilter === "UNSET" ? !user.areaId : user.areaId === Number(areaFilter));
      return matchesSearch && matchesPrivilege && matchesBranch && matchesArea;
    }),
    [users, searchFilter, privilegeFilter, baseBranchFilter, areaFilter]
  );

  useEffect(() => {
    if (!formOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      // Mirrors cancelEdit(); inlined so the listener is not re-registered on every render.
      if (event.key !== "Escape") return;
      setError(null);
      setNotice(null);
      setFormOpen(false);
      setEditingUser(null);
      setAllBranches(canGrantAllBranches);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [formOpen, canGrantAllBranches]);

  async function refresh() {
    const response = await fetch("/api/users");
    if (!response.ok) throw new Error("Unable to refresh users.");
    setUsers(await response.json());
  }

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  function openCreate() {
    resetMessages();
    setEditingUser(null);
    setAllBranches(canGrantAllBranches);
    setSelectedAreaId("");
    setSelectedBaseBranchId("");
    setFormOpen(true);
  }

  function editUser(user: User) {
    resetMessages();
    setEditingUser(user);
    setAllBranches(user.allBranches);
    setSelectedAreaId(user.areaId ? String(user.areaId) : "");
    setSelectedBaseBranchId(user.baseBranchId ? String(user.baseBranchId) : "");
    setFormOpen(true);
  }

  function cancelEdit() {
    resetMessages();
    setFormOpen(false);
    setEditingUser(null);
    setAllBranches(canGrantAllBranches);
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
      if ((password || confirmPassword) && password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      if (editingUser && password && password.length < 8) {
        throw new Error("The new temporary password must be at least 8 characters.");
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
      setFormOpen(false);
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
        position: user.position ?? "",
        baseBranchId: user.baseBranchId ?? "",
        allBranches: user.allBranches,
        branchIds: user.branchAccess.map((access) => access.branchId),
        privilegeTemplateId: user.privilegeTemplateId ?? "",
        areaId: user.areaId ?? "",
        areaTeamLeaderId: user.areaTeamLeaderId ?? "",
        branchTeamLeaderId: user.branchTeamLeaderId ?? "",
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
      setNotice(data?.unassignedRemedial
        ? `User deleted. ${data.unassignedRemedial} remedial assignment(s) are now unassigned.`
        : "User deleted.");
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete user.");
    } finally {
      setLoading(false);
    }
  }

  const formRole = editingUser?.role ?? (isAdmin ? "INQUIRY_USER" : "ACCOUNT_OFFICER");
  const areaRequired = formRole === "ACCOUNT_OFFICER";
  const selectedArea = areas.find((area) => String(area.id) === selectedAreaId) ?? null;
  const selectedBaseBranch = branches.find((branch) => String(branch.id) === selectedBaseBranchId) ?? null;

  return (
    <div className="space-y-4">
      {formOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingUser ? "Edit user" : "Create user"}
          onMouseDown={(event) => { if (event.target === event.currentTarget) cancelEdit(); }}
        >
          <form key={editingUser?.id ?? "new"} onSubmit={submit} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">User Management</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{editingUser ? "Edit User" : "Create User"}</h3>
                {editingUser ? <p className="text-sm text-slate-500">{editingUser.name} - {editingUser.email}</p> : null}
              </div>
              <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={cancelEdit} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-4 overflow-y-auto overscroll-contain px-6 py-5" style={{ scrollbarGutter: "stable" }}>
              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

            <input name="name" className="field" placeholder="Full name" defaultValue={editingUser?.name ?? ""} required />
            <input name="email" className="field" type="email" placeholder="Email" defaultValue={editingUser?.email ?? ""} required />
            {!editingUser ? <>
              <input name="password" className="field" type="password" placeholder="Temporary password" required />
              <input name="confirmPassword" className="field" type="password" placeholder="Confirm temporary password" required />
            </> : null}
            {editingUser && isAdmin ? <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">Reset password (optional)</p>
              <div className="grid gap-2">
                <input name="password" className="field bg-white" type="password" placeholder="New temporary password" minLength={8} />
                <input name="confirmPassword" className="field bg-white" type="password" placeholder="Confirm new temporary password" minLength={8} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Leave both fields blank to keep the current password.</p>
            </div> : null}
            <input type="hidden" name="role" value={formRole} />
            {isAdmin ? (
              editingUser?.role === "ADMIN" ? <div><label className="mb-1 block text-xs font-semibold text-slate-600">Privilege</label><div className="field bg-emerald-50 font-semibold text-brand-green">Administrator - full access (protected)</div></div> : <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Privilege</span><select name="privilegeTemplateId" className="field" defaultValue={editingUser?.privilegeTemplateId ?? ""} required>
                  <option value="" disabled>Select privilege</option>
                  {privileges.map((privilege) => <option key={privilege.id} value={privilege.id}>{privilege.name}</option>)}
                </select></label>
            ) : <input type="hidden" name="privilegeTemplateId" value={editingUser?.privilegeTemplateId ?? ""} />}
            <input
              name="position"
              className="field"
              placeholder="Position (optional)"
              defaultValue={editingUser?.position ?? ""}
              list="user-position-options"
              maxLength={120}
            />
            <datalist id="user-position-options">
              {positions.map((position) => <option key={position} value={position} />)}
            </datalist>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Base Branch</span>
              <select name="baseBranchId" className="field" value={selectedBaseBranchId} onChange={(event) => setSelectedBaseBranchId(event.target.value)}>
                <option value="">No base branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.branchName} - {branch.branchCode}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Branch TL</span>
              <select name="branchTeamLeaderId" className="field" defaultValue={editingUser?.branchTeamLeaderId ?? ""}>
                <option value="">{selectedBaseBranch?.branchTeamLeaderName ? `Use branch's Branch TL (${selectedBaseBranch.branchTeamLeaderName})` : "No Branch TL"}</option>
                {branchTeamLeaders.filter((leader) => leader.id !== editingUser?.id).map((leader) => <option key={leader.id} value={leader.id}>{leader.name}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">This user belongs to the selected Branch TL. Leave blank to follow the base branch{selectedBaseBranch ? (selectedBaseBranch.branchTeamLeaderName ? "" : ", which has no Branch TL set") : ", which is not set"}.</span>
              {!branchTeamLeaders.length ? <span className="mt-1 block text-xs font-semibold text-red-600">No users hold the Branch TL privilege yet.</span> : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Assigned Area{areaRequired ? "" : " (optional)"}</span>
              <select name="areaId" className="field" value={selectedAreaId} onChange={(event) => setSelectedAreaId(event.target.value)} required={areaRequired}>
                <option value="">{areaRequired ? "Select assigned area" : "No assigned area"}</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
              {areaRequired && !areas.length ? <span className="mt-1 block text-xs font-semibold text-red-600">No areas exist yet. Create one under Settings - Areas first.</span> : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Area TL</span>
              <select name="areaTeamLeaderId" className="field" defaultValue={editingUser?.areaTeamLeaderId ?? ""}>
                <option value="">{selectedArea?.areaTeamLeaderName ? `Use area's Area TL (${selectedArea.areaTeamLeaderName})` : "No Area TL"}</option>
                {teamLeaders.filter((leader) => leader.id !== editingUser?.id).map((leader) => <option key={leader.id} value={leader.id}>{leader.name}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">This user belongs to the selected Area TL. Leave blank to follow the assigned area{selectedArea?.areaTeamLeaderName ? "" : ", which has no Area TL set"}.</span>
              {!teamLeaders.length ? <span className="mt-1 block text-xs font-semibold text-red-600">No users hold the Area TL privilege yet.</span> : null}
            </label>
            <div className="rounded-lg border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  name="allBranches"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={allBranches}
                  onChange={(event) => setAllBranches(event.target.checked)}
                  disabled={!canGrantAllBranches}
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
            {editingUser?.role === "ADMIN" ? <>
              <input type="hidden" name="isActive" value="on" />
              <div className="text-sm font-semibold text-brand-green">Active admin account (protected)</div>
            </> : <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  name="isActive"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  defaultChecked={editingUser?.isActive ?? true}
                />
                Active user
              </label>}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={loading}>Cancel</button>
              <button className="btn-primary" disabled={loading}>
                <Plus className="h-4 w-4" />
                {loading ? "Saving..." : editingUser ? "Update User" : "Save User"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {notice ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </div>
      ) : null}
      {error && !formOpen ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
          <div>
            <h3 className="font-bold text-slate-950">Users</h3>
            <p className="text-xs text-slate-500">{visibleUsers.length} of {users.length} shown</p>
          </div>
          {canEditUsers ? (
            <button type="button" className="btn-primary h-9 px-3 text-xs" onClick={openCreate} disabled={loading}>
              <Plus className="h-4 w-4" />
              Create User
            </button>
          ) : null}
        </div>
        <div className="grid gap-2 border-b border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="field h-9 pl-9"
              type="search"
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="Search user or email"
              aria-label="Search users by name or email"
            />
          </div>
          <select className="field h-9 bg-white" value={privilegeFilter} onChange={(event) => setPrivilegeFilter(event.target.value)} aria-label="Filter users by privilege">
            <option value="ALL">All privileges</option>
            {privilegeNames.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value="UNSET">No privilege set</option>
          </select>
          <select className="field h-9 bg-white" value={baseBranchFilter} onChange={(event) => setBaseBranchFilter(event.target.value)} aria-label="Filter users by base branch">
            <option value="ALL">All base branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branchName} - {branch.branchCode}</option>)}
            <option value="UNSET">Base branch not set</option>
          </select>
          <select className="field h-9 bg-white" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} aria-label="Filter users by assigned area">
            <option value="ALL">All areas</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            <option value="UNSET">Area not set</option>
          </select>
        </div>
        <div className="max-h-[calc(100vh-24rem)] min-h-80 overflow-auto overscroll-contain" style={{ scrollbarGutter: "stable" }}>
          <table className="w-full min-w-[1340px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Privilege</th>
                <th className="px-3 py-2">Position</th>
                <th className="px-3 py-2">Base Branch</th>
                <th className="px-3 py-2">Branch TL</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Area TL</th>
                <th className="px-3 py-2">Branches</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap font-semibold text-slate-900">
                      <UserCog className="h-3.5 w-3.5 shrink-0 text-brand-blue" />
                      {user.name}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">{user.role === "ADMIN" ? <span className="font-semibold text-brand-green">Full access</span> : user.privilegeTemplate?.name || <span className="font-semibold text-red-600">No app access</span>}</td>
                  <td className="px-3 py-2">{user.position || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2">
                    {user.baseBranch ? `${user.baseBranch.branchName} - ${user.baseBranch.branchCode}` : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {user.branchTeamLeader
                      ? <span className="font-semibold text-slate-900">{user.branchTeamLeader.name}</span>
                      : user.baseBranch?.branchTeamLeaderName
                        ? <><span className="block text-slate-700">{user.baseBranch.branchTeamLeaderName}</span><span className="block text-xs text-slate-400">from branch</span></>
                        : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {user.area ? user.area.name : user.role === "ACCOUNT_OFFICER" ? <span className="font-semibold text-red-600">No area</span> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {user.areaTeamLeader
                      ? <span className="font-semibold text-slate-900">{user.areaTeamLeader.name}</span>
                      : user.area?.areaTeamLeaderName
                        ? <><span className="block text-slate-700">{user.area.areaTeamLeaderName}</span><span className="block text-xs text-slate-400">from area</span></>
                        : user.role === "ACCOUNT_OFFICER" ? <span className="font-semibold text-red-600">No Area TL</span> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {user.role === "ADMIN" || user.allBranches ? (
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-brand-blue">All branches</span>
                    ) : (
                      <span className="block max-w-72 whitespace-normal text-sm text-slate-600">
                        {branchAccessLabel(user, branches)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${user.isActive ? "bg-emerald-50 text-brand-green" : "bg-slate-100 text-slate-600"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {canEditUsers ? <div className="flex flex-nowrap justify-end gap-1">
                      <button type="button" className="btn-secondary h-8 px-2 text-xs" onClick={() => editUser(user)} disabled={loading}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                      {user.role !== "ADMIN" ? <button type="button" className="btn-secondary h-8 px-2 text-xs" onClick={() => toggleUser(user)} disabled={loading}>
                        {user.isActive ? "Deactivate" : "Activate"}
                      </button> : <span className="inline-flex items-center px-2 text-xs font-semibold text-slate-500">Protected</span>}
                      {isAdmin && user.role !== "ADMIN" ? <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => deleteUser(user)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button> : null}
                    </div> : <span className="text-xs text-slate-400">View only</span>}
                  </td>
                </tr>
              ))}
              {!visibleUsers.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={11}>No users match the selected filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
