import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const APP_FUNCTIONS = [
  { key: "DASHBOARD", label: "Dashboard", description: "Portfolio dashboard and branch summaries" },
  { key: "BRANCH_MANAGEMENT", label: "Branch Management", description: "Add, edit, delete, test, and sync branches" },
  { key: "CLIENT_INQUIRY", label: "Client Inquiry", description: "Search clients and view loan information" },
  { key: "CLIENT_LOGS", label: "Client Logs", description: "View and encode client activity logs" },
  { key: "CURRENT_LOANS", label: "Current", description: "View current-loan reports" },
  { key: "LOAN_RESULTS", label: "Loan Results", description: "View loan result lists and details" },
  { key: "AGING_REPORT", label: "Aging Report", description: "View aging and delinquency reports" },
  { key: "PAYMENT_REPORTS", label: "Payment Reports", description: "View payment reports" },
  { key: "PAYMENT_POSTING", label: "Payment Posting", description: "Post and review centralized payments" },
  { key: "CO_MAKERS", label: "Co Makers", description: "View co-maker monitoring" },
  { key: "REMEDIAL", label: "Remedial", description: "Manage remedial assignments and visits" },
  { key: "ACCOUNT_TAGGING", label: "Account Tagging", description: "Tag accounts and manage assignments" },
  { key: "LOCATION_MASTERLIST", label: "Location Masterlist", description: "View and link location portfolios" },
  { key: "VERIFY_ADDRESS", label: "Verify Address", description: "Correct questionable linked addresses" },
  { key: "CLIENT_CONDITION", label: "Client Condition", description: "Manage client condition records" },
  { key: "SYNC_LOGS", label: "Sync Logs", description: "View branch synchronization history" },
  { key: "USER_MANAGEMENT", label: "User Management", description: "Create and manage user accounts" },
  { key: "SETTINGS_ACCESS", label: "Settings and Access Control", description: "Manage branches, privileges, and access matrix" }
] as const;

export type AppFunctionKey = (typeof APP_FUNCTIONS)[number]["key"];

export async function canAccessFunction(user: { role: UserRole; privilegeTemplateId?: number | null }, functionKey: AppFunctionKey) {
  if (user.role === "ADMIN") return true;
  if (!user.privilegeTemplateId) return false;

  return Boolean(await prisma.privilegePermission.findUnique({
    where: {
      privilegeTemplateId_functionKey: {
        privilegeTemplateId: user.privilegeTemplateId,
        functionKey
      }
    },
    select: { id: true }
  }));
}

export async function canAccessAnyFunction(
  user: { role: UserRole; privilegeTemplateId?: number | null },
  functionKeys: readonly AppFunctionKey[]
) {
  if (user.role === "ADMIN") return true;
  const access = await Promise.all(functionKeys.map((functionKey) => canAccessFunction(user, functionKey)));
  return access.some(Boolean);
}

export function isAppFunctionKey(value: string): value is AppFunctionKey {
  return APP_FUNCTIONS.some((item) => item.key === value);
}
