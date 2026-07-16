import type { Prisma } from "@prisma/client";
import { AlertTriangle, CalendarDays, ClipboardList } from "lucide-react";
import { requireUser, canApproveRemedial, canAssignRemedial, getAccessibleBranchIds } from "@/lib/auth";
import { branchScopeWhere, pastDueLoanWhere, remedialLoanSearchWhere, remedialOfficerOptions, REMEDIAL_ROLES } from "@/lib/remedial";
import { prisma } from "@/lib/prisma";
import { amountDueAsOfToday, numberValue, scheduleIsPaid, schedulePaidTotal } from "@/lib/loan-amounts";
import { money } from "@/lib/format";
import { RemedialFilter } from "@/components/remedial-filter";
import { RemedialWorkspace, type RemedialLoanRow } from "@/components/remedial-workspace";

export const dynamic = "force-dynamic";

type RemedialLoanWithRelations = Prisma.LoanGetPayload<{
  include: {
    branch: true;
    client: true;
    amortizationSchedules: true;
    remedialAssignment: {
      include: {
        assignedTo: { select: { id: true; name: true; email: true } };
        visits: {
          include: {
            approvedBy: { select: { name: true } };
            createdBy: { select: { name: true } };
          };
        };
      };
    };
  };
}>;

function loanPaidTotal(loan: RemedialLoanWithRelations) {
  const schedulePaid = loan.amortizationSchedules.reduce((sum, schedule) => sum + schedulePaidTotal(schedule), 0);
  return schedulePaid || numberValue(loan.paidAmount);
}

function daysBetween(start: Date, end: Date) {
  const startDay = new Date(start);
  const endDay = new Date(end);
  startDay.setHours(0, 0, 0, 0);
  endDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)));
}

function pastDueInfo(loan: RemedialLoanWithRelations) {
  const today = new Date();
  const overdueSchedule = loan.amortizationSchedules
    .filter((schedule) => schedule.amortDate && schedule.amortDate <= today && !scheduleIsPaid(schedule))
    .sort((a, b) => (a.amortDate?.getTime() ?? 0) - (b.amortDate?.getTime() ?? 0))[0];

  const pastDueDate = overdueSchedule?.amortDate ?? (loan.maturityAt && loan.maturityAt < today ? loan.maturityAt : null);

  return {
    pastDueDate: pastDueDate?.toISOString() ?? null,
    daysPastDue: pastDueDate ? daysBetween(pastDueDate, today) : 0
  };
}

function toRemedialLoanRow(loan: RemedialLoanWithRelations): RemedialLoanRow {
  const assignment = loan.remedialAssignment;
  const pastDue = pastDueInfo(loan);
  return {
    id: loan.id,
    loanNumber: loan.loanNumber,
    loanProduct: loan.loanProduct,
    remoteId: loan.remoteId,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    due: amountDueAsOfToday(loan),
    paid: loanPaidTotal(loan),
    balance: numberValue(loan.balance),
    pastDueDate: pastDue.pastDueDate,
    daysPastDue: pastDue.daysPastDue,
    sourceStatusCode: loan.sourceStatusCode,
    sourceStatusName: loan.sourceStatusName,
    branch: {
      id: loan.branch.id,
      branchName: loan.branch.branchName,
      branchCode: loan.branch.branchCode
    },
    client: {
      fullName: loan.client.fullName,
      clientId: loan.client.clientId,
      contactNumber: loan.client.contactNumber,
      address: loan.client.address
    },
    assignment: assignment
      ? {
          id: assignment.id,
          status: assignment.status,
          assignmentNotes: assignment.assignmentNotes,
          assignedTo: assignment.assignedTo,
          visits: assignment.visits.map((visit) => ({
            id: visit.id,
            scheduledDate: visit.scheduledDate.toISOString(),
            scheduleNotes: visit.scheduleNotes,
            status: visit.status,
            visitNotes: visit.visitNotes,
            negotiationNotes: visit.negotiationNotes,
            promisedAmount: visit.promisedAmount.toString(),
            paidAmount: visit.paidAmount.toString(),
            nextVisitDate: visit.nextVisitDate?.toISOString() ?? null,
            approvedByName: visit.approvedBy?.name ?? null,
            createdByName: visit.createdBy?.name ?? null
          }))
        }
      : null
  };
}

