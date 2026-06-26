import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Gauge,
  History,
  Search,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge, roles: ["ADMIN", "INQUIRY_USER", "AUDITOR"] },
  { href: "/branches", label: "Branches", icon: Building2, roles: ["ADMIN"] },
  { href: "/inquiry", label: "Client Inquiry", icon: Search, roles: ["ADMIN", "INQUIRY_USER", "AUDITOR"] },
  { href: "/loans", label: "Loan Results", icon: ClipboardList, roles: ["ADMIN", "INQUIRY_USER", "AUDITOR"] },
  { href: "/sync-logs", label: "Sync Logs", icon: History, roles: ["ADMIN", "AUDITOR"] },
  { href: "/users", label: "Users", icon: Users, roles: ["ADMIN"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] }
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const allowedNav = nav.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:w-72">
        <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-navy text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">ALC</p>
            <h1 className="text-lg font-bold text-slate-950">Client Inquiry</h1>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto p-4 lg:block lg:space-y-1">
          {allowedNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-max items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-brand-blue lg:min-w-0"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 lg:pl-72">
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur lg:px-8">
          <div>
            <p className="text-sm text-slate-500">Signed in as</p>
            <p className="font-semibold text-slate-900">{user.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-brand-green">
              {user.role.replace("_", " ")}
            </span>
            <LogoutButton />
          </div>
        </header>
        <div className="px-5 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
