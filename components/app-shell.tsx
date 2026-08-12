"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  Banknote,
  BrainCircuit,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  Gauge,
  History,
  Hourglass,
  KeyRound,
  MapPin,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Search,
  Settings,
  Tag,
  UserRoundCheck,
  Users,
  X
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof icons;
};

const icons = {
  Banknote,
  Building2,
  BrainCircuit,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  Gauge,
  History,
  Hourglass,
  KeyRound,
  MapPin,
  MapPinned,
  ReceiptText,
  Search,
  Settings,
  Tag,
  UserRoundCheck,
  Users
};

function roleLabel(role: string) {
  return role.replace(/_/g, " ");
}

export function AppShell({
  user,
  nav,
  children
}: {
  user: { name: string; role: string };
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopSidebarHidden, setDesktopSidebarHidden] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden lg:flex">
      {mobileMenuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          aria-label="Close menu overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white transition-transform ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } ${desktopSidebarHidden ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
      >
        <div className="relative flex h-24 items-center justify-between gap-3 overflow-hidden border-b border-blue-100 bg-white px-4">
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-navy via-brand-blue to-brand-yellow" />
          <div className="min-w-0 flex-1">
            <Image src="/branding/alc-logo.png" alt="Agusan Lending Corporation" width={700} height={224} priority className="h-auto w-full max-w-[218px]" />
            <p className="mt-1 pl-1 text-[10px] font-bold uppercase tracking-[0.17em] text-brand-blue">Client Inquiry System</p>
          </div>
          <button type="button" className="btn-secondary h-9 w-9 px-0 lg:hidden" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav data-primary-nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {nav.map((item) => {
            const Icon = icons[item.icon];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                  active ? "bg-blue-50 text-brand-blue ring-1 ring-blue-100" : "text-slate-600 hover:bg-blue-50 hover:text-brand-blue"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className={`min-w-0 flex-1 transition-[padding] ${desktopSidebarHidden ? "lg:pl-0" : "lg:pl-72"}`}>
        <header className="sticky top-0 z-20 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-5 lg:flex-nowrap lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="btn-secondary h-10 w-10 shrink-0 px-0 lg:hidden" aria-label="Open menu" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="btn-secondary hidden h-10 w-10 shrink-0 px-0 lg:inline-flex"
              aria-label={desktopSidebarHidden ? "Show menu" : "Hide menu"}
              onClick={() => setDesktopSidebarHidden((value) => !value)}
            >
              {desktopSidebarHidden ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
            <div className="min-w-0">
              <p className="text-sm text-slate-500">Signed in as</p>
              <p className="truncate font-semibold text-slate-900">{user.name}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Privilege: {roleLabel(user.role)}</p>
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-brand-green sm:inline-flex">
              {roleLabel(user.role)}
            </span>
            <LogoutButton />
          </div>
        </header>
        <div className="min-w-0 px-3 py-5 sm:px-5 sm:py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
