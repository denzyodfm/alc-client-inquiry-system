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
  ChevronDown,
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
  href?: string;
  label: string;
  icon: keyof typeof icons;
  children?: NavItem[];
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
  const [openGroups, setOpenGroups] = useState(() => new Set<string>());

  function toggleGroup(label: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (!next.has(label)) next.add(label); else next.delete(label);
      return next;
    });
  }

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
        <div className="relative flex min-h-32 items-center justify-between gap-3 overflow-hidden border-b border-blue-100 bg-white px-3 py-3">
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-navy via-brand-blue to-brand-yellow" />
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 pl-1 text-xl font-extrabold uppercase tracking-[0.12em] text-brand-navy">ALC Central</p>
            <Image src="/branding/alc-logo.png" alt="Agusan Lending Corporation" width={700} height={224} priority className="h-auto w-full max-w-[255px]" />
          </div>
          <button type="button" className="btn-secondary h-9 w-9 px-0 lg:hidden" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav data-primary-nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {nav.map((item) => {
            const Icon = icons[item.icon];
            const groupActive = item.children?.some((child) => child.href && (pathname === child.href.split("?")[0] || pathname.startsWith(`${child.href.split("?")[0]}/`))) ?? false;
            const open = openGroups.has(item.label);
            if (item.children) return <div key={item.label}>
              <button type="button" onClick={() => toggleGroup(item.label)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${groupActive ? "bg-blue-50 text-brand-blue ring-1 ring-blue-100" : "text-slate-600 hover:bg-blue-50 hover:text-brand-blue"}`}>
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-yellow-100 text-brand-blue"><Icon className="h-[18px] w-[18px]" /></span><span className="flex-1 text-left">{item.label}</span><ChevronDown className={`h-4 w-4 text-brand-blue transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open ? <div className="ml-5 mt-1 space-y-1 border-l-2 border-blue-100 pl-2">{item.children.map((child) => {
                const ChildIcon = icons[child.icon];
                const childPath = child.href!.split("?")[0];
                const active = pathname === childPath || pathname.startsWith(`${childPath}/`);
                return <Link key={child.href} href={child.href!} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${active ? "bg-blue-50 text-brand-blue" : "text-slate-500 hover:bg-blue-50 hover:text-brand-blue"}`}><span className="flex h-6 w-6 items-center justify-center rounded bg-yellow-50 text-brand-blue"><ChildIcon className="h-4 w-4" /></span>{child.label}</Link>;
              })}</div> : null}
            </div>;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href!}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                  active ? "bg-blue-50 text-brand-blue ring-1 ring-blue-100" : "text-slate-600 hover:bg-blue-50 hover:text-brand-blue"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-yellow-100 text-brand-blue"><Icon className="h-[18px] w-[18px]" /></span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className={`flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] ${desktopSidebarHidden ? "lg:pl-0" : "lg:pl-72"}`}>
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
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block"><p className="text-xs text-slate-500">Signed in as</p><p className="max-w-48 truncate text-sm font-bold text-slate-900">{user.name}</p><p className="text-[10px] font-bold uppercase tracking-wide text-brand-blue">Privilege: {roleLabel(user.role)}</p></div>
            <LogoutButton />
          </div>
        </header>
        <div className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">{children}</div>
        <footer className="mx-3 mb-3 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-yellow-50 px-4 py-4 text-center text-sm text-slate-600 shadow-sm sm:mx-5 lg:mx-8">
          <p className="font-bold text-brand-navy">Agusan Lending Corporation. Copyright (c) {new Date().getFullYear()}. All rights reserved.</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-gradient-to-r from-brand-navy to-brand-blue px-3 py-1 font-extrabold italic tracking-wide text-white shadow-sm ring-2 ring-brand-yellow/70">Powered by</span><Image src="/branding/valdemeer-resources.png" alt="Valdemeer Resources, Inc" width={2048} height={768} className="h-9 w-auto object-contain" /><span className="font-semibold">IT Team dEnNiSjErRyDaNhIlLleEgEr.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
