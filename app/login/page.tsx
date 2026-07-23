import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen overflow-x-hidden bg-slate-50 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex min-w-0 items-center bg-[linear-gradient(135deg,#10375c_0%,#1266b0_48%,#0e8f75_100%)] px-5 py-10 text-white sm:px-6 sm:py-12 lg:px-16">
        <div className="max-w-3xl">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-lg bg-white/15">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl lg:text-6xl">
            ALC Client Inquiry System
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-blue-50 sm:text-lg sm:leading-8">
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
      <section className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-6 sm:py-12">
        <div className="panel w-full max-w-md p-5 sm:p-8">
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
