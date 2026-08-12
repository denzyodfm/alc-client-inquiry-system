import Link from "next/link";
import { KeyRound, ServerCog, TimerReset } from "lucide-react";
import { requireUser, getAccessibleBranchIds } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getMidnightSyncSchedule } from "@/lib/midnight-sync-scheduler";
import { prisma } from "@/lib/prisma";
import { APP_FUNCTIONS, canAccessFunction } from "@/lib/access-control";
import { BranchManager } from "@/components/branch-manager";
import { PrivilegeManager } from "@/components/privilege-manager";
import { AccessControlMatrix } from "@/components/access-control-matrix";
import { UserManager } from "@/components/user-manager";
import { SyncLogsTable } from "@/components/sync-logs-table";
import { ChangePasswordForm } from "@/components/change-password-form";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

type Tab = "general" | "branches" | "privileges" | "matrix" | "users" | "sync-logs" | "system-logs" | "change-password";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const currentUser = await requireUser();
  const [canSettings, canBranches, canUsers, canSyncLogs] = await Promise.all([
    canAccessFunction(currentUser, "SETTINGS_ACCESS"),
    canAccessFunction(currentUser, "BRANCH_MANAGEMENT"),
    canAccessFunction(currentUser, "USER_MANAGEMENT"),
    canAccessFunction(currentUser, "SYNC_LOGS")
  ]);
  const tabs: Array<{ key: Tab; label: string; allowed: boolean }> = [
    { key: "general", label: "General", allowed: canSettings },
    { key: "branches", label: "Branches", allowed: canBranches },
    { key: "privileges", label: "Privileges", allowed: canSettings },
    { key: "matrix", label: "Access Matrix", allowed: canSettings },
    { key: "users", label: "Users", allowed: canUsers },
    { key: "sync-logs", label: "Sync Logs", allowed: canSyncLogs },
    { key: "system-logs", label: "System Logs", allowed: currentUser.role === "ADMIN" },
    { key: "change-password", label: "Change Password", allowed: true }
  ];
  const allowedTabs = tabs.filter((tab) => tab.allowed);
  const requested = (await searchParams).tab as Tab | undefined;
  const activeTab = allowedTabs.some((tab) => tab.key === requested) ? requested! : allowedTabs[0].key;
  const schedule = getMidnightSyncSchedule();
  const accessibleBranchIds = await getAccessibleBranchIds(currentUser);
  const isAdmin = currentUser.role === "ADMIN";

  const [allBranches, privileges, users, userBranches, syncLogs, systemLogText] = await Promise.all([
    canBranches ? prisma.branch.findMany({ orderBy: { branchName: "asc" } }) : [],
    canSettings ? prisma.privilegeTemplate.findMany({ orderBy: { name: "asc" }, include: { permissions: { select: { functionKey: true } }, _count: { select: { users: true } } } }) : [],
    canUsers ? prisma.user.findMany({
      where: isAdmin ? undefined : { role: "ACCOUNT_OFFICER", ...(accessibleBranchIds === null ? {} : { allBranches: false, branchAccess: { some: { branchId: { in: accessibleBranchIds } } } }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, position: true, baseBranchId: true, allBranches: true, isActive: true, privilegeTemplateId: true, privilegeTemplate: { select: { id: true, name: true } }, baseBranch: { select: { id: true, branchName: true, branchCode: true } }, branchAccess: { select: { branchId: true } } }
    }) : [],
    canUsers ? prisma.branch.findMany({ where: accessibleBranchIds === null ? undefined : { id: { in: accessibleBranchIds } }, orderBy: { branchName: "asc" }, select: { id: true, branchName: true, branchCode: true } }) : [],
    canSyncLogs ? prisma.syncLog.findMany({ take: 100, orderBy: { startedAt: "desc" }, include: { branch: { select: { branchName: true } } } }) : [],
    currentUser.role === "ADMIN" ? readFile(path.join(process.cwd(), "logs", "location-link.log"), "utf8").then((text) => text.split(/\r?\n/).filter(Boolean).slice(-250).join("\n")).catch(() => "No application system log file is available.") : ""
  ]);
  const safeBranches = allBranches.map(({ encryptedDbPassword: _encryptedDbPassword, ...branch }) => branch);
  const privilegeOptions = privileges.map(({ id, name }) => ({ id, name }));

  return <div className="space-y-6">
    <div><p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Configuration</p><h2 className="mt-2 text-3xl font-bold text-slate-950">Settings</h2></div>
    <nav className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1" aria-label="Settings sections">
      {allowedTabs.map((tab) => <Link key={tab.key} href={`/settings?tab=${tab.key}`} className={`whitespace-nowrap rounded-md px-4 py-2.5 text-sm font-semibold transition ${activeTab === tab.key ? "bg-brand-blue text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>{tab.label}</Link>)}
    </nav>

    {activeTab === "general" ? <section className="grid gap-4 xl:grid-cols-3">
      <div className="panel p-5"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-brand-blue"><TimerReset className="h-5 w-5" /></div><h3 className="font-bold text-slate-950">Midnight Sync Cron</h3><p className="mt-4 text-sm leading-6 text-slate-600">Automatically syncs online active branches every midnight while the app server is running.</p><dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="font-semibold text-slate-500">Status</dt><dd className="font-bold text-slate-950">{schedule.enabled ? "Enabled" : "Disabled"}</dd></div><div className="flex justify-between gap-3"><dt className="font-semibold text-slate-500">Next run</dt><dd className="font-bold text-slate-950">{dateTime(schedule.nextRunAt)}</dd></div></dl></div>
      <div className="panel p-5"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-brand-green"><ServerCog className="h-5 w-5" /></div><h3 className="font-bold text-slate-950">Sync Batch Size</h3><p className="mt-4 text-3xl font-bold text-slate-950">{process.env.SYNC_BATCH_SIZE || 500}</p><p className="mt-2 text-sm text-slate-500">Rows requested from each branch table per run.</p></div>
      <div className="panel p-5"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-slate-100 text-slate-700"><KeyRound className="h-5 w-5" /></div><h3 className="font-bold text-slate-950">Credential Storage</h3><p className="mt-4 text-sm leading-6 text-slate-600">Branch database passwords are encrypted with AES-256-GCM before storage and decrypted only during sync.</p></div>
    </section> : null}
    {activeTab === "branches" ? <BranchManager initialBranches={JSON.parse(JSON.stringify(safeBranches))} /> : null}
    {activeTab === "privileges" ? <PrivilegeManager initialPrivileges={JSON.parse(JSON.stringify(privileges))} /> : null}
    {activeTab === "matrix" ? <AccessControlMatrix privileges={JSON.parse(JSON.stringify(privileges))} functions={APP_FUNCTIONS.map((item) => ({ ...item }))} /> : null}
    {activeTab === "users" ? <UserManager initialUsers={users} branches={userBranches} currentUserRole={currentUser.role} canGrantAllBranches={isAdmin || accessibleBranchIds === null} privileges={privilegeOptions} /> : null}
    {activeTab === "sync-logs" ? <div className="space-y-4"><div><h3 className="text-xl font-bold text-slate-950">Sync Logs</h3><p className="mt-1 text-sm text-slate-600">Recent branch synchronization activity.</p></div><SyncLogsTable logs={syncLogs} /></div> : null}
    {activeTab === "system-logs" ? <div className="space-y-4"><div><h3 className="text-xl font-bold text-slate-950">System Logs</h3><p className="mt-1 text-sm text-slate-600">Administrator-only application and automated location-link activity.</p></div><div className="panel overflow-hidden"><pre className="max-h-[650px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-slate-700">{systemLogText}</pre></div></div> : null}
    {activeTab === "change-password" ? <div className="mx-auto max-w-xl space-y-4"><div><h3 className="text-xl font-bold text-slate-950">Change Password</h3><p className="mt-1 text-sm text-slate-600">Update your own password after confirming your current password.</p></div><ChangePasswordForm /></div> : null}
  </div>;
}
