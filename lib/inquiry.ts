import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type InquiryPayload = {
  q?: string;
  fullName?: string;
  birthdate?: string;
  contactNumber?: string;
  clientId?: string;
  validIdNumber?: string;
};

export async function searchClientInquiry(payload: InquiryPayload) {
  const visibleLoanFilter: Prisma.LoanWhereInput = {
    balance: { gt: 0 },
    loanNumber: { not: null },
    sourceStatusCode: { not: null },
    sourceStatusName: { not: null },
    NOT: [
      { loanNumber: "" },
      { sourceStatusName: "ACTIVE" },
      {
        AND: [
          { sourceStatusName: null },
          { status: "ACTIVE" }
        ]
      }
    ]
  };
  const or = [];
  if (payload.q?.trim()) {
    const query = payload.q.trim();
    or.push(
      { fullName: { contains: query } },
      { clientId: { contains: query } },
      { loans: { some: { loanNumber: { contains: query } } } },
      { loans: { some: { remoteId: { contains: query } } } }
    );
  }
  if (payload.fullName?.trim()) {
    or.push({ fullName: { contains: payload.fullName.trim() } });
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

  if (!or.length) {
    return {
      status: "EMPTY_QUERY" as const,
      message: "Enter at least one search field.",
      clients: []
    };
  }

  const clients = await prisma.client.findMany({
    where: {
      OR: or,
      loans: { some: visibleLoanFilter }
    },
    include: {
      branch: true,
      loans: {
        where: visibleLoanFilter,
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
