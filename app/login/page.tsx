import Image from "next/image";
import { BadgeCheck, LockKeyhole, Network } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-white px-4 py-8 sm:px-8 lg:px-14">
      <Image
        src="/branding/alc-login-wallpaper.jpg"
        alt="Agusan Lending Corporation"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[64%_center]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.94)_34%,rgba(255,255,255,0.38)_62%,rgba(255,255,255,0.03)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-navy via-brand-blue to-brand-yellow" />

      <section className="relative z-10 w-full max-w-md">
        <div className="mb-7 rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.12)] backdrop-blur-md">
          <Image src="/branding/alc-logo.png" alt="Agusan Lending Corporation logo" width={700} height={224} priority className="h-auto w-full" />
        </div>
        <div className="rounded-2xl border border-white/90 bg-white/90 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-8">
          <div className="mb-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Central Client Services</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Welcome back</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to the ALC Client Inquiry System.</p>
          </div>
          <LoginForm />
          <div className="mt-7 grid grid-cols-3 gap-2 border-t border-slate-200 pt-5 text-center text-[11px] font-semibold text-slate-500">
            <span className="flex flex-col items-center gap-1.5"><LockKeyhole className="h-4 w-4 text-brand-blue" />Secure</span>
            <span className="flex flex-col items-center gap-1.5"><Network className="h-4 w-4 text-brand-blue" />Centralized</span>
            <span className="flex flex-col items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-brand-blue" />Authorized</span>
          </div>
        </div>
        <p className="mt-5 text-center text-xs font-medium text-slate-600">Your ready financial partner · Creating solutions with you since 1994.</p>
      </section>
    </main>
  );
}
