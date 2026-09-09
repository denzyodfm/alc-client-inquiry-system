import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// The groups exist so App Functionalities reads as a description of the business rather than an
// alphabetical dump of feature names. Order here is the order management sees on the page.
export const FUNCTION_GROUPS = [
  { key: "OVERSIGHT", label: "Portfolio Oversight", purpose: "The whole-company view: where the portfolio stands today, and what each closed month looked like." },
  { key: "CLIENT", label: "Client Servicing", purpose: "Everything an officer does with a borrower in front of them - looking them up, recording the visit, and planning the next one." },
  { key: "PORTFOLIO", label: "Loans and Reports", purpose: "The standing loan reports the branches work from day to day." },
  { key: "PAYMENTS", label: "Payments", purpose: "Recording money received, and reporting on it." },
  { key: "COLLECTIONS", label: "Collections and Remedial", purpose: "Accounts that need chasing, and who is answerable for chasing them." },
  { key: "DATA_QUALITY", label: "Address and Loan Verification", purpose: "The clean-up work that keeps addresses and loan records trustworthy. Mostly a once-per-record effort rather than daily use." },
  { key: "RESTRICTED", label: "Restricted Information", purpose: "Information deliberately withheld from most staff. Granting anything here is a considered decision, not a convenience." },
  { key: "ADMINISTRATION", label: "System Administration", purpose: "Running the system itself: who may sign in, what they may see, and whether branch data is arriving." }
] as const;

export type FunctionGroupKey = (typeof FUNCTION_GROUPS)[number]["key"];

// `description` is the short line shown beside each row of the access matrix. `explanation` is
// the longer, plain-language one written for management on the App Functionalities page: what the
// function lets someone do, and why that matters, without app jargon.
//
// The order below is the order the access matrix renders its rows in, so it is left alone.
// Grouping for the App Functionalities page comes from the `group` field, not from this order.
//
// The `satisfies` clause is what keeps the two in step: a function added here without a group, or
// with a group name that is not in FUNCTION_GROUPS, fails the build rather than quietly going
// missing from the page management reads.
export const APP_FUNCTIONS = [
  { key: "DASHBOARD", label: "Dashboard", description: "Portfolio dashboard and branch summaries", group: "OVERSIGHT", explanation: "The opening screen. Shows the size and health of the portfolio as it stands now, broken down by branch, so a manager can see the position of the business without asking anyone to prepare a report." },
  { key: "BRANCH_MANAGEMENT", label: "Branch Management", description: "Add, edit, delete, test, and sync branches", group: "ADMINISTRATION", explanation: "Registers each branch and the connection used to pull its records into this system. Also used to test a branch connection, and to trigger a sync by hand when a branch has fallen behind." },
  { key: "CLIENT_INQUIRY", label: "Client Inquiry", description: "Search clients and view loan information", group: "CLIENT", explanation: "The main search. Look up any borrower by name or account and see their loans, balances and payment record in one place, instead of phoning the branch that holds the file." },
  { key: "CLIENT_LOGS", label: "Client Logs", description: "View and encode client activity logs", group: "CLIENT", explanation: "The written record of dealings with a client: visits, calls, promises to pay, and what was agreed. It is the account history, so whoever picks the client up next knows what has already been tried." },
  { key: "CURRENT_LOANS", label: "Current", description: "View current-loan reports", group: "PORTFOLIO", explanation: "The list of loans that are up to date. Used to see healthy accounts apart from problem ones." },
  { key: "LOAN_RESULTS", label: "Loan Results", description: "View loan result lists and details", group: "PORTFOLIO", explanation: "Detailed loan listings with the figures behind each account, for checking one specific loan or exporting a set of them." },
  { key: "AGING_REPORT", label: "Aging Report", description: "View aging and delinquency reports", group: "PORTFOLIO", explanation: "Groups overdue accounts by how far behind they are. This is the report that shows where collection effort is most needed, and how delinquency is trending." },
  { key: "PAYMENT_REPORTS", label: "Payment Reports", description: "View payment reports", group: "PAYMENTS", explanation: "What has been collected, over a chosen period and by branch. Read-only: it reports on payments but does not record them." },
  { key: "PAYMENT_POSTING", label: "Payment Posting", description: "Post and review centralized payments", group: "PAYMENTS", explanation: "Records payments centrally against a loan. This one changes financial records, so it belongs only with staff trusted to handle money." },
  { key: "CO_MAKERS", label: "Co Makers", description: "View co-maker monitoring", group: "CLIENT", explanation: "Shows who stood as co-maker for whom, and how those guaranteed loans are performing. Needed before relying on a co-maker, and when a co-maker is a borrower themselves." },
  { key: "REMEDIAL", label: "Remedial", description: "Manage remedial assignments and visits", group: "COLLECTIONS", explanation: "Handles accounts that have gone bad: who has been assigned to recover them, what visits were made, and what came of them." },
  { key: "ACCOUNT_TAGGING", label: "Account Tagging", description: "Tag accounts and manage assignments", group: "COLLECTIONS", explanation: "Assigns accounts to the officer answerable for them. This is what makes an account appear in someone's own client list, so it is what fixes accountability." },
  { key: "LOCATION_MASTERLIST", label: "Location Masterlist", description: "View and link location portfolios", group: "DATA_QUALITY", explanation: "The official list of provinces, towns and barangays, and the link between each client address and a real place on it. Correct linking is what lets the portfolio be read by area." },
  { key: "VERIFY_ADDRESS", label: "Verify Address", description: "Correct questionable linked addresses", group: "DATA_QUALITY", explanation: "Working through the addresses the system matched but is not confident about, so a person can confirm or correct the match." },
  { key: "VERIFY_LOANS", label: "Verify Loans", description: "Tick outstanding loans as verified, by branch", group: "DATA_QUALITY", explanation: "Confirms, loan by loan and branch by branch, that an outstanding balance in this system matches the branch's own record. The audit trail behind trusting the numbers." },
  { key: "INVALID_ADDRESS", label: "Invalid Address", description: "Re-tag loans flagged as having a wrong address", group: "DATA_QUALITY", explanation: "The queue of clients whose recorded address was found to be wrong, so it can be corrected. A wrong address means an officer cannot find the borrower." },
  { key: "VERIFIED_LOANS", label: "Verified Loans", description: "Review verified loans and the verification report", group: "DATA_QUALITY", explanation: "The result of the verification work: which loans have been confirmed, by whom, and how much of the portfolio has been covered so far." },
  { key: "CLIENT_CONDITION", label: "Client Condition", description: "Manage client condition records", group: "CLIENT", explanation: "Records the borrower's present circumstances - situation, livelihood, and anything affecting their ability to pay - so a decision on the account rests on facts rather than assumption." },
  { key: "MY_CLIENTS", label: "My Clients", description: "An officer's own clients, grouped by location", group: "CLIENT", explanation: "An officer's personal workload: only the clients assigned to them, arranged by area so a day's route can be planned sensibly." },
  { key: "MY_SCHEDULE", label: "My Schedule", description: "An officer's follow-up and promise-to-pay calendar", group: "CLIENT", explanation: "A calendar of what an officer has committed to: follow-ups due, and promises to pay falling due, so nothing agreed with a client is forgotten." },
  { key: "MONTHLY_REPORTS", label: "Monthly Reports", description: "Month-end reports that do not change once captured", group: "OVERSIGHT", explanation: "The month-end position, captured once and then fixed. Because it cannot change afterwards, it is what month-on-month comparison and any outside reporting should rest on." },
  { key: "SYNC_LOGS", label: "Sync Logs", description: "View branch synchronization history", group: "ADMINISTRATION", explanation: "The record of each attempt to pull data from a branch, and whether it worked. The first place to look when a branch's figures appear stale." },
  { key: "USER_MANAGEMENT", label: "User Management", description: "Create and manage authorized user accounts", group: "ADMINISTRATION", explanation: "Creates staff accounts and controls who may sign in at all. Whoever holds this decides who has access to client data, so it is granted narrowly." },
  { key: "EMPLOYEE_LOANS", label: "Employee Loans", description: "See staff employee loans in searches, client lists, and loan details", group: "RESTRICTED", explanation: "Allows staff loans to appear in searches and listings. Without it they stay hidden, so what a colleague has borrowed, and whether they are behind on it, is not visible to the rest of the company. Held by Area TL, Finance Manager and HO TL, and by administrators." },
  { key: "SETTINGS_ACCESS", label: "Settings and Access Control", description: "Manage branches, privileges, and access matrix", group: "ADMINISTRATION", explanation: "Control of the access rules themselves - the privilege templates, and the matrix on the Access Matrix tab. Anyone holding this can widen their own access and everyone else's, which makes it the most powerful permission in the system." }
] as const satisfies readonly { key: string; label: string; description: string; group: FunctionGroupKey; explanation: string }[];

