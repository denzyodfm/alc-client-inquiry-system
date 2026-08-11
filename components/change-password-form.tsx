"use client";

import { CheckCircle2, KeyRound } from "lucide-react";
import { FormEvent, useState } from "react";

export function ChangePasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    setError(null);
    setNotice(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to change password.");

      formElement.reset();
      setNotice("Your password has been changed successfully.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}
      <input name="currentPassword" className="field" type="password" placeholder="Current password" autoComplete="current-password" required />
      <input name="newPassword" className="field" type="password" placeholder="New password (at least 8 characters)" autoComplete="new-password" minLength={8} required />
      <input name="confirmPassword" className="field" type="password" placeholder="Confirm new password" autoComplete="new-password" minLength={8} required />
      <button className="btn-primary w-full" disabled={loading}>
        <KeyRound className="h-4 w-4" />
        {loading ? "Changing password..." : "Change Password"}
      </button>
    </form>
  );
}
