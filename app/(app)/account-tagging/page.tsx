import type { Prisma } from "@prisma/client";
import { AccountTaggingWorkspace, type AccountTaggingLoanRow } from "@/components/account-tagging-workspace";
import { accountTaggingHref, accountTaggingSearchWhere } from "@/lib/account-tagging";
import { canAssignRemedial, getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AccountTaggingLoan = Prisma.LoanGetPayload<{
  include: {
    branch: true;
    client: true;
    remedialAssignment: {
      include: {
        assignedTo: { select: { id: true; name: true; email: true } };
      };
    };
  };
}>;

function toAccountTaggingRow(loan: AccountTaggingLoan): AccountTaggingLoanRow {
  return {
    id: loan.id,
    clientName: loan.client.fullName,
    clientId: loan.client.clientId,
    contactNumber: loan.client.contactNumber,
    address: loan.client.address,
    branchName: loan.branch.branchName,
    branchCode: loan.branch.branchCode,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    loanProduct: loan.loanProduct,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    sourceStatusName: loan.sourceStatusName,
    sourceStatusCode: loan.sourceStatusCode,
    balance: Number(loan.balance),
    assignedOfficer: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.assignedTo.name : null
  };
}

export default async function AccountTaggingPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; product?: string; address?: string; customer?: string; page?: string }>;
}) {
  const user = await requireUser(["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const params = await searchParams;
  const requestedBranchId = params?.branchId?.trim() || "ALL";
  const selectedProduct = params?.product?.trim() || "ALL";
  const address = params?.address?.trim() || "";
  const customerName = params?.customer?.trim() || "";
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 100;
  const accessibleBranchIds = await getAccessibleBranchIds(user);
  const branchAccessFilter: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const requestedBranchNumber = requestedBranchId === "ALL" ? null : Number(requestedBranchId);
  const selectedBranchAllowed =
    requestedBranchNumber === null ||
    accessibleBranchIds === null ||
    accessibleBranchIds.includes(requestedBranchNumber);
  const selectedBranchId = selectedBranchAllowed ? requestedBranchId : "ALL";
  const hasFilters = selectedBranchId !== "ALL" || selectedProduct !== "ALL" || Boolean(address) || Boolean(customerName);
  const where: Prisma.LoanWhereInput = {
    AND: [
      branchAccessFilter,
      accountTaggingSearchWhere({
        branchId: selectedBranchId,
        product: selectedProduct,
        address,
        customerName
      })
    ]
  };

  const [totalLoans, branches, officers, productOptions] = await Promise.all([
    hasFilters ? prisma.loan.count({ where }) : Promise.resolve(0),
    prisma.branch.findMany({
      where: accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } },
      select: { id: true, branchName: true, branchCode: true },
      orderBy: { branchName: "asc" }
    }),
    prisma.user.findMany({
      where: {
        role: "ACCOUNT_OFFICER",
        isActive: true,
        ...(selectedBranchId !== "ALL"
          ? {
              OR: [
                { allBranches: true },
                { branchAccess: { some: { branchId: Number(selectedBranchId) } } }
              ]
            }
          : {})
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true }
    }),
    prisma.loan.findMany({
      distinct: ["loanProduct"],
      where: {
        AND: [
          branchAccessFilter,
          { loanProduct: { not: null } }
        ]
      },
      select: { loanProduct: true },
      orderBy: { loanProduct: "asc" }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalLoans / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const loans = hasFilters
    ? await prisma.loan.findMany({
        skip: (safePage - 1) * pageSize,
        take: pageSize,
        where,
        orderBy: [
          { client: { fullName: "asc" } },
          { branch: { branchName: "asc" } },
          { loanNumber: "asc" }
        ],
        include: {
          branch: true,
          client: true,
          remedialAssignment: {
            include: {
              assignedTo: { select: { id: true, name: true, email: true } }
            }
          }
        }
      })
    : [];
  const firstResult = totalLoans ? (safePage - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(safePage * pageSize, totalLoans);
  const pageHref = (page: number) => accountTaggingHref({ page, branchId: selectedBranchId, product: selectedProduct, address, customerName });
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === totalPages || Math.abs(page - safePage) <= 2);
  const pageLinks = visiblePages.map((page, index) => ({
    page,
    href: pageHref(page),
    showGap: index > 0 && page - visiblePages[index - 1] > 1
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Portfolio assignment</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Account Tagging</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Search outstanding loans by address and customer name, then assign matching accounts to an Account Officer.
        </p>
      </div>

      <AccountTaggingWorkspace
        branches={branches}
        officers={officers}
        products={productOptions.map((option) => option.loanProduct).filter((product): product is string => typeof product === "string" && Boolean(product.trim()))}
        loans={loans.map(toAccountTaggingRow)}
        selectedBranchId={selectedBranchId}
        selectedProduct={selectedProduct}
        address={address}
        customerName={customerName}
        totalLoans={totalLoans}
        safePage={safePage}
        totalPages={totalPages}
        firstResult={firstResult}
        lastResult={lastResult}
        firstHref={pageHref(1)}
        previousHref={pageHref(safePage - 1)}
        nextHref={pageHref(safePage + 1)}
        lastHref={pageHref(totalPages)}
        pageLinks={pageLinks}
        canAssign={canAssignRemedial(user.role)}
        reportDate={new Date().toISOString()}
      />
    </div>
  );
}
