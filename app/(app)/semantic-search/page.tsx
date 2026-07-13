import type { Prisma } from "@prisma/client";
import { BrainCircuit } from "lucide-react";
import { SemanticSearchWorkspace, type SemanticClientResult, type SemanticLoanRow } from "@/components/semantic-search-workspace";
import type { LoanDetailLoan } from "@/components/loan-detail-window";
import { requireUser } from "@/lib/auth";
import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { amountDueAsOfToday, numberValue, scheduleIsPaid, schedulePaidTotal } from "@/lib/loan-amounts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SemanticLoan = Prisma.LoanGetPayload<{
  include: {
    branch: true;
    client: true;
    amortizationSchedules: true;
  };
}>;

const roles = ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] as const;

function searchTerms(value: string) {
  return value
    .trim()
    .split(/[,\s]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function visibleLoanWhere(): Prisma.LoanWhereInput {
  return visibleSyncedLoanWhere();
}

function semanticSearchWhere(query: string): Prisma.LoanWhereInput {
  const terms = searchTerms(query);
  if (!terms.length) return { id: -1 };

  return {
    AND: terms.map((term) => ({
      OR: [
        { loanNumber: { contains: term } },
        { remoteId: { contains: term } },
        { sourceStatusName: { contains: term } },
        { client: { fullName: { contains: term } } },
        { client: { clientId: { contains: term } } },
        { client: { contactNumber: { contains: term } } },
        { client: { validIdNumber: { contains: term } } },
        { client: { address: { contains: term } } },
        { branch: { branchName: { contains: term } } },
        { branch: { branchCode: { contains: term } } }
      ]
    }))
  };
}

function daysBetween(start: Date, end: Date) {
  const startDay = new Date(start);
  const endDay = new Date(end);
  startDay.setHours(0, 0, 0, 0);
  endDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)));
}

function daysPastDue(loan: SemanticLoan) {
  const today = new Date();
  const overdueSchedule = loan.amortizationSchedules
    .filter((schedule) => schedule.amortDate && schedule.amortDate <= today && !scheduleIsPaid(schedule))
    .sort((a, b) => (a.amortDate?.getTime() ?? 0) - (b.amortDate?.getTime() ?? 0))[0];
  const pastDueDate = overdueSchedule?.amortDate ?? (loan.maturityAt && loan.maturityAt < today ? loan.maturityAt : null);
  return pastDueDate ? daysBetween(pastDueDate, today) : 0;
}

function toLoanDetail(loan: SemanticLoan): LoanDetailLoan {
  return {
    id: loan.id,
    remoteId: loan.remoteId,
    loanNumber: loan.loanNumber,
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
      paidTotal: schedulePaidTotal(schedule).toString(),
      paidStatus: schedule.paidStatus
    }))
  };
}

function toLoanRow(loan: SemanticLoan): SemanticLoanRow {
  return {
    id: loan.id,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    status: loan.status,
    sourceStatusCode: loan.sourceStatusCode,
    sourceStatusName: loan.sourceStatusName,
    dueToday: amountDueAsOfToday(loan),
    paid: loan.amortizationSchedules.reduce((sum, schedule) => sum + schedulePaidTotal(schedule), 0) || numberValue(loan.paidAmount),
    balance: numberValue(loan.balance),
    daysPastDue: daysPastDue(loan),
    loan: toLoanDetail(loan)
  };
}

function textIncludes(value: unknown, term: string) {
  return String(value ?? "").toLowerCase().includes(term.toLowerCase());
}

function scoreClient(loans: SemanticLoan[], query: string) {
  const terms = searchTerms(query);
  const first = loans[0];
  const reasons = new Set<string>();
  let score = 15;

  for (const term of terms) {
    if (textIncludes(first.client.fullName, term)) {
      score += 18;
      reasons.add("name match");
    }
    if (textIncludes(first.client.address, term)) {
      score += 14;
      reasons.add("address match");
    }
    if (textIncludes(first.client.clientId, term) || textIncludes(first.client.contactNumber, term) || textIncludes(first.client.validIdNumber, term)) {
      score += 12;
      reasons.add("client profile match");
    }
    if (textIncludes(first.branch.branchName, term) || textIncludes(first.branch.branchCode, term)) {
      score += 10;
      reasons.add("branch match");
    }
    if (loans.some((loan) => textIncludes(loan.loanNumber, term) || textIncludes(loan.remoteId, term))) {
      score += 18;
      reasons.add("loan number match");
    }
    if (loans.some((loan) => textIncludes(loan.sourceStatusName, term) || textIncludes(loan.status, term))) {
      score += 10;
      reasons.add("loan status match");
    }
  }

  return {
    score: Math.min(99, score),
    matchReasons: Array.from(reasons).length ? Array.from(reasons) : ["related loan/client signal"]
  };
}

function recommendation(loans: SemanticLoanRow[]): SemanticClientResult["recommendation"] {
  const pastDueLoans = loans.filter((loan) => loan.dueToday > 0 || loan.daysPastDue > 0);
  const balance = loans.reduce((sum, loan) => sum + loan.balance, 0);
  const closed = loans.filter((loan) => loan.sourceStatusCode === 10 || loan.sourceStatusName?.toLowerCase().includes("closed")).length;

  if (pastDueLoans.length) {
    return {
      label: "Review Before Action",
      tone: "red",
      text: "Past-due exposure was found. Review payment behavior, aging, contactability, and latest negotiation before approval or release decisions."
    };
  }
  if (balance > 0) {
    return {
      label: "Active Exposure",
      tone: "amber",
      text: "Client has visible outstanding exposure. Validate capacity, collateral, co-maker quality, and current payment schedule."
    };
  }
  if (closed === loans.length && loans.length) {
    return {
      label: "Good Historical Signal",
      tone: "green",
      text: "Matched loans appear closed or paid. Still verify recent records, branch notes, and any client logs before final decision."
    };
  }
  return {
    label: "Needs Verification",
    tone: "blue",
    text: "Search found a client profile, but lending decision needs supporting documents, loan history, and branch verification."
  };
}

