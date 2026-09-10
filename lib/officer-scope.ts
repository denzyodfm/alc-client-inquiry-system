import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Who a reader may look at in My Clients and My Schedule, and how they choose.
//
// The two layouts show one officer at a time, and who that officer may be depends entirely on
// who is asking:
//
//   Loan / Remedial Officer   themselves, with nothing to choose
//   Area TL                   the Remedial Officers in the area they lead
//   Branch TL                 the Loan Officers in the branch they lead
//   HO TL / Administrator     anyone, by picking an area or a branch first
//
// An area is answered by Remedial Officers and a branch by Loan Officers, so the choice of
// place already decides which kind of officer is on offer. That is why it is one dropdown
// rather than two: picking Area1 and branch 002 together describes nobody.

export type OfficerScope = {
  // "area:12" or "branch:30" - the value the dropdown carries.
  id: string;
  label: string;
  kind: "area" | "branch";
};

export type ScopedOfficer = {
  id: number;
  name: string;
  role: string | null;
  // Which scopes this officer appears under. A Remedial Officer belongs to their area, a Loan
  // Officer to their branch; anyone else is listed under both so they are never invisible.
  scopeIds: string[];
};

export type OfficerChoice =
  | { mode: "self"; officerId: number }
  | { mode: "choose"; scopes: OfficerScope[]; officers: ScopedOfficer[] };

const officerSelect = {
  id: true,
  name: true,
  privilegeTemplate: { select: { name: true } },
  area: { select: { id: true, name: true } },
  baseBranch: { select: { id: true, branchName: true, branchCode: true } }
} as const;

function isRemedial(role: string | null) {
  return (role ?? "").trim().toLocaleLowerCase("en") === "remedial officer";
}

function isLoanOfficer(role: string | null) {
  return (role ?? "").trim().toLocaleLowerCase("en") === "loan officer";
}

// Whoever answers for the whole organisation - an administrator, or anyone carrying HO TL by
// position or privilege template - chooses from every area and branch.
//
// Deliberately not the allBranches flag that hasOrganizationWideBranchAccess also accepts:
// every Area TL and Branch TL on the books carries it, because it says which branches' data
// they may read. Leading a team is a different question from answering for the whole company,
// and treating them as one would hand every team leader the entire officer list.
export type ScopeReader = {
  id: number;
  role: UserRole;
  position?: string | null;
  allBranches?: boolean;
  privilegeTemplateId?: number | null;
};

// The rule on its own, so it can be tested without a database behind it.
export function readsWholeOrganizationFrom(
  role: UserRole,
  ...names: Array<string | null | undefined>
) {
  if (role === "ADMIN") return true;
  return names.some((name) => name?.trim().toLocaleLowerCase("en") === "ho tl");
}

async function readsWholeOrganization(user: ScopeReader) {
  if (readsWholeOrganizationFrom(user.role, user.position)) return true;
  if (!user.privilegeTemplateId) return false;
  const privilege = await prisma.privilegeTemplate.findUnique({
    where: { id: user.privilegeTemplateId },
    select: { name: true }
  });
  return readsWholeOrganizationFrom(user.role, privilege?.name);
}

