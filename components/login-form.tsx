"use client";

import { LockKeyhole, Mail } from "lucide-react";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password")
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Unable to sign in." }));
        setError(data.error || "Unable to sign in.");
        setLoading(false);
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      setError("Unable to reach the login service. Please refresh and try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Email address</span>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <input className="field pl-10" type="email" name="email" defaultValue="admin@alc.local" required />
        </div>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <input className="field pl-10" type="password" name="password" defaultValue="Admin@12345" required />
        </div>
      </label>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      <button className="btn-primary w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
