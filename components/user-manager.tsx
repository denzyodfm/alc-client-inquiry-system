"use client";

import { Plus, UserCog } from "lucide-react";
import { FormEvent, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

export function UserManager({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const response = await fetch("/api/users");
    setUsers(await response.json());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    event.currentTarget.reset();
    await refresh();
    setLoading(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <form onSubmit={submit} className="panel p-5">
        <h3 className="mb-5 text-lg font-bold text-slate-950">Create User</h3>
        <div className="grid gap-4">
          <input name="name" className="field" placeholder="Full name" required />
          <input name="email" className="field" type="email" placeholder="Email" required />
          <input name="password" className="field" type="password" placeholder="Temporary password" required />
          <select name="role" className="field" defaultValue="INQUIRY_USER">
            <option value="ADMIN">Admin</option>
            <option value="INQUIRY_USER">Inquiry User</option>
            <option value="AUDITOR">Auditor</option>
          </select>
          <button className="btn-primary" disabled={loading}>
            <Plus className="h-4 w-4" />
            Save User
          </button>
        </div>
      </form>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
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
                  <td className="px-4 py-3">{user.role.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${user.isActive ? "bg-emerald-50 text-brand-green" : "bg-slate-100 text-slate-600"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
