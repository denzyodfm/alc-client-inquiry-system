export type LocationAgingLoan = {
  balance: unknown;
  maturityAt: Date | null;
  sourceStatusName: string | null;
  amortizationSchedules: Array<{
    amortDate: Date | null;
    totalAmort: unknown;
    principalAmort: unknown;
    interestAmort: unknown;
    paidPrincipal: unknown;
    paidInterest: unknown;
  }>;
};

const manilaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function manilaDateKey(value = new Date()) {
  const parts = manilaDateFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function databaseDateKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function hasUnpaidDueAsOf(loan: LocationAgingLoan, todayKey: string) {
  return loan.amortizationSchedules.some((schedule) => {
    if (!schedule.amortDate || databaseDateKey(schedule.amortDate) > todayKey) return false;
    const scheduledAmount = Number(schedule.totalAmort)
      || Number(schedule.principalAmort) + Number(schedule.interestAmort);
    const paidAmount = Number(schedule.paidPrincipal) + Number(schedule.paidInterest);
    return scheduledAmount - paidAmount > 0;
  });
}

export function locationLoanClassification(loan: LocationAgingLoan, todayKey: string) {
  const hasOutstandingBalance = Number(loan.balance) > 0;
  if (hasOutstandingBalance && loan.maturityAt && databaseDateKey(loan.maturityAt) < todayKey) {
    return "pastDue" as const;
  }
  if (hasOutstandingBalance && hasUnpaidDueAsOf(loan, todayKey)) {
    return "delayed" as const;
  }
  return "current" as const;
}

export function locationLoanIsLitigated(loan: Pick<LocationAgingLoan, "sourceStatusName">) {
  return String(loan.sourceStatusName ?? "").trim().toLocaleLowerCase("en").includes("litig");
}

