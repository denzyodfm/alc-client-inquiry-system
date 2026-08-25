import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locationSuggestionFromAddress, type AddressLocationOption } from "@/lib/location-linker";

// New Loans lists loans that nobody is handling yet: either no remedial assignment at all, or
// one with no officer on it. The date filter works on the date the loan was granted, so a
// recent period answers "what came in lately".
export type NewLoansPeriod = "all" | "today" | "week" | "month" | "quarter" | "year" | "custom";

export const NEW_LOAN_PERIODS: Array<{ value: NewLoansPeriod; label: string }> = [
  { value: "all", label: "All dates granted" },
  { value: "today", label: "Granted today" },
  { value: "week", label: "Granted in the last 7 days" },
  { value: "month", label: "Granted in the last 30 days" },
  { value: "quarter", label: "Granted in the last 90 days" },
  { value: "year", label: "Granted in the last 365 days" },
  { value: "custom", label: "Custom range" }
];

export function newLoansRange(period: NewLoansPeriod, customFrom?: string, customTo?: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const daysBack = (days: number) => {
    const from = new Date(start);
    from.setDate(from.getDate() - (days - 1));
    return { from, to: end };
  };

  switch (period) {
    case "custom":
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`) : undefined,
        to: customTo ? new Date(`${customTo}T23:59:59.999`) : undefined
      };
    case "today": return { from: start, to: end };
    case "week": return daysBack(7);
    case "month": return daysBack(30);
    case "quarter": return daysBack(90);
    case "year": return daysBack(365);
    default: return { from: undefined, to: undefined };
  }
}

export type NewLoanRow = {
  id: number;
  clientName: string;
  clientNumber: string | null;
  contactNumber: string | null;
  address: string | null;
  loanNumber: string;
  product: string | null;
  branch: string;
  branchId: number;
  branchAo: string;
  grantedAt: Date | null;
  maturityAt: Date | null;
  principalAmount: number;
  balance: number;
  status: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  locationId: number | null;
  province: string;
  municipality: string;
  barangay: string;
  teamLeader: string | null;
};

// A page that lists thousands of rows, each carrying its own officer dropdown, gets heavy
// fast. The list is capped and the caller is told when there is more behind the filter.
export const NEW_LOANS_PAGE_SIZE = 50;

export async function newLoanRows({
  from,
  to,
  branchIds,
  accessibleBranchIds,
  page = 1,
  paginate = true
}: {
  from?: Date;
  to?: Date;
  branchIds?: number[];
  accessibleBranchIds: number[] | null;
  page?: number;
  paginate?: boolean;
}) {
  const where: Prisma.LoanWhereInput = {
    balance: { gt: 0 },
    ...(accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 }),
    ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
    ...(from || to ? { releasedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    OR: [{ remedialAssignment: { is: null } }, { remedialAssignment: { is: { assignedToId: null } } }]
  };

  const [matching, aggregate] = await Promise.all([
    prisma.loan.count({ where }),
    prisma.loan.aggregate({ where, _sum: { principalAmount: true, balance: true } })
  ]);
  const totalPages = Math.max(1, Math.ceil(matching / NEW_LOANS_PAGE_SIZE));
  const safePage = paginate ? Math.min(Math.max(1, Math.trunc(page) || 1), totalPages) : 1;
  const loans = await prisma.loan.findMany({
    where,
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    ...(paginate ? { skip: (safePage - 1) * NEW_LOANS_PAGE_SIZE, take: NEW_LOANS_PAGE_SIZE } : {}),
    select: {
      id: true,
      loanNumber: true,
      remoteId: true,
      loanProduct: true,
      branchAo: true,
      principalAmount: true,
      balance: true,
      releasedAt: true,
      maturityAt: true,
      sourceStatusName: true,
      branchId: true,
      branch: { select: { branchName: true, branchCode: true, branchTeamLeader: { select: { name: true } } } },
      client: { select: { fullName: true, clientId: true, contactNumber: true, address: true, permanentAddress: true, permanentProvince: true, permanentMunicipality: true, permanentBarangay: true } },
      locationMasterlist: { select: { id: true, province: true, municipality: true, barangay: true } },
      remedialAssignment: { select: { assignedToId: true, assignedTo: { select: { name: true } } } }
    }
  });

  const locations: AddressLocationOption[] = await prisma.locationMasterlist.findMany({
    orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }],
    select: { id: true, province: true, municipality: true, barangay: true }
  });

  const rows: NewLoanRow[] = loans.map((loan) => {
    const address = loan.client.permanentAddress || loan.client.address;
    const structured = loan.client.permanentProvince && loan.client.permanentMunicipality && loan.client.permanentBarangay
      ? locations.find((location) =>
          location.province.localeCompare(loan.client.permanentProvince!, undefined, { sensitivity: "base" }) === 0
          && location.municipality.localeCompare(loan.client.permanentMunicipality!, undefined, { sensitivity: "base" }) === 0
          && location.barangay.localeCompare(loan.client.permanentBarangay!, undefined, { sensitivity: "base" }) === 0
        ) ?? null
      : null;
    const location = structured ?? loan.locationMasterlist ?? locationSuggestionFromAddress(address, locations);
    return ({
    id: loan.id,
    clientName: loan.client.fullName,
    clientNumber: loan.client.clientId,
    contactNumber: loan.client.contactNumber,
    address,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    product: loan.loanProduct,
    branch: `${loan.branch.branchCode} - ${loan.branch.branchName}`,
    branchId: loan.branchId,
    // The officer the branch system itself records against the loan.
    branchAo: (loan.branchAo ?? "").trim() || "-",
    grantedAt: loan.releasedAt,
    maturityAt: loan.maturityAt,
    principalAmount: Number(loan.principalAmount),
    balance: Number(loan.balance),
    status: loan.sourceStatusName,
    assignedToId: loan.remedialAssignment?.assignedToId ?? null,
    assignedToName: loan.remedialAssignment?.assignedTo?.name ?? null,
    locationId: location?.id ?? null,
    province: location?.province ?? loan.client.permanentProvince ?? "",
    municipality: location?.municipality ?? loan.client.permanentMunicipality ?? "",
    barangay: location?.barangay ?? loan.client.permanentBarangay ?? "",
    teamLeader: loan.branch.branchTeamLeader?.name ?? null
  });
  });

  return {
    rows,
    matching,
    page: safePage,
    pageSize: paginate ? NEW_LOANS_PAGE_SIZE : Math.max(rows.length, 1),
    totalPages: paginate ? totalPages : 1,
    truncated: paginate && matching > rows.length,
    totals: {
      count: matching,
      principalAmount: Number(aggregate._sum.principalAmount ?? 0),
      balance: Number(aggregate._sum.balance ?? 0)
    }
  };
}

// The officers a new loan can be handed to: the people holding the Loan Officer or Remedial
// Officer privilege.
export async function assignableOfficers() {
  const officers = await prisma.user.findMany({
    where: {
      isActive: true,
      privilegeTemplate: { is: { name: { in: ["Loan Officer", "Remedial Officer"] } } }
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      allBranches: true,
      privilegeTemplate: { select: { name: true } },
      branchAccess: { select: { branchId: true } },
      areaTeamLeader: { select: { id: true, name: true } },
      area: { select: { areaTeamLeader: { select: { id: true, name: true } } } },
      branchTeamLeader: { select: { id: true, name: true } }
    }
  });

  return officers.map((officer) => ({
    id: officer.id,
    name: officer.name,
    privilege: officer.privilegeTemplate?.name ?? "",
    allBranches: officer.allBranches,
    branchIds: officer.branchAccess.map((access) => access.branchId),
    teamLeaderId: officer.areaTeamLeader?.id ?? officer.area?.areaTeamLeader?.id ?? officer.branchTeamLeader?.id ?? null,
    teamLeaderName: officer.areaTeamLeader?.name ?? officer.area?.areaTeamLeader?.name ?? officer.branchTeamLeader?.name ?? null,
    teamLeaderType: officer.areaTeamLeader || officer.area?.areaTeamLeader ? "Area TL" : officer.branchTeamLeader ? "Branch TL" : null
  }));
}
