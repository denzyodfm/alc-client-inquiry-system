import type { Prisma } from "@prisma/client";
import { PaymentPostingWorkspace, type PaymentPostingLoanRow } from "@/components/payment-posting-workspace";
import type { LoanDetailLoan } from "@/components/loan-detail-window";
import { requireUser } from "@/lib/auth";
import { numberValue } from "@/lib/loan-amounts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PostingLoan = Prisma.LoanGetPayload<{
  include: {
    client: true;
    branch: true;
    payments: true;
    amortizationSchedules: true;
  };
}>;

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fullBalanceBreakdown(loan: PostingLoan) {
  const totalBalance = numberValue(loan.balance);
  const principalBalance = Math.min(totalBalance, numberValue(loan.principalAmount));
  const interestBalance = Math.max(0, Math.min(totalBalance - principalBalance, numberValue(loan.interestAmount)));
  const penaltyBalance = Math.max(0, totalBalance - principalBalance - interestBalance);

  return { principalBalance, interestBalance, penaltyBalance, totalBalance };
}

function unpaidScheduleAmounts(schedule: PostingLoan["amortizationSchedules"][number]) {
  const principalDue = Math.max(0, numberValue(schedule.principalAmort) - numberValue(schedule.paidPrincipal));
  const interestDue = Math.max(0, numberValue(schedule.interestAmort) - numberValue(schedule.paidInterest));
  return { principalDue, interestDue, totalDue: principalDue + interestDue };
}

function automaticDueBreakdown(loan: PostingLoan) {
  const today = startOfDay();
  const fullBalance = fullBalanceBreakdown(loan);
  const statusName = String(loan.sourceStatusName ?? "").toLowerCase();
  const maturityAt = loan.maturityAt ? startOfDay(loan.maturityAt) : null;
  const hasPastDueStatus = statusName.includes("past") || loan.sourceStatusCode === 2;
  const hasOverdueSchedule = loan.amortizationSchedules.some((schedule) => {
    if (!schedule.amortDate || startOfDay(schedule.amortDate) >= today) return false;
    return unpaidScheduleAmounts(schedule).totalDue > 0;
  });
  const isPastDue = hasPastDueStatus || hasOverdueSchedule || Boolean(maturityAt && maturityAt < today && fullBalance.totalBalance > 0);

  if (isPastDue) {
    return {
      automaticPrincipalDue: fullBalance.principalBalance,
      automaticInterestDue: fullBalance.interestBalance,
      automaticPenaltyDue: fullBalance.penaltyBalance,
      automaticPdiDue: 0,
      automaticOtherChargesDue: 0,
      automaticTotalDue: fullBalance.totalBalance,
      isPastDue
    };
  }

  const dueSchedules = loan.amortizationSchedules.filter((schedule) => schedule.amortDate && startOfDay(schedule.amortDate) <= today);
  const rawPrincipalDue = dueSchedules.reduce((sum, schedule) => sum + unpaidScheduleAmounts(schedule).principalDue, 0);
  const rawInterestDue = dueSchedules.reduce((sum, schedule) => sum + unpaidScheduleAmounts(schedule).interestDue, 0);
  const automaticPrincipalDue = Math.min(rawPrincipalDue, fullBalance.totalBalance);
  const automaticInterestDue = Math.min(rawInterestDue, Math.max(0, fullBalance.totalBalance - automaticPrincipalDue));

  return {
    automaticPrincipalDue,
    automaticInterestDue,
    automaticPenaltyDue: 0,
    automaticPdiDue: 0,
    automaticOtherChargesDue: 0,
    automaticTotalDue: automaticPrincipalDue + automaticInterestDue,
    isPastDue
  };
}

function toLoanDetail(loan: PostingLoan): LoanDetailLoan {
  return {
    id: loan.id,
    remoteId: loan.remoteId,
    loanNumber: loan.loanNumber,
    loanProduct: loan.loanProduct,
    principalAmount: loan.principalAmount.toString(),
    interestRate: loan.interestRate.toString(),
    interestAmount: loan.interestAmount.toString(),
    penaltyAmount: loan.penaltyAmount.toString(),
    terms: loan.terms,
    paidAmount: loan.paidAmount.toString(),
    balance: loan.balance.toString(),
    status: loan.status,
    sourceStatusCode: loan.sourceStatusCode,
    sourceStatusName: loan.sourceStatusName,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    client: {
      fullName: loan.client.fullName,
      clientId: loan.client.clientId,
      birthdate: loan.client.birthdate?.toISOString() ?? null,
      contactNumber: loan.client.contactNumber,
      validIdNumber: loan.client.validIdNumber,
      branch: {
        branchName: loan.branch.branchName,
        branchCode: loan.branch.branchCode
      }
    },
    branch: {
      branchName: loan.branch.branchName,
      branchCode: loan.branch.branchCode
    },
    amortizationSchedules: loan.amortizationSchedules.map((schedule) => ({
      id: schedule.id,
      remoteId: schedule.remoteId,
      amortNo: schedule.amortNo,
      amortDate: schedule.amortDate?.toISOString() ?? null,
      principalBalance: schedule.principalBalance.toString(),
      interestBalance: schedule.interestBalance.toString(),
      principalAmort: schedule.principalAmort.toString(),
      interestAmort: schedule.interestAmort.toString(),
      totalAmort: schedule.totalAmort.toString(),
      paidPrincipal: schedule.paidPrincipal.toString(),
      paidInterest: schedule.paidInterest.toString(),
      paidTotal: schedule.paidTotal.toString(),
      paidStatus: schedule.paidStatus
    }))
  };
}

