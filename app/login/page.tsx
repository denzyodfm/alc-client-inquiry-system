import Image from "next/image";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4 py-8 sm:px-8 lg:justify-start lg:px-[8vw]">
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

      <section className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-white/90 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.17)] backdrop-blur-xl sm:p-6">
          <Image src="/branding/alc-logo.png" alt="Agusan Lending Corporation" width={700} height={224} priority className="mb-4 h-auto w-full" />
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Central Client Services</p>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950">Welcome back</h1>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
