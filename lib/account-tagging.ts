import type { Prisma } from "@prisma/client";
import { inactiveStatus12Where } from "@/lib/loan-filters";

export type AccountTaggingFilters = {
  branchId?: string;
  product?: string;
  address?: string;
  address2?: string;
  customerName?: string;
  loanStatus?: string;
  resultSearch?: string;
  excludeCustomerConditions?: boolean;
};

export function accountTaggingTerms(value?: string) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedSearchPhrase(value?: string) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function addressDetailWhere(value?: string): Prisma.LoanWhereInput[] {
  const detail = normalizedSearchPhrase(value);
  if (!detail) return [];

  const barangay = detail.match(/^(?:barangay|brgy)\.?\s*0*(\d+)\s*$/i);
  if (!barangay) {
    return [{ client: { address: { contains: detail } } }];
  }

  const barangayNumber = String(Number(barangay[1]));
  const prefixes = ["barangay", "Barangay", "BARANGAY", "brgy", "Brgy", "BRGY", "brgy.", "Brgy.", "BRGY."];
  const suffixes = [" ", ",", ".", "-", "/", ")"];
  const variants = Array.from(
    new Set(prefixes.flatMap((prefix) => suffixes.map((suffix) => `${prefix} ${barangayNumber}${suffix}`)))
  );

  return [
    {
      OR: variants.map((term) => ({
        client: { address: { contains: term } }
      }))
    }
  ];
}

export function accountTaggingSearchWhere(filters: AccountTaggingFilters): Prisma.LoanWhereInput {
  const addressTerms = accountTaggingTerms(filters.address);
  const address2Where = addressDetailWhere(filters.address2);
  const customerTerms = accountTaggingTerms(filters.customerName);
  const resultTerms = accountTaggingTerms(filters.resultSearch);
  const branchId = filters.branchId === "ALL" ? "" : String(filters.branchId ?? "").trim();
  const product = filters.product === "ALL" ? "" : String(filters.product ?? "").trim();
  const loanStatus = filters.loanStatus === "ALL" ? "" : String(filters.loanStatus ?? "").trim();

  return {
    AND: [
      inactiveStatus12Where(),
      {
        loanNumber: { not: null },
        sourceStatusCode: { not: null },
        sourceStatusName: { not: null },
        balance: { gt: 0 },
        NOT: [
          { loanNumber: "" },
          { sourceStatusName: { contains: "not yet open" } }
        ]
      },
      branchId ? { branchId: Number(branchId) || -1 } : {},
      product ? { loanProduct: product } : {},
      loanStatus ? { sourceStatusName: loanStatus } : {},
      filters.excludeCustomerConditions
        ? {
            OR: [
              { remedialAssignment: { is: null } },
              { remedialAssignment: { is: { clientCondition: null } } },
              { remedialAssignment: { is: { clientCondition: "" } } },
              { remedialAssignment: { is: { clientCondition: { notIn: ["UNLOCATED", "DORMANT", "RIP"] } } } }
            ]
          }
        : {},
      ...addressTerms.map((term) => ({ client: { address: { contains: term } } })),
      ...address2Where,
      ...customerTerms.map((term) => ({ client: { fullName: { contains: term } } })),
      ...resultTerms.map((term) => ({
        OR: [
          { loanNumber: { contains: term } },
          { remoteId: { contains: term } },
          { loanProduct: { contains: term } },
          { branchAo: { contains: term } },
          { sourceStatusName: { contains: term } },
          { client: { fullName: { contains: term } } },
          { client: { clientId: { contains: term } } },
          { client: { contactNumber: { contains: term } } },
          { client: { address: { contains: term } } },
          { branch: { branchName: { contains: term } } },
          { branch: { branchCode: { contains: term } } },
          { remedialAssignment: { is: { zone: { contains: term } } } },
          { remedialAssignment: { is: { division: { contains: term } } } },
          { remedialAssignment: { is: { province: { contains: term } } } },
          { remedialAssignment: { is: { municipality: { contains: term } } } },
          { remedialAssignment: { is: { barangay: { contains: term } } } },
          { remedialAssignment: { is: { clientCondition: { contains: term } } } },
          { remedialAssignment: { is: { conditionApprovalStatus: { contains: term } } } },
          { remedialAssignment: { is: { assignedTo: { name: { contains: term } } } } },
          { remedialAssignment: { is: { assignedTo: { email: { contains: term } } } } }
          ,{ remedialAssignment: { is: { areaTeamLeader: { name: { contains: term } } } } }
          ,{ remedialAssignment: { is: { areaTeamLeader: { email: { contains: term } } } } }
        ]
      }))
    ]
  };
}

export function accountTaggingHref({
  page,
  branchId,
  product,
  address,
  address2,
  customerName,
  loanStatus,
  resultSearch
}: AccountTaggingFilters & { page?: number }) {
  const params = new URLSearchParams();
  if (branchId && branchId !== "ALL") params.set("branchId", branchId);
  if (product && product !== "ALL") params.set("product", product);
  if (address?.trim()) params.set("address", address.trim());
  if (address2?.trim()) params.set("address2", address2.trim());
  if (customerName?.trim()) params.set("customer", customerName.trim());
  if (loanStatus?.trim() && loanStatus !== "ALL") params.set("status", loanStatus.trim());
  if (resultSearch?.trim()) params.set("resultSearch", resultSearch.trim());
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/account-tagging?${query}` : "/account-tagging";
}