function buildPageHref(page: number, branchId: string, searchText: string, product: string) {
  const params = new URLSearchParams();
  if (branchId !== "ALL") params.set("branchId", branchId);
  if (product !== "ALL") params.set("product", product);
  if (searchText) params.set("q", searchText);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/remedial?${query}` : "/remedial";
}

export default async function RemedialPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; product?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser(REMEDIAL_ROLES);
  const params = await searchParams;
  const selectedBranchId = params?.branchId?.trim() || "ALL";
  const selectedProduct = params?.product?.trim() || "ALL";
  const searchText = params?.q?.trim() || "";
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 50;
  const accessibleBranchIds = await getAccessibleBranchIds(user);
  const branchWhere: Prisma.BranchWhereInput = accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } };
  const branches = await prisma.branch.findMany({
    where: branchWhere,
    orderBy: { branchName: "asc" },
    select: { id: true, branchName: true, branchCode: true }
  });
  const selectedBranchNumber = selectedBranchId === "ALL" ? null : Number(selectedBranchId);
  const selectedBranchAllowed =
    selectedBranchNumber === null ||
    accessibleBranchIds === null ||
    accessibleBranchIds.includes(selectedBranchNumber);
  const effectiveBranchId = selectedBranchAllowed ? selectedBranchId : "ALL";
  const branchFilter: Prisma.LoanWhereInput =
    selectedBranchNumber && selectedBranchAllowed ? { branchId: selectedBranchNumber } : {};
  const productFilter: Prisma.LoanWhereInput = selectedProduct === "ALL" ? {} : { loanProduct: selectedProduct };
  const visibilityFilter: Prisma.LoanWhereInput = await branchScopeWhere(user);
  const where: Prisma.LoanWhereInput = {
    AND: [
      pastDueLoanWhere(),
      visibilityFilter,
      branchFilter,
      productFilter,
      remedialLoanSearchWhere(searchText)
    ]
  };

  const [loans, itineraryLoans, totalLoans, officers, assignedCount, pendingApprovalCount, productOptions] = await Promise.all([
    prisma.loan.findMany({
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      where,
      orderBy: [{ client: { fullName: "asc" } }, { branch: { branchName: "asc" } }, { loanNumber: "asc" }, { updatedAt: "desc" }],
      include: {
        branch: true,
        client: true,
        amortizationSchedules: {
          orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
        },
        remedialAssignment: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            visits: {
              orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }],
              include: {
                approvedBy: { select: { name: true } },
                createdBy: { select: { name: true } }
              }
            }
          }
        }
      }
    }),
    prisma.loan.findMany({
      where: {
        AND: [
          where,
          {
            remedialAssignment: {
              visits: {
                some: { status: "APPROVED" }
              }
            }
          }
        ]
      },
      orderBy: [{ branch: { branchName: "asc" } }, { client: { fullName: "asc" } }, { loanNumber: "asc" }, { updatedAt: "desc" }],
      include: {
        branch: true,
        client: true,
        amortizationSchedules: {
          orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
        },
        remedialAssignment: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            visits: {
              orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }],
              include: {
                approvedBy: { select: { name: true } },
                createdBy: { select: { name: true } }
              }
            }
          }
        }
      }
    }),
    prisma.loan.count({ where }),
    remedialOfficerOptions(),
    prisma.remedialAssignment.count({
      where: {
        status: "ACTIVE",
        ...(user.role === "ACCOUNT_OFFICER" ? { assignedToId: user.id } : {}),
        loan: visibilityFilter
      }
    }),
    prisma.remedialVisit.count({
      where: {
        status: "PENDING_APPROVAL",
        assignment: {
          ...(user.role === "ACCOUNT_OFFICER" ? { assignedToId: user.id } : {}),
          loan: visibilityFilter
        }
      }
    }),
    prisma.loan.findMany({
      distinct: ["loanProduct"],
      where: {
        AND: [pastDueLoanWhere(), visibilityFilter, branchFilter, { loanProduct: { not: null } }]
      },
      select: { loanProduct: true },
      orderBy: { loanProduct: "asc" }
    })
  ]);
  const products = productOptions.map((option) => option.loanProduct).filter((product): product is string => typeof product === "string" && Boolean(product.trim()));

  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(totalLoans / pageSize)));
  const totalPages = Math.max(1, Math.ceil(totalLoans / pageSize));
  const firstResult = totalLoans ? (safePage - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(safePage * pageSize, totalLoans);
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === totalPages || Math.abs(page - safePage) <= 2);
  const pageLinks = visiblePages.map((page, index) => ({
    page,
    href: buildPageHref(page, effectiveBranchId, searchText, selectedProduct),
    showGap: index > 0 && page - visiblePages[index - 1] > 1
  }));
  const selectedBranch = effectiveBranchId === "ALL" ? null : branches.find((branch) => String(branch.id) === effectiveBranchId);
  const reportBranchLabel = selectedBranch
    ? `${selectedBranch.branchName} - ${selectedBranch.branchCode}`
    : "All allowed branches";
  const remedialLoans = loans.map(toRemedialLoanRow);
  const remedialItineraryLoans = itineraryLoans.map(toRemedialLoanRow);
  const totalDueToday = remedialLoans.reduce((sum, loan) => sum + loan.due, 0);
  const totalBalance = remedialLoans.reduce((sum, loan) => sum + loan.balance, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Collections and recovery</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Remedial</h2>
        <p className="mt-2 text-sm text-slate-600">
          You are in the Remedial layout. This workspace shows past-due accounts for your allowed branch access and prepares approved visit itineraries for follow-up.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric icon={AlertTriangle} label="Past-due loans" value={totalLoans.toLocaleString("en-US")} tone="red" />
        <Metric icon={ClipboardList} label="Due as of today" value={money(totalDueToday)} detail={`Total balance: ${money(totalBalance)}`} tone={totalDueToday ? "red" : "blue"} />
        <Metric icon={CalendarDays} label="Pending approvals" value={pendingApprovalCount.toLocaleString("en-US")} detail={`Visible balance: ${money(totalBalance)}`} />
      </section>

      <RemedialFilter branches={branches} products={products} selectedBranchId={effectiveBranchId} selectedProduct={selectedProduct} searchText={searchText} />

      <RemedialWorkspace
        loans={remedialLoans}
        itineraryLoans={remedialItineraryLoans}
        officers={officers}
        canAssign={canAssignRemedial(user.role)}
        canApprove={canApproveRemedial(user.role)}
        canCreateOwnSchedule={user.role === "ACCOUNT_OFFICER"}
        currentUserId={user.id}
        currentUserName={user.name}
        firstRowNumber={(safePage - 1) * pageSize + 1}
        totalLoans={totalLoans}
        safePage={safePage}
        totalPages={totalPages}
        firstResult={firstResult}
        lastResult={lastResult}
        previousHref={buildPageHref(safePage - 1, effectiveBranchId, searchText, selectedProduct)}
        nextHref={buildPageHref(safePage + 1, effectiveBranchId, searchText, selectedProduct)}
        pageLinks={pageLinks}
        reportBranchLabel={reportBranchLabel}
        reportProductLabel={selectedProduct === "ALL" ? "All products" : selectedProduct}
        reportSearchText={searchText}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "blue"
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  detail?: string;
  tone?: "blue" | "red";
}) {
  const toneClass = tone === "red" ? "text-red-700" : "text-brand-blue";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className={`mb-3 inline-flex rounded-md bg-slate-50 p-2 ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}
