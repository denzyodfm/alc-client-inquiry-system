import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api";
import { numberValue } from "@/lib/loan-amounts";
import { prisma } from "@/lib/prisma";

function decimalAmount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
}

function textValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function paymentDate(value: unknown) {
  const text = String(value ?? "").trim();
  const parsed = text ? new Date(`${text}T00:00:00`) : new Date();
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type AutomaticLoan = {
  principalAmount: unknown;
  interestAmount: unknown;
  balance: unknown;
  maturityAt: Date | null;
  sourceStatusCode: number | null;
  sourceStatusName: string | null;
  amortizationSchedules: {
    amortDate: Date | null;
    principalAmort: unknown;
    interestAmort: unknown;
    paidPrincipal: unknown;
    paidInterest: unknown;
  }[];
};

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fullBalanceBreakdown(loan: Pick<AutomaticLoan, "principalAmount" | "interestAmount" | "balance">) {
  const totalBalance = numberValue(loan.balance);
  const principalAmount = Math.min(totalBalance, numberValue(loan.principalAmount));
  const interestAmount = Math.max(0, Math.min(totalBalance - principalAmount, numberValue(loan.interestAmount)));
  const penaltyAmount = Math.max(0, totalBalance - principalAmount - interestAmount);

  return { principalAmount, interestAmount, penaltyAmount, totalAmount: totalBalance };
}

function unpaidScheduleAmounts(schedule: AutomaticLoan["amortizationSchedules"][number]) {
  const principalDue = Math.max(0, numberValue(schedule.principalAmort) - numberValue(schedule.paidPrincipal));
  const interestDue = Math.max(0, numberValue(schedule.interestAmort) - numberValue(schedule.paidInterest));
  return { principalDue, interestDue, totalDue: principalDue + interestDue };
}

function automaticBreakdown(loan: AutomaticLoan) {
  const today = startOfDay();
  const fullBalance = fullBalanceBreakdown(loan);
  const statusName = String(loan.sourceStatusName ?? "").toLowerCase();
  const maturityAt = loan.maturityAt ? startOfDay(loan.maturityAt) : null;
  const hasPastDueStatus = statusName.includes("past") || loan.sourceStatusCode === 2;
  const hasOverdueSchedule = loan.amortizationSchedules.some((schedule) => {
    if (!schedule.amortDate || startOfDay(schedule.amortDate) >= today) return false;
    return unpaidScheduleAmounts(schedule).totalDue > 0;
  });
  const isPastDue = hasPastDueStatus || hasOverdueSchedule || Boolean(maturityAt && maturityAt < today && fullBalance.totalAmount > 0);

  if (isPastDue) {
    return {
      ...fullBalance,
      pdiAmount: 0,
      otherChargesAmount: 0
    };
  }

  const dueSchedules = loan.amortizationSchedules.filter((schedule) => schedule.amortDate && startOfDay(schedule.amortDate) <= today);
  const rawPrincipalDue = dueSchedules.reduce((sum, schedule) => sum + unpaidScheduleAmounts(schedule).principalDue, 0);
  const rawInterestDue = dueSchedules.reduce((sum, schedule) => sum + unpaidScheduleAmounts(schedule).interestDue, 0);
  const principalAmount = Math.min(rawPrincipalDue, fullBalance.totalAmount);
  const interestAmount = Math.min(rawInterestDue, Math.max(0, fullBalance.totalAmount - principalAmount));

  return {
    principalAmount,
    interestAmount,
    penaltyAmount: 0,
    pdiAmount: 0,
    otherChargesAmount: 0,
    totalAmount: principalAmount + interestAmount
  };
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser(["ADMIN", "HO_CASHIER"]);
  if (response) return response;

  const body = await request.json();
  const loanId = Number(body.loanId);
  const mode = String(body.mode ?? "").toUpperCase() === "MANUAL" ? "MANUAL" : "AUTOMATIC";
  const parsedPaymentDate = paymentDate(body.paymentDate);

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return NextResponse.json({ error: "Select a valid HO loan before posting payment." }, { status: 400 });
  }
  if (!parsedPaymentDate) {
    return NextResponse.json({ error: "Enter a valid payment date." }, { status: 400 });
  }

  const loan = await prisma.loan.findFirst({
    where: {
      id: loanId,
      branch: {
        OR: [
          { branchCode: "001" },
          { branchName: { contains: "ALC HO" } },
          { branchName: { contains: "HO" } }
        ]
      }
    },
    select: {
      id: true,
      branchId: true,
      clientId: true,
      principalAmount: true,
      interestAmount: true,
      balance: true,
      maturityAt: true,
      sourceStatusCode: true,
      sourceStatusName: true,
      amortizationSchedules: {
        select: {
          amortDate: true,
          principalAmort: true,
          interestAmort: true,
          paidPrincipal: true,
          paidInterest: true
        },
        orderBy: [{ amortDate: "asc" }, { amortNo: "asc" }]
      }
    }
  });

  if (!loan) {
    return NextResponse.json({ error: "Payment posting is allowed for ALC HO loans only." }, { status: 404 });
  }

  const amounts =
    mode === "AUTOMATIC"
      ? automaticBreakdown(loan)
      : {
          principalAmount: decimalAmount(body.principalAmount),
          interestAmount: decimalAmount(body.interestAmount),
          penaltyAmount: decimalAmount(body.penaltyAmount),
          pdiAmount: decimalAmount(body.pdiAmount),
          otherChargesAmount: decimalAmount(body.otherChargesAmount),
          totalAmount:
            decimalAmount(body.principalAmount) +
            decimalAmount(body.interestAmount) +
            decimalAmount(body.penaltyAmount) +
            decimalAmount(body.pdiAmount) +
            decimalAmount(body.otherChargesAmount)
        };

  if (amounts.totalAmount <= 0) {
    return NextResponse.json({ error: "Total amount paid must be greater than zero." }, { status: 400 });
  }

  try {
    const posting = await prisma.localPaymentPosting.create({
      data: {
        branchId: loan.branchId,
        clientId: loan.clientId,
        loanId: loan.id,
        postedById: user!.id,
        mode,
        prNumber: textValue(body.prNumber),
        orNumber: textValue(body.orNumber),
        paymentType: String(body.paymentType ?? "0-Cash").trim() || "0-Cash",
        chequeNo: textValue(body.chequeNo),
        glCode: textValue(body.glCode),
        memoType: textValue(body.memoType),
        paymentDate: parsedPaymentDate,
        principalAmount: new Prisma.Decimal(amounts.principalAmount),
        interestAmount: new Prisma.Decimal(amounts.interestAmount),
        penaltyAmount: new Prisma.Decimal(amounts.penaltyAmount),
        pdiAmount: new Prisma.Decimal(amounts.pdiAmount),
        otherChargesAmount: new Prisma.Decimal(amounts.otherChargesAmount),
        totalAmount: new Prisma.Decimal(amounts.totalAmount),
        accountOfficerChanged: Boolean(body.accountOfficerChanged)
      },
      select: { id: true, totalAmount: true }
    });

    return NextResponse.json({
      id: posting.id,
      totalAmount: posting.totalAmount.toString(),
      message: "Payment posted locally. No branch database write-back was performed."
    });
  } catch {
    return NextResponse.json({ error: "Unable to save local payment posting." }, { status: 500 });
  }
}
