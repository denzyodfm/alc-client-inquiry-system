type ScheduleLike = {
  amortDate: Date | string | null;
  totalAmort: unknown;
  paidPrincipal: unknown;
  paidInterest: unknown;
  paidStatus?: number | boolean | null;
};

type LoanLike = {
  maturityAt?: Date | string | null;
  balance: unknown;
  principalAmount?: unknown;
  interestAmount?: unknown;
  penaltyAmount?: unknown;
  amortizationSchedules: ScheduleLike[];
};

export function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function schedulePaidTotal(schedule: ScheduleLike) {
  return numberValue(schedule.paidPrincipal) + numberValue(schedule.paidInterest);
}

export function scheduleBalance(schedule: ScheduleLike) {
  return Math.max(0, numberValue(schedule.totalAmort) - schedulePaidTotal(schedule));
}

export function scheduleIsPaid(schedule: ScheduleLike) {
  const paid = schedulePaidTotal(schedule);
  const due = numberValue(schedule.totalAmort);
  return (paid > 0 && paid >= due) || Boolean(schedule.paidStatus);
}

export function amountDueAsOfToday(loan: LoanLike, today = new Date()) {
  const dueBySchedule = loan.amortizationSchedules.reduce((sum, schedule) => {
    if (!schedule.amortDate || new Date(schedule.amortDate) > today) return sum;
    return sum + scheduleBalance(schedule);
  }, 0);

  if (loan.amortizationSchedules.length) return Math.min(Math.max(0, numberValue(loan.balance)), dueBySchedule);

  const maturityAt = loan.maturityAt ? new Date(loan.maturityAt) : null;
  if (maturityAt && maturityAt <= today) return Math.max(0, numberValue(loan.balance));
  return 0;
}

export function loanContractAmount(loan: LoanLike) {
  const scheduleDue = loan.amortizationSchedules.reduce((sum, schedule) => sum + numberValue(schedule.totalAmort), 0);
  return scheduleDue || numberValue(loan.principalAmount) + numberValue(loan.interestAmount) + numberValue(loan.penaltyAmount);
}

export function loanPaidTotal(loan: LoanLike) {
  const schedulePaid = loan.amortizationSchedules.reduce((sum, schedule) => sum + schedulePaidTotal(schedule), 0);
  return schedulePaid;
}
