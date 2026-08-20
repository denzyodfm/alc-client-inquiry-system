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
import { AreaManager } from "@/components/area-manager";
import { UserManager } from "@/components/user-manager";
import { SyncLogsTable } from "@/components/sync-logs-table";
import { ChangePasswordForm } from "@/components/change-password-form";
import { AuditLogViewer } from "@/components/audit-log-viewer";
import { FooterBrandingForm } from "@/components/footer-branding-form";
import { getFooterBranding } from "@/lib/footer-branding";
import { listAreaTeamLeaders } from "@/lib/area-team-leaders";
import { branchAccessLevel, toAssignOnlyBranch } from "@/lib/branch-access";
import { listBranchTeamLeaders } from "@/lib/branch-team-leaders";

export const dynamic = "force-dynamic";

type Tab = "general" | "branches" | "areas" | "privileges" | "matrix" | "users" | "admin-users" | "sync-logs" | "system-logs" | "change-password";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const currentUser = await requireUser();
  const branchAccess = await branchAccessLevel(currentUser);
  const [canSettings, canBranches, canUsers, canSyncLogs] = await Promise.all([
    canAccessFunction(currentUser, "SETTINGS_ACCESS"),
    Promise.resolve(branchAccess !== "NONE"),
    canAccessFunction(currentUser, "USER_MANAGEMENT"),
    canAccessFunction(currentUser, "SYNC_LOGS")
  ]);
  const tabs: Array<{ key: Tab; label: string; allowed: boolean }> = [
    { key: "general", label: "General", allowed: canSettings },
    { key: "branches", label: "Branches", allowed: canBranches },
    { key: "areas", label: "Areas", allowed: canSettings },
    { key: "privileges", label: "Privileges", allowed: canSettings },
    { key: "matrix", label: "Access Matrix", allowed: canSettings },
    { key: "users", label: "Users", allowed: canUsers },
    { key: "admin-users", label: "Admin Users", allowed: currentUser.role === "ADMIN" },
    { key: "sync-logs", label: "Sync Logs", allowed: canSyncLogs },
    { key: "system-logs", label: "Audit Logs", allowed: currentUser.role === "ADMIN" },
    { key: "change-password", label: "Change Password", allowed: true }
  ];
  const allowedTabs = tabs.filter((tab) => tab.allowed);
  const requested = (await searchParams).tab as Tab | undefined;
  const activeTab = allowedTabs.some((tab) => tab.key === requested) ? requested! : allowedTabs[0].key;
  const schedule = getMidnightSyncSchedule();
  const accessibleBranchIds = await getAccessibleBranchIds(currentUser);
  // Administrators are outside the activity trail, so their own history stays out of the viewer.
  const adminUserIds = currentUser.role === "ADMIN"
    ? (await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((admin) => admin.id)
    : [];
  const isAdmin = currentUser.role === "ADMIN";

  const [allBranches, privileges, areas, users, userBranches, syncLogs, auditLogs, footerBranding] = await Promise.all([
    canBranches ? prisma.branch.findMany({ orderBy: { branchName: "asc" }, include: { branchTeamLeader: { select: { id: true, name: true } } } }) : [],
    canSettings ? prisma.privilegeTemplate.findMany({ orderBy: { name: "asc" }, include: { permissions: { select: { functionKey: true } }, _count: { select: { users: true } } } }) : [],
    canSettings || canUsers ? prisma.area.findMany({ orderBy: { name: "asc" }, include: { areaTeamLeader: { select: { id: true, name: true } }, _count: { select: { users: true } } } }) : [],
    canUsers ? prisma.user.findMany({
      where: isAdmin ? undefined : { role: "ACCOUNT_OFFICER", ...(accessibleBranchIds === null ? {} : { allBranches: false, branchAccess: { some: { branchId: { in: accessibleBranchIds } } } }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, position: true, baseBranchId: true, allBranches: true, isActive: true, privilegeTemplateId: true, privilegeTemplate: { select: { id: true, name: true } }, areaId: true, area: { select: { id: true, name: true, areaTeamLeader: { select: { name: true } } } }, areaTeamLeaderId: true, areaTeamLeader: { select: { id: true, name: true } }, branchTeamLeaderId: true, branchTeamLeader: { select: { id: true, name: true } }, baseBranch: { select: { id: true, branchName: true, branchCode: true, branchTeamLeader: { select: { name: true } } } }, branchAccess: { select: { branchId: true } } }
    }) : [],
    canUsers ? prisma.branch.findMany({ where: accessibleBranchIds === null ? undefined : { id: { in: accessibleBranchIds } }, orderBy: { branchName: "asc" }, select: { id: true, branchName: true, branchCode: true, branchTeamLeader: { select: { name: true } } } }) : [],
    canSyncLogs ? prisma.syncLog.findMany({ take: 100, orderBy: { startedAt: "desc" }, include: { branch: { select: { branchName: true } } } }) : [],
    currentUser.role === "ADMIN" ? prisma.auditLog.findMany({ take: 2000, where: adminUserIds.length ? { OR: [{ userId: null }, { userId: { notIn: adminUserIds } }] } : undefined, orderBy: { createdAt: "desc" }, select: { id: true, userName: true, userEmail: true, action: true, module: true, details: true, ipAddress: true, createdAt: true } }) : [],
    canSettings ? getFooterBranding() : null
  ]);
  const safeBranches = allBranches.map(({ encryptedDbPassword: _encryptedDbPassword, ...branch }) =>
    branchAccess === "FULL" ? branch : toAssignOnlyBranch(branch)
  );
  const branchTeamLeaderOptions = canBranches || canUsers ? await listBranchTeamLeaders() : [];
  const userRows = users.map(({ area, baseBranch, ...user }) => ({
    ...user,
    area: area ? { id: area.id, name: area.name, areaTeamLeaderName: area.areaTeamLeader?.name ?? null } : null,
    baseBranch: baseBranch
      ? { id: baseBranch.id, branchName: baseBranch.branchName, branchCode: baseBranch.branchCode, branchTeamLeaderName: baseBranch.branchTeamLeader?.name ?? null }
      : null
  }));
  const appUserRows = userRows.filter((user) => user.role !== "ADMIN");
  const adminUserRows = userRows.filter((user) => user.role === "ADMIN");
  const userBranchOptions = userBranches.map(({ id, branchName, branchCode, branchTeamLeader }) => ({ id, branchName, branchCode, branchTeamLeaderName: branchTeamLeader?.name ?? null }));
  const privilegeOptions = privileges.map(({ id, name }) => ({ id, name }));
  const areaOptions = areas.map(({ id, name, areaTeamLeader }) => ({ id, name, areaTeamLeaderName: areaTeamLeader?.name ?? null }));
  const teamLeaderOptions = canSettings || canUsers ? await listAreaTeamLeaders() : [];

  return <div className="space-y-2">
    <h2 className="text-lg font-bold text-slate-950">Settings</h2>
    <nav className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5" aria-label="Settings sections">
      {allowedTabs.map((tab) => <Link key={tab.key} href={`/settings?tab=${tab.key}`} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeTab === tab.key ? "bg-brand-blue text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>{tab.label}</Link>)}
    </nav>

    <div className={activeTab === "users" || activeTab === "admin-users" ? "min-h-64 pr-1" : "max-h-[calc(100vh-25rem)] min-h-64 overflow-auto overscroll-contain pr-1"}>
    {activeTab === "general" ? <section className="grid gap-4 xl:grid-cols-3">
      <div className="panel p-5"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-brand-blue"><TimerReset className="h-5 w-5" /></div><h3 className="font-bold text-slate-950">Midnight Sync Cron</h3><p className="mt-4 text-sm leading-6 text-slate-600">Automatically syncs online active branches every midnight while the app server is running.</p><dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="font-semibold text-slate-500">Status</dt><dd className="font-bold text-slate-950">{schedule.enabled ? "Enabled" : "Disabled"}</dd></div><div className="flex justify-between gap-3"><dt className="font-semibold text-slate-500">Next run</dt><dd className="font-bold text-slate-950">{dateTime(schedule.nextRunAt)}</dd></div></dl></div>
      <div className="panel p-5"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-brand-green"><ServerCog className="h-5 w-5" /></div><h3 className="font-bold text-slate-950">Sync Batch Size</h3><p className="mt-4 text-3xl font-bold text-slate-950">{process.env.SYNC_BATCH_SIZE || 500}</p><p className="mt-2 text-sm text-slate-500">Rows requested from each branch table per run.</p></div>
      <div className="panel p-5"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-slate-100 text-slate-700"><KeyRound className="h-5 w-5" /></div><h3 className="font-bold text-slate-950">Credential Storage</h3><p className="mt-4 text-sm leading-6 text-slate-600">Branch database passwords are encrypted with AES-256-GCM before storage and decrypted only during sync.</p></div>
      {footerBranding ? <FooterBrandingForm initialValues={footerBranding} /> : null}
      <div className="panel p-4 xl:col-span-2"><h3 className="mb-3 font-bold text-slate-950">Branch Sync Status</h3><div className="grid gap-3 md:grid-cols-2">{safeBranches.map((branch) => <div key={branch.id} className="rounded-lg border border-slate-200 p-3"><div className="flex justify-between gap-2"><div><b>{branch.branchName}</b><p className="text-xs text-slate-500">{branch.branchCode}</p></div><span className="h-fit rounded bg-slate-100 px-2 py-1 text-[10px] font-bold">{branch.status}</span></div><p className="mt-3 text-xs text-slate-500">Last sync: {dateTime(branch.lastSyncAt)}</p></div>)}</div></div>
      <div className="panel p-4"><h3 className="mb-3 font-bold text-slate-950">Latest Sync Logs</h3><div className="max-h-72 space-y-2 overflow-auto">{syncLogs.slice(0, 10).map((log) => <div key={log.id} className="flex justify-between gap-2 rounded border border-slate-200 p-2"><div><b className="text-sm">{log.branch?.branchName ?? "System"}</b><p className="text-xs text-slate-500">{dateTime(log.startedAt)}</p></div><span className={`h-fit rounded px-2 py-1 text-[10px] font-bold ${log.status === "SUCCESS" ? "bg-emerald-50 text-brand-green" : "bg-red-50 text-red-700"}`}>{log.status}</span></div>)}</div></div>
    </section> : null}
    {activeTab === "branches" ? <BranchManager initialBranches={JSON.parse(JSON.stringify(safeBranches))} branchTeamLeaders={branchTeamLeaderOptions} accessLevel={branchAccess === "FULL" ? "FULL" : "ASSIGN_ONLY"} /> : null}
    {activeTab === "areas" ? <AreaManager initialAreas={JSON.parse(JSON.stringify(areas))} teamLeaders={teamLeaderOptions} /> : null}
    {activeTab === "privileges" ? <PrivilegeManager initialPrivileges={JSON.parse(JSON.stringify(privileges))} /> : null}
    {activeTab === "matrix" ? <AccessControlMatrix privileges={JSON.parse(JSON.stringify(privileges))} functions={APP_FUNCTIONS.map((item) => ({ ...item }))} /> : null}
    {activeTab === "users" ? <UserManager initialUsers={appUserRows} branches={userBranchOptions} currentUserRole={currentUser.role} canGrantAllBranches={isAdmin || accessibleBranchIds === null} privileges={privilegeOptions} areas={areaOptions} teamLeaders={teamLeaderOptions} branchTeamLeaders={branchTeamLeaderOptions} /> : null}
    {activeTab === "admin-users" ? <div className="space-y-2">
      <p className="text-xs text-slate-500">Accounts with full access to every app function. Administrator accounts are protected: they cannot be deactivated or deleted, and new ones are created directly in the database.</p>
      <UserManager initialUsers={adminUserRows} branches={userBranchOptions} currentUserRole={currentUser.role} canGrantAllBranches={isAdmin || accessibleBranchIds === null} privileges={privilegeOptions} areas={areaOptions} teamLeaders={teamLeaderOptions} branchTeamLeaders={branchTeamLeaderOptions} title="Admin Users" allowCreate={false} showAssignmentFilters={false} />
    </div> : null}
    {activeTab === "sync-logs" ? <div className="space-y-4"><div><h3 className="text-xl font-bold text-slate-950">Sync Logs</h3><p className="mt-1 text-sm text-slate-600">Recent branch synchronization activity.</p></div><SyncLogsTable logs={syncLogs} /></div> : null}
    {activeTab === "system-logs" ? <div className="space-y-3"><div><h3 className="text-xl font-bold text-slate-950">Audit Logs</h3><p className="mt-1 text-sm text-slate-600">Administrator-only record of user sign-ins, sign-outs, and activities across the app.</p></div><AuditLogViewer rows={auditLogs.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} /></div> : null}
    {activeTab === "change-password" ? <div className="mx-auto max-w-xl space-y-4"><div><h3 className="text-xl font-bold text-slate-950">Change Password</h3><p className="mt-1 text-sm text-slate-600">Update your own password after confirming your current password.</p></div><ChangePasswordForm /></div> : null}
    </div>
  </div>;
}
