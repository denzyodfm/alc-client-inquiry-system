import type { Prisma } from "@prisma/client";
import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";

export type InquiryPayload = {
  q?: string;
  fullName?: string;
  address?: string;
  birthdate?: string;
  contactNumber?: string;
  clientId?: string;
  validIdNumber?: string;
  branchId?: string;
  product?: string;
  status?: string;
  branchAo?: string;
  addressArea?: string;
  addressDetail?: string;
  customer?: string;
};

function searchTerms(value: string) {
  return value
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);
}

function fullNameWordSearch(value: string): Prisma.ClientWhereInput {
  const terms = searchTerms(value);
  return terms.length
    ? { AND: terms.map((term) => ({ fullName: { contains: term } })) }
    : { fullName: { contains: value.trim() } };
}

function clientWordSearch(value: string): Prisma.ClientWhereInput {
  const terms = searchTerms(value);
  return terms.length
    ? {
        AND: terms.map((term) => ({
          OR: [
            { fullName: { contains: term } },
            { address: { contains: term } },
            { contactNumber: { contains: term } },
            { clientId: { contains: term } },
            { validIdNumber: { contains: term } },
            { loans: { some: { loanNumber: { contains: term } } } },
            { loans: { some: { remoteId: { contains: term } } } }
          ]
        }))
      }
    : { fullName: { contains: value.trim() } };
}

export async function searchClientInquiry(payload: InquiryPayload, options?: { excludeAlcHo?: boolean }) {
  const visibleLoanFilter = visibleSyncedLoanWhere();
  const or = [];
  const customer = payload.customer?.trim();
  if (customer) or.push(clientWordSearch(customer));
  if (payload.q?.trim()) {
    const query = payload.q.trim();
    or.push(clientWordSearch(query));
  }
  if (payload.fullName?.trim()) {
    or.push(fullNameWordSearch(payload.fullName));
  }
  if (payload.address?.trim()) {
    const terms = searchTerms(payload.address);
    or.push({ AND: terms.map((term) => ({ address: { contains: term } })) });
  }
  if (payload.birthdate?.trim()) {
    or.push({ birthdate: new Date(`${payload.birthdate}T00:00:00.000Z`) });
  }
  if (payload.contactNumber?.trim()) {
    or.push({ contactNumber: { contains: payload.contactNumber.trim() } });
  }
  if (payload.clientId?.trim()) {
    or.push({ clientId: { contains: payload.clientId.trim() } });
  }
  if (payload.validIdNumber?.trim()) {
    or.push({ validIdNumber: { contains: payload.validIdNumber.trim() } });
  }

  const branchId = Number(payload.branchId);
  const product = payload.product?.trim();
  const status = Number(payload.status);
  const branchAo = payload.branchAo?.trim();
  const addressTerms = searchTerms([payload.addressArea, payload.addressDetail].filter(Boolean).join(" "));
  const hasLoanFilter = (product && product !== "ALL") || (payload.status && payload.status !== "ALL") || (branchAo && branchAo !== "ALL");

  if (!or.length && !addressTerms.length && !(Number.isInteger(branchId) && branchId > 0) && !hasLoanFilter) {
    return {
      status: "EMPTY_QUERY" as const,
      message: "Enter at least one search field.",
      clients: []
    };
  }

  const selectedLoanFilter: Prisma.LoanWhereInput = { ...visibleLoanFilter, ...(product && product !== "ALL" ? { loanProduct: product } : {}), ...(payload.status && payload.status !== "ALL" && Number.isInteger(status) ? { sourceStatusCode: status } : {}), ...(branchAo && branchAo !== "ALL" ? { branchAo } : {}) };
  const clients = await prisma.client.findMany({
    where: {
      ...(or.length ? { OR: or } : {}),
      ...(addressTerms.length ? { AND: addressTerms.map((term) => ({ address: { contains: term } })) } : {}),
      ...(Number.isInteger(branchId) && branchId > 0 ? { branchId } : {}),
      ...(options?.excludeAlcHo ? { NOT: { branch: { branchName: { contains: "ALC HO" } } } } : {}),
      loans: { some: selectedLoanFilter }
    },
    include: {
      branch: true,
      loans: {
        where: selectedLoanFilter,
        orderBy: [{ releasedAt: "desc" }, { balance: "desc" }],
        include: {
          amortizationSchedules: {
            orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
          }
        }
      }
    },
    take: 25,
    orderBy: { updatedAt: "desc" }
  });

  if (!clients.length) {
    return {
      status: "NO_RECORD" as const,
      message: "No existing client record found.",
      clients: []
    };
  }

  const activeLoan = clients.flatMap((client) =>
    client.loans
      .filter((loan) => Number(loan.balance) > 0 && loan.sourceStatusCode !== 10)
      .map((loan) => ({ client, loan }))
  )[0];

  if (activeLoan) {
    return {
      status: "ACTIVE_BALANCE" as const,
      message: `Client has existing loan balance at ${activeLoan.client.branch.branchName}. Please verify before approval.`,
      clients
    };
  }

  return {
    status: "FULLY_PAID" as const,
    message: "Client has previous loan record but fully paid.",
    clients
  };
}
