import type { LoanDetailLoan } from "@/components/loan-detail-window";

type ScheduleSource = {
  id: number;
  remoteId: string;
  amortNo: number;
  amortDate: Date | string | null;
  principalBalance: unknown;
  interestBalance: unknown;
  principalAmort: unknown;
  interestAmort: unknown;
  totalAmort: unknown;
  paidPrincipal: unknown;
  paidInterest: unknown;
  paidStatus: number | null;
};

type PaymentSource = {
  id: number;
  orNumber: string | null;
  amortNo: number | null;
  paidAt: Date | string | null;
  paidPrincipal: unknown;
  paidInterest: unknown;
  paidPenalty: unknown;
  paidPdi: unknown;
  paidOtherCharges: unknown;
  paidCa: unknown;
};

export type LoanDetailSource = {
  id: number;
  remoteId: string;
  loanNumber: string | null;
  loanProduct: string | null;
  loanType2Name?: string | null;
  principalAmount: unknown;
  interestRate: unknown;
  interestAmount: unknown;
  penaltyAmount: unknown;
  terms: string | null;
  paidAmount: unknown;
  balance: unknown;
  remoteBalance?: unknown;
  status: string;
  sourceStatusCode: number | null;
  sourceStatusName: string | null;
  releasedAt: Date | string | null;
  maturityAt: Date | string | null;
  client: {
    fullName: string;
    clientId: string | null;
    birthdate?: Date | string | null;
    contactNumber?: string | null;
    validIdNumber?: string | null;
    branch?: { branchName: string; branchCode: string } | null;
  };
  branch?: { branchName: string; branchCode: string } | null;
  amortizationSchedules: ScheduleSource[];
  payments?: PaymentSource[];
};

function str(value: unknown) {
  return String(value ?? 0);
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function toLoanDetail(loan: LoanDetailSource): LoanDetailLoan {
  return {
    id: loan.id,
    remoteId: loan.remoteId,
    loanNumber: loan.loanNumber,
    loanProduct: loan.loanProduct,
    loanType2Name: loan.loanType2Name ?? null,
    principalAmount: str(loan.principalAmount),
    interestRate: str(loan.interestRate),
    interestAmount: str(loan.interestAmount),
    penaltyAmount: str(loan.penaltyAmount),
    terms: loan.terms,
    paidAmount: str(loan.paidAmount),
    balance: str(loan.balance),
    remoteBalance: loan.remoteBalance === null || loan.remoteBalance === undefined ? null : str(loan.remoteBalance),
    status: loan.status,
    sourceStatusCode: loan.sourceStatusCode,
    sourceStatusName: loan.sourceStatusName,
    releasedAt: isoDate(loan.releasedAt),
    maturityAt: isoDate(loan.maturityAt),
    client: {
      fullName: loan.client.fullName,
      clientId: loan.client.clientId,
      birthdate: isoDate(loan.client.birthdate),
      contactNumber: loan.client.contactNumber,
      validIdNumber: loan.client.validIdNumber,
      branch: loan.client.branch ?? undefined
    },
    branch: loan.branch ?? undefined,
    amortizationSchedules: loan.amortizationSchedules.map((schedule) => ({
      id: schedule.id,
      remoteId: schedule.remoteId,
      amortNo: schedule.amortNo,
      amortDate: isoDate(schedule.amortDate),
      principalBalance: str(schedule.principalBalance),
      interestBalance: str(schedule.interestBalance),
      principalAmort: str(schedule.principalAmort),
      interestAmort: str(schedule.interestAmort),
      totalAmort: str(schedule.totalAmort),
      paidPrincipal: str(schedule.paidPrincipal),
      paidInterest: str(schedule.paidInterest),
      paidTotal: (Number(schedule.paidPrincipal ?? 0) + Number(schedule.paidInterest ?? 0)).toString(),
      paidStatus: schedule.paidStatus
    })),
    payments: loan.payments?.map((payment) => ({
      id: payment.id,
      orNumber: payment.orNumber,
      amortNo: payment.amortNo,
      paidAt: isoDate(payment.paidAt),
      paidPrincipal: str(payment.paidPrincipal),
      paidInterest: str(payment.paidInterest),
      paidPenalty: str(payment.paidPenalty),
      paidPdi: str(payment.paidPdi),
      paidOtherCharges: str(payment.paidOtherCharges),
      paidCa: str(payment.paidCa)
    }))
  };
}