function searchTerms(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function clientSearchWhere(value: string): Prisma.ClientWhereInput {
  const terms = searchTerms(value);
  if (!terms.length) return {};

  return {
    AND: terms.map((term) => ({
      OR: [
        { fullName: { contains: term } },
        { clientId: { contains: term } },
        { contactNumber: { contains: term } },
        { validIdNumber: { contains: term } }
      ]
    }))
  };
}

function closedAccountWhere(): Prisma.LoanWhereInput {
  return {
    NOT: [
      { status: { in: ["PAID", "CLOSED"] } },
      { sourceStatusCode: 10 },
      { sourceStatusName: { contains: "closed" } },
      { sourceStatusName: { contains: "paid" } }
    ]
  };
}

function toPostingRow(loan: PostingLoan): PaymentPostingLoanRow {
  const latestPayment = [...loan.payments]
    .filter((payment) => payment.paidAt)
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))[0];
  const { principalBalance, interestBalance, penaltyBalance, totalBalance } = fullBalanceBreakdown(loan);
  const automaticDue = automaticDueBreakdown(loan);

  return {
    id: loan.id,
    clientId: loan.clientId,
    clientName: loan.client.fullName,
    clientNo: loan.client.clientId,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    cisNumber: loan.client.clientId ?? loan.client.remoteId,
    loanProduct: loan.loanProduct,
    sourceStatusCode: loan.sourceStatusCode,
    sourceStatusName: loan.sourceStatusName,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    principalBalance,
    interestBalance,
    penaltyBalance,
    ...automaticDue,
    paidAmount: numberValue(loan.paidAmount),
    totalBalance,
    latestPaymentAt: latestPayment?.paidAt?.toISOString() ?? null,
    loanDetail: toLoanDetail(loan)
  };
}

export default async function PaymentPostingPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; includeClosed?: string }>;
}) {
  await requireUser(["ADMIN", "HO_CASHIER"]);
  const params = await searchParams;
  const searchText = params?.q?.trim() || "";
  const includeClosed = params?.includeClosed === "1";
  const hoBranch = await prisma.branch.findFirst({
    where: {
      OR: [
        { branchCode: "001" },
        { branchName: { contains: "ALC HO" } },
        { branchName: { contains: "HO" } }
      ]
    },
    select: { id: true }
  });

  const matchedClients = searchText && hoBranch
    ? await prisma.client.findMany({
        where: {
          branchId: hoBranch.id,
          ...clientSearchWhere(searchText)
        },
        select: { id: true },
        take: 50
      })
    : [];
  const matchedClientIds = matchedClients.map((client) => client.id);
  const where: Prisma.LoanWhereInput = {
    branchId: hoBranch?.id ?? -1,
    ...(includeClosed ? {} : closedAccountWhere()),
    ...(searchText
      ? {
          OR: [
            matchedClientIds.length ? { clientId: { in: matchedClientIds } } : { clientId: -1 },
            { loanNumber: { contains: searchText } },
            { remoteId: { contains: searchText } }
          ]
        }
      : { id: -1 })
  };

  const loans = await prisma.loan.findMany({
    where,
    orderBy: [{ client: { fullName: "asc" } }, { releasedAt: "desc" }, { updatedAt: "desc" }],
    take: 200,
    include: {
      client: true,
      branch: true,
      payments: {
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        take: 5
      },
      amortizationSchedules: {
        orderBy: [{ amortDate: "asc" }, { amortNo: "asc" }]
      }
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">HO cashier workspace</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Payment Posting</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Search and prepare payment posting for ALC HO loans only.
        </p>
      </div>

      <PaymentPostingWorkspace loans={loans.map(toPostingRow)} searchText={searchText} includeClosed={includeClosed} />
    </div>
  );
}