export async function officerChoiceFor(user: ScopeReader): Promise<OfficerChoice> {
  // An officer reads their own book. There is nothing to pick, so nothing is offered.
  if (user.role === "ACCOUNT_OFFICER") return { mode: "self", officerId: user.id };

  const isAdmin = await readsWholeOrganization(user);

  // What this reader leads decides what they may see. Reading it from the areas and branches
  // themselves rather than from a privilege name means a team leader keeps working if the
  // template is ever renamed.
  const [ledAreas, ledBranches] = isAdmin
    ? await Promise.all([
        prisma.area.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.branch.findMany({ orderBy: { branchCode: "asc" }, select: { id: true, branchName: true, branchCode: true } })
      ])
    : await Promise.all([
        prisma.area.findMany({ where: { areaTeamLeaderId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.branch.findMany({ where: { branchTeamLeaderId: user.id }, orderBy: { branchCode: "asc" }, select: { id: true, branchName: true, branchCode: true } })
      ]);

  const scopes: OfficerScope[] = [
    ...ledAreas.map((area) => ({ id: `area:${area.id}`, label: area.name, kind: "area" as const })),
    ...ledBranches.map((branch) => ({
      id: `branch:${branch.id}`,
      label: `${branch.branchCode} - ${branch.branchName}`,
      kind: "branch" as const
    }))
  ];

  if (!scopes.length) return { mode: "choose", scopes: [], officers: [] };

  const areaIds = ledAreas.map((area) => area.id);
  const branchIds = ledBranches.map((branch) => branch.id);
  const rows = await prisma.user.findMany({
    where: {
      role: "ACCOUNT_OFFICER",
      isActive: true,
      OR: [
        ...(areaIds.length ? [{ areaId: { in: areaIds } }] : []),
        ...(branchIds.length ? [{ baseBranchId: { in: branchIds } }] : [])
      ]
    },
    orderBy: { name: "asc" },
    select: officerSelect
  });

  const officers: ScopedOfficer[] = rows.map((officer) => {
    const role = officer.privilegeTemplate?.name?.trim() || null;
    const areaScope = officer.area && areaIds.includes(officer.area.id) ? `area:${officer.area.id}` : null;
    const branchScope = officer.baseBranch && branchIds.includes(officer.baseBranch.id) ? `branch:${officer.baseBranch.id}` : null;
    // The rule the business works to: an area is answered by its Remedial Officers, a branch by
    // its Loan Officers. Anyone whose privilege is neither is listed wherever they belong, so a
    // new or unusual role never silently disappears from the list.
    const scopeIds = isRemedial(role)
      ? [areaScope]
      : isLoanOfficer(role)
        ? [branchScope]
        : [areaScope, branchScope];
    return { id: officer.id, name: officer.name, role, scopeIds: scopeIds.filter((value): value is string => Boolean(value)) };
  });

  return { mode: "choose", scopes, officers: officers.filter((officer) => officer.scopeIds.length) };
}

// Resolves what the address bar asked for into the officers whose loans may actually be read.
// "all" totals a whole area or branch; a number is one officer. Either way the answer is
// filtered by what the reader is allowed to see, so a guessed id or scope yields nothing.
export async function resolveOfficerIds(
  user: ScopeReader,
  requested: { officerId?: string; scope?: string }
): Promise<{ officerIds: number[]; scopeLabel: string | null; isAll: boolean }> {
  if (user.role === "ACCOUNT_OFFICER") return { officerIds: [user.id], scopeLabel: null, isAll: false };

  const choice = await officerChoiceFor(user);
  if (choice.mode !== "choose") return { officerIds: [], scopeLabel: null, isAll: false };

  const wantsAll = (requested.officerId ?? "") === "all";
  if (wantsAll) {
    const scope = choice.scopes.find((candidate) => candidate.id === requested.scope);
    if (!scope) return { officerIds: [], scopeLabel: null, isAll: false };
    const ids = choice.officers.filter((officer) => officer.scopeIds.includes(scope.id)).map((officer) => officer.id);
    return { officerIds: ids, scopeLabel: scope.label, isAll: true };
  }

  const id = Number(requested.officerId ?? 0) || null;
  if (!id) return { officerIds: [], scopeLabel: null, isAll: false };
  return choice.officers.some((officer) => officer.id === id)
    ? { officerIds: [id], scopeLabel: null, isAll: false }
    : { officerIds: [], scopeLabel: null, isAll: false };
}

// Whether this reader may open that officer's book at all. The pages ask before querying, so a
// guessed id in the address bar returns nothing rather than somebody else's clients.
export async function canReadOfficer(user: ScopeReader, officerId: number) {
  if (user.role === "ACCOUNT_OFFICER") return officerId === user.id;
  if (await readsWholeOrganization(user)) return true;
  const choice = await officerChoiceFor(user);
  return choice.mode === "choose" && choice.officers.some((officer) => officer.id === officerId);
}
