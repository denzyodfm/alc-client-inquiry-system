import type { Prisma } from "@prisma/client";
import { inactiveStatus12Where } from "@/lib/loan-filters";

export type AccountTaggingFilters = {
  branchId?: string;
  product?: string;
  address?: string;
  customerName?: string;
};

export function accountTaggingTerms(value?: string) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function accountTaggingSearchWhere(filters: AccountTaggingFilters): Prisma.LoanWhereInput {
  const addressTerms = accountTaggingTerms(filters.address);
  const customerTerms = accountTaggingTerms(filters.customerName);
  const branchId = filters.branchId === "ALL" ? "" : String(filters.branchId ?? "").trim();
  const product = filters.product === "ALL" ? "" : String(filters.product ?? "").trim();

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
      ...addressTerms.map((term) => ({ client: { address: { contains: term } } })),
      ...customerTerms.map((term) => ({ client: { fullName: { contains: term } } }))
    ]
  };
}

export function accountTaggingHref({
  page,
  branchId,
  product,
  address,
  customerName
}: AccountTaggingFilters & { page?: number }) {
  const params = new URLSearchParams();
  if (branchId && branchId !== "ALL") params.set("branchId", branchId);
  if (product && product !== "ALL") params.set("product", product);
  if (address?.trim()) params.set("address", address.trim());
  if (customerName?.trim()) params.set("customer", customerName.trim());
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/account-tagging?${query}` : "/account-tagging";
}
