import type { Prisma } from "@prisma/client";
import { inactiveStatus12Where } from "@/lib/loan-filters";

export type AccountTaggingFilters = {
  branchId?: string;
  product?: string;
  address?: string;
  address2?: string;
  customerName?: string;
  loanStatus?: string;
};

export function accountTaggingTerms(value?: string) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function accountTaggingSearchWhere(filters: AccountTaggingFilters): Prisma.LoanWhereInput {
  const addressTerms = accountTaggingTerms(filters.address);
  const address2Terms = accountTaggingTerms(filters.address2);
  const customerTerms = accountTaggingTerms(filters.customerName);
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
      ...addressTerms.map((term) => ({ client: { address: { contains: term } } })),
      ...address2Terms.map((term) => ({ client: { address: { contains: term } } })),
      ...customerTerms.map((term) => ({ client: { fullName: { contains: term } } }))
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
  loanStatus
}: AccountTaggingFilters & { page?: number }) {
  const params = new URLSearchParams();
  if (branchId && branchId !== "ALL") params.set("branchId", branchId);
  if (product && product !== "ALL") params.set("product", product);
  if (address?.trim()) params.set("address", address.trim());
  if (address2?.trim()) params.set("address2", address2.trim());
  if (customerName?.trim()) params.set("customer", customerName.trim());
  if (loanStatus?.trim() && loanStatus !== "ALL") params.set("status", loanStatus.trim());
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/account-tagging?${query}` : "/account-tagging";
}