export type AppFunctionKey = (typeof APP_FUNCTIONS)[number]["key"];

const rolePrivilegeAliases: Partial<Record<UserRole, string[]>> = {
  ACCOUNT_OFFICER: ["Account Officer"],
  AREA_TEAM_LEADER: ["Area TL", "Area Team Leader"],
  AUDITOR: ["Auditor"],
  CREDIT_COMMITTEE: ["Credit Committee"],
  HO_CASHIER: ["HO Cashier"],
  INQUIRY_USER: ["Inquiry User"]
};

type AccessUser = { role: UserRole; position?: string | null; privilegeTemplateId?: number | null };

function roleDisplayName(role: UserRole) {
  return role.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

async function effectivePrivilegeTemplateId(user: AccessUser) {
  if (user.privilegeTemplateId) return user.privilegeTemplateId;

  const candidateNames = Array.from(new Set([
    user.position?.trim(),
    ...(rolePrivilegeAliases[user.role] ?? []),
    roleDisplayName(user.role)
  ].filter((name): name is string => Boolean(name))));
  if (!candidateNames.length) return null;

  const template = await prisma.privilegeTemplate.findFirst({
    where: { name: { in: candidateNames } },
    orderBy: { id: "asc" },
    select: { id: true }
  });
  return template?.id ?? null;
}

export async function canAccessFunction(user: AccessUser, functionKey: AppFunctionKey) {
  if (user.role === "ADMIN") return true;
  if (functionKey === "USER_MANAGEMENT" && user.role === "AREA_TEAM_LEADER") return true;
  const appFunction = APP_FUNCTIONS.find((item) => item.key === functionKey);
  if (appFunction && "adminOnly" in appFunction && appFunction.adminOnly) return false;
  const privilegeTemplateId = await effectivePrivilegeTemplateId(user);
  if (!privilegeTemplateId) return false;

  return Boolean(await prisma.privilegePermission.findUnique({
    where: {
      privilegeTemplateId_functionKey: {
        privilegeTemplateId,
        functionKey
      }
    },
    select: { id: true }
  }));
}

export async function canAccessAnyFunction(
  user: AccessUser,
  functionKeys: readonly AppFunctionKey[]
) {
  if (user.role === "ADMIN") return true;
  const access = await Promise.all(functionKeys.map((functionKey) => canAccessFunction(user, functionKey)));
  return access.some(Boolean);
}

export function isAppFunctionKey(value: string): value is AppFunctionKey {
  return APP_FUNCTIONS.some((item) => item.key === value);
}
