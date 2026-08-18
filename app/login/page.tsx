import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { getFooterBranding } from "@/lib/footer-branding";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const footerBranding = await getFooterBranding();
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-white px-4 pb-3 pt-6 sm:px-8">
      <Image
        src="/branding/alc-login-wallpaper.jpg"
        alt="Agusan Lending Corporation"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[64%_center]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.9)_30%,rgba(255,255,255,0.18)_58%,rgba(255,255,255,0.02)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-navy via-brand-blue to-brand-yellow" />

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center lg:w-[46%] lg:self-start">
      <section className="w-full max-w-sm lg:translate-y-8">
        <div className="rounded-2xl border border-white/90 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.17)] backdrop-blur-xl">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Central Client Services</p>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950">Welcome back</h1>
          </div>
          <LoginForm />
        </div>
      </section>
      </div>

      <footer className="relative z-10 px-2 py-0.5 text-center text-xs text-slate-600 sm:mx-auto sm:w-fit sm:min-w-[620px]">
        <p className="font-bold text-brand-navy">&copy; {new Date().getFullYear()} Agusan Lending Corporation. All rights reserved.</p>
        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5">
          <span className="rounded-full bg-gradient-to-r from-brand-navy to-brand-blue px-3 py-1 font-extrabold italic tracking-wide text-white shadow-sm ring-2 ring-brand-yellow/70">{footerBranding.poweredByLabel}</span>
          <span className="font-extrabold uppercase tracking-wide text-red-600">{footerBranding.partnerName}</span>
          <span className="font-semibold">{footerBranding.itTeamLabel}</span>
        </div>
      </footer>
    </main>
  );
}
