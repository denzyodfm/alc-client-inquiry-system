import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex items-center bg-[linear-gradient(135deg,#10375c_0%,#1266b0_48%,#0e8f75_100%)] px-6 py-12 text-white lg:px-16">
        <div className="max-w-3xl">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-lg bg-white/15">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight lg:text-6xl">
            ALC Client Inquiry System
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-blue-50">
            Centralized client and loan verification across branch databases, with midnight sync visibility and role-based access.
          </p>
          <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
            {["Admin", "Inquiry User", "Auditor"].map((role) => (
              <div key={role} className="rounded-lg border border-white/20 bg-white/10 p-4 text-sm font-semibold">
                {role}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="panel w-full max-w-md p-8">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Secure access</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Sign in to continue</h2>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
