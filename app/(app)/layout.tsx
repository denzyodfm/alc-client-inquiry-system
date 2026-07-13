import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

type NavConfig = {
  href: string;
  label: string;
  icon: "Gauge" | "Building2" | "Search" | "BrainCircuit" | "ClipboardCheck" | "ClipboardList" | "FileClock" | "Hourglass" | "UserRoundCheck" | "MapPinned" | "History" | "Users" | "Settings";
  roles: string[];
};

const nav: NavConfig[] = [
  { href: "/dashboard", label: "Dashboard", icon: "Gauge", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] },
  { href: "/branches", label: "Branches", icon: "Building2", roles: ["ADMIN"] },
  { href: "/inquiry", label: "Client Inquiry", icon: "Search", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER"] },
  { href: "/semantic-search", label: "Semantic Search", icon: "BrainCircuit", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] },
  { href: "/client-logs", label: "Client Logs", icon: "FileClock", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] },
  { href: "/current", label: "Current", icon: "ClipboardCheck", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER"] },
  { href: "/loans", label: "Loan Results", icon: "ClipboardList", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER"] },
  { href: "/aging", label: "Aging Report", icon: "Hourglass", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] },
  { href: "/co-makers", label: "Co Makers", icon: "UserRoundCheck", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR"] },
  { href: "/remedial", label: "Remedial", icon: "MapPinned", roles: ["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] },
  { href: "/sync-logs", label: "Sync Logs", icon: "History", roles: ["ADMIN", "AUDITOR"] },
  { href: "/users", label: "Users", icon: "Users", roles: ["ADMIN"] },
  { href: "/settings", label: "Settings", icon: "Settings", roles: ["ADMIN"] }
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const allowedNav = nav.filter((item) => item.roles.includes(user.role));

  return (
    <AppShell user={{ name: user.name, role: user.role }} nav={allowedNav}>
      {children}
    </AppShell>
  );
}
