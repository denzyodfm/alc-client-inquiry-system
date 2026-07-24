import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

type NavConfig = {
  href: string;
  label: string;
  icon: "Gauge" | "Building2" | "Banknote" | "Search" | "BrainCircuit" | "ClipboardCheck" | "ClipboardList" | "FileClock" | "Hourglass" | "ReceiptText" | "UserRoundCheck" | "MapPinned" | "Tag" | "History" | "Users" | "Settings";
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
  { href: "/payments", label: "Payment Reports", icon: "ReceiptText", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] },
  { href: "/payment-posting", label: "Payment Posting", icon: "Banknote", roles: ["ADMIN", "HO_CASHIER"] },
  { href: "/co-makers", label: "Co Makers", icon: "UserRoundCheck", roles: ["ADMIN", "INQUIRY_USER", "AUDITOR", "AREA_TEAM_LEADER"] },
  { href: "/remedial", label: "Remedial", icon: "MapPinned", roles: ["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] },
  { href: "/account-tagging", label: "Account Tagging", icon: "Tag", roles: ["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] },
  { href: "/sync-logs", label: "Sync Logs", icon: "History", roles: ["ADMIN", "AUDITOR"] },
  { href: "/users", label: "Users", icon: "Users", roles: ["ADMIN", "AREA_TEAM_LEADER"] },
  { href: "/settings", label: "Settings", icon: "Settings", roles: ["ADMIN"] }
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const allowedNav = nav
    .filter((item) => item.roles.includes(user.role))
    .filter((item) =>
      user.role !== "ACCOUNT_OFFICER" ||
      ["/inquiry", "/client-logs", "/loans", "/account-tagging"].includes(item.href)
    )
    .filter((item) =>
      user.role !== "AREA_TEAM_LEADER" ||
      ["/inquiry", "/client-logs", "/loans", "/co-makers", "/account-tagging", "/users"].includes(item.href)
    )
    .map((item) =>
      user.role === "ACCOUNT_OFFICER" && item.href === "/account-tagging"
        ? { ...item, href: "/account-tagging?view=tagging", label: "Account View" }
        : item
    );

  return (
    <AppShell user={{ name: user.name, role: user.role }} nav={allowedNav}>
      {children}
    </AppShell>
  );
}
