export type LocationAgingLoan = {
  balance: unknown;
  maturityAt: Date | null;
  sourceStatusName: string | null;
  // Optional: a caller that already worked this out in the database passes the answer to
  // locationLoanClassification instead of carrying every schedule row here.
  amortizationSchedules?: Array<{
    amortDate: Date | null;
    totalAmort: unknown;
    principalAmort: unknown;
    interestAmort: unknown;
    paidPrincipal: unknown;
    paidInterest: unknown;
  }>;
};

export type LocationClientCategory = "current" | "delayed" | "pastDue" | "litigated";

const categoryRisk: Record<LocationClientCategory, number> = {
  current: 0,
  delayed: 1,
  pastDue: 2,
  litigated: 3
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
  return (loan.amortizationSchedules ?? []).some((schedule) => {
    if (!schedule.amortDate || databaseDateKey(schedule.amortDate) > todayKey) return false;
    const scheduledAmount = Number(schedule.totalAmort)
      || Number(schedule.principalAmort) + Number(schedule.interestAmort);
    const paidAmount = Number(schedule.paidPrincipal) + Number(schedule.paidInterest);
    return scheduledAmount - paidAmount > 0;
  });
}

export function locationLoanClassification(loan: LocationAgingLoan, todayKey: string, hasUnpaidDue?: boolean) {
  const hasOutstandingBalance = Number(loan.balance) > 0;
  if (hasOutstandingBalance && loan.maturityAt && databaseDateKey(loan.maturityAt) < todayKey) {
    return "pastDue" as const;
  }
  const unpaid = hasUnpaidDue ?? hasUnpaidDueAsOf(loan, todayKey);
  if (hasOutstandingBalance && unpaid) {
    return "delayed" as const;
  }
  return "current" as const;
}

export function locationLoanIsLitigated(loan: Pick<LocationAgingLoan, "sourceStatusName">) {
  return String(loan.sourceStatusName ?? "").trim().toLocaleLowerCase("en").includes("litig");
}

export function effectiveLocationCategory(loan: LocationAgingLoan, todayKey: string, hasUnpaidDue?: boolean): LocationClientCategory {
  return locationLoanIsLitigated(loan) ? "litigated" : locationLoanClassification(loan, todayKey, hasUnpaidDue);
}

export function higherRiskLocationCategory(
  current: LocationClientCategory | undefined,
  candidate: LocationClientCategory
) {
  return !current || categoryRisk[candidate] > categoryRisk[current] ? candidate : current;
}