function groupChart(results: SemanticClientResult[], key: "branch" | "status") {
  const map = new Map<string, { label: string; count: number; dueToday: number; balance: number }>();

  for (const result of results) {
    if (key === "branch") {
      const label = result.branch.branchName;
      const row = map.get(label) ?? { label, count: 0, dueToday: 0, balance: 0 };
      row.count += 1;
      row.dueToday += result.totalDueToday;
      row.balance += result.totalBalance;
      map.set(label, row);
    } else {
      for (const loan of result.loans) {
        const label = loan.sourceStatusName ?? loan.status;
        const row = map.get(label) ?? { label, count: 0, dueToday: 0, balance: 0 };
        row.count += 1;
        row.dueToday += loan.dueToday;
        row.balance += loan.balance;
        map.set(label, row);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.balance - a.balance).slice(0, 8);
}

function buildAnalysis(results: SemanticClientResult[], query: string) {
  if (!query) return [];
  if (!results.length) return ["No matching client profile or loan signal was found for the search phrase."];

  const totalDue = results.reduce((sum, result) => sum + result.totalDueToday, 0);
  const pastDueClients = results.filter((result) => result.pastDueLoans > 0).length;
  const highest = [...results].sort((a, b) => b.totalBalance - a.totalBalance)[0];

  return [
    `${results.length.toLocaleString("en-US")} ranked client match(es) found using profile, address, branch, status, and loan-number signals.`,
    pastDueClients
      ? `${pastDueClients.toLocaleString("en-US")} matched client(s) show past-due exposure that should be reviewed before any credit decision.`
      : "No past-due signal appears in the matched client set.",
    totalDue
      ? `Matched accounts show due as of today of ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(totalDue)}.`
      : "No amount due as of today was found in the matched loans.",
    highest ? `Largest visible exposure in this search is ${highest.fullName} with balance ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(highest.totalBalance)}.` : ""
  ].filter(Boolean);
}

export default async function SemanticSearchPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requireUser([...roles]);
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";

  const loans = query
    ? await prisma.loan.findMany({
        where: { AND: [visibleLoanWhere(), semanticSearchWhere(query)] },
        take: 300,
        orderBy: [{ balance: "desc" }, { updatedAt: "desc" }],
        include: {
          branch: true,
          client: true,
          amortizationSchedules: {
            orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
          }
        }
      })
    : [];

  const grouped = loans.reduce<Map<number, SemanticLoan[]>>((map, loan) => {
    const rows = map.get(loan.clientId) ?? [];
    rows.push(loan);
    map.set(loan.clientId, rows);
    return map;
  }, new Map());

  const results: SemanticClientResult[] = Array.from(grouped.values())
    .map((clientLoans) => {
      const first = clientLoans[0];
      const loanRows = clientLoans
        .map(toLoanRow)
        .sort((a, b) => new Date(b.releasedAt ?? 0).getTime() - new Date(a.releasedAt ?? 0).getTime());
      const ranking = scoreClient(clientLoans, query);
      const latestRelease = loanRows[0]?.releasedAt ?? null;

      return {
        id: first.client.id,
        score: ranking.score,
        matchReasons: ranking.matchReasons,
        fullName: first.client.fullName,
        clientId: first.client.clientId,
        contactNumber: first.client.contactNumber,
        address: first.client.address,
        branch: {
          branchName: first.branch.branchName,
          branchCode: first.branch.branchCode
        },
        loans: loanRows,
        totalDueToday: loanRows.reduce((sum, loan) => sum + loan.dueToday, 0),
        totalBalance: loanRows.reduce((sum, loan) => sum + loan.balance, 0),
        pastDueLoans: loanRows.filter((loan) => loan.dueToday > 0 || loan.daysPastDue > 0).length,
        currentLoans: loanRows.filter((loan) => loan.sourceStatusCode === 0 || loan.sourceStatusName?.toLowerCase().includes("current")).length,
        closedLoans: loanRows.filter((loan) => loan.sourceStatusCode === 10 || loan.sourceStatusName?.toLowerCase().includes("closed")).length,
        latestRelease,
        recommendation: recommendation(loanRows)
      };
    })
    .sort((a, b) => b.score - a.score || b.totalBalance - a.totalBalance)
    .slice(0, 60);

  const totals = {
    clients: results.length,
    loans: results.reduce((sum, result) => sum + result.loans.length, 0),
    dueToday: results.reduce((sum, result) => sum + result.totalDueToday, 0),
    balance: results.reduce((sum, result) => sum + result.totalBalance, 0),
    pastDueLoans: results.reduce((sum, result) => sum + result.pastDueLoans, 0)
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Modern discovery</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Semantic Search</h2>
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
          <BrainCircuit className="h-4 w-4 text-brand-blue" />
          Search by meaning across client identity, address, branch, loan status, loan numbers, balances, and payment behavior.
        </p>
      </div>

      <SemanticSearchWorkspace
        query={query}
        results={results}
        branchChart={groupChart(results, "branch")}
        statusChart={groupChart(results, "status")}
        totals={totals}
        analysis={buildAnalysis(results, query)}
      />
    </div>
  );
}
