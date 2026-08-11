import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { AppProgressBar } from "@/components/app-progress-bar";
import { canAccessFunction, type AppFunctionKey } from "@/lib/access-control";

type NavConfig = {
  href: string;
  label: string;
  icon: "Gauge" | "Building2" | "Banknote" | "Search" | "BrainCircuit" | "ClipboardCheck" | "ClipboardList" | "FileClock" | "Hourglass" | "ReceiptText" | "UserRoundCheck" | "MapPinned" | "Tag" | "History" | "Users" | "Settings" | "MapPin" | "KeyRound";
  functionKey?: AppFunctionKey;
};

const nav: NavConfig[] = [
  { href: "/dashboard", label: "Dashboard", icon: "Gauge", functionKey: "DASHBOARD" },
  { href: "/branches", label: "Branches", icon: "Building2", functionKey: "BRANCH_MANAGEMENT" },
  { href: "/inquiry", label: "Client Inquiry", icon: "Search", functionKey: "CLIENT_INQUIRY" },
  { href: "/client-logs", label: "Client Logs", icon: "FileClock", functionKey: "CLIENT_LOGS" },
  { href: "/current", label: "Current", icon: "ClipboardCheck", functionKey: "CURRENT_LOANS" },
  { href: "/loans", label: "Loan Results", icon: "ClipboardList", functionKey: "LOAN_RESULTS" },
  { href: "/aging", label: "Aging Report", icon: "Hourglass", functionKey: "AGING_REPORT" },
  { href: "/payments", label: "Payment Reports", icon: "ReceiptText", functionKey: "PAYMENT_REPORTS" },
  { href: "/payment-posting", label: "Payment Posting", icon: "Banknote", functionKey: "PAYMENT_POSTING" },
  { href: "/co-makers", label: "Co Makers", icon: "UserRoundCheck", functionKey: "CO_MAKERS" },
  { href: "/remedial", label: "Remedial", icon: "MapPinned", functionKey: "REMEDIAL" },
  { href: "/account-tagging", label: "Account Tagging", icon: "Tag", functionKey: "ACCOUNT_TAGGING" },
  { href: "/location-masterlist", label: "Location Masterlist", icon: "MapPinned", functionKey: "LOCATION_MASTERLIST" },
  { href: "/verify-address", label: "Verify Address", icon: "MapPin", functionKey: "VERIFY_ADDRESS" },
  { href: "/client-conditions", label: "Client Condition", icon: "UserRoundCheck", functionKey: "CLIENT_CONDITION" },
  { href: "/sync-logs", label: "Sync Logs", icon: "History", functionKey: "SYNC_LOGS" },
  { href: "/users", label: "Users", icon: "Users", functionKey: "USER_MANAGEMENT" },
  { href: "/change-password", label: "Change Password", icon: "KeyRound" },
  { href: "/settings", label: "Settings", icon: "Settings", functionKey: "SETTINGS_ACCESS" }
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const access = await Promise.all(nav.map(async (item) => !item.functionKey || canAccessFunction(user, item.functionKey)));
  const allowedNav = nav
    .filter((_item, index) => access[index])
    .map((item) =>
      user.role === "ACCOUNT_OFFICER" && item.href === "/account-tagging"
        ? { ...item, href: "/account-tagging?view=tagging", label: "Account View" }
        : item
    );

  return (
    <AppShell user={{ name: user.name, role: user.role }} nav={allowedNav}>
      <AppProgressBar />
      {children}
    </AppShell>
  );
}
