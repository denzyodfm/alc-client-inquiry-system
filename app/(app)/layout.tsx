import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { AppProgressBar } from "@/components/app-progress-bar";
import { AuditTracker } from "@/components/audit-tracker";
import { canAccessAnyFunction, canAccessFunction, type AppFunctionKey } from "@/lib/access-control";

type IconName = "Gauge" | "Banknote" | "Search" | "ClipboardCheck" | "ClipboardList" | "FileClock" | "Hourglass" | "ReceiptText" | "UserRoundCheck" | "MapPinned" | "Tag" | "History" | "Users" | "Settings" | "MapPin" | "KeyRound";
type NavConfig = { href?: string; label: string; icon: IconName; functionKey?: AppFunctionKey; functionKeys?: AppFunctionKey[]; children?: NavConfig[] };

const nav: NavConfig[] = [
  { href: "/dashboard", label: "Dashboard", icon: "Gauge", functionKey: "DASHBOARD" },
  { label: "Clients", icon: "Users", children: [
    { href: "/inquiry", label: "Client Inquiry", icon: "Search", functionKey: "CLIENT_INQUIRY" },
    { href: "/client-logs", label: "Client Logs", icon: "FileClock", functionKey: "CLIENT_LOGS" },
    { href: "/client-conditions", label: "Client Condition", icon: "UserRoundCheck", functionKey: "CLIENT_CONDITION" }
  ] },
  { href: "/co-makers", label: "Co Makers", icon: "UserRoundCheck", functionKey: "CO_MAKERS" },
  { label: "Loans", icon: "ClipboardList", children: [
    { href: "/current", label: "Current", icon: "ClipboardCheck", functionKey: "CURRENT_LOANS" },
    { href: "/remedial", label: "Remedial", icon: "MapPinned", functionKey: "REMEDIAL" },
    { href: "/aging", label: "Aging Report", icon: "Hourglass", functionKey: "AGING_REPORT" },
    { href: "/loans", label: "Loan Results", icon: "ClipboardList", functionKey: "LOAN_RESULTS" }
  ] },
  { label: "Payments", icon: "Banknote", children: [
    { href: "/payments", label: "Payment Reports", icon: "ReceiptText", functionKey: "PAYMENT_REPORTS" },
    { href: "/payment-posting", label: "Payment Posting", icon: "Banknote", functionKey: "PAYMENT_POSTING" }
  ] },
  { label: "Taggings", icon: "Tag", children: [
    { href: "/account-tagging", label: "Account Tagging", icon: "Tag", functionKey: "ACCOUNT_TAGGING" },
    { href: "/location-masterlist", label: "Location Masterlist", icon: "MapPinned", functionKey: "LOCATION_MASTERLIST" },
    { href: "/verify-address", label: "Verify Address", icon: "MapPin", functionKey: "VERIFY_ADDRESS" }
  ] },
  { href: "/settings", label: "Settings", icon: "Settings" }
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  async function allowed(item: NavConfig): Promise<NavConfig | null> {
    if (item.children) {
      const children = (await Promise.all(item.children.map(allowed))).filter((child): child is NavConfig => Boolean(child));
      return children.length ? { ...item, children } : null;
    }
    const hasAccess = item.functionKey ? await canAccessFunction(user!, item.functionKey) : item.functionKeys ? await canAccessAnyFunction(user!, item.functionKeys) : true;
    if (!hasAccess) return null;
    if (user!.role === "ACCOUNT_OFFICER" && item.href === "/account-tagging") return { ...item, href: "/account-tagging?view=tagging", label: "Account View" };
    return item;
  }

  const allowedNav = (await Promise.all(nav.map(allowed))).filter((item): item is NavConfig => Boolean(item));
  return <AppShell user={{ name: user.name, role: user.role }} nav={allowedNav}>
    <AppProgressBar />
    <AuditTracker />
    {children}
  </AppShell>;
}
