import { ClipboardCheck } from "lucide-react";
import { requireFunction } from "@/lib/auth";
import { isVerificationSortKey, verificationBranchProgress, verificationLoanRows } from "@/lib/loan-verification";
import { VerifyLoansWorkspace } from "@/components/verify-loans-workspace";

export const dynamic = "force-dynamic";

export default async function VerifyLoansPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; q?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const user = await requireFunction("VERIFY_LOANS");
  const params = await searchParams;
  const requestedBranchId = Number(params?.branchId);
  const search = params?.q?.trim() ?? "";
  const page = Math.max(1, Number(params?.page) || 1);
  const sort = params?.sort && isVerificationSortKey(params.sort) ? params.sort : "clientName";
  const dir = params?.dir === "desc" ? "desc" : "asc";

  const summary = await verificationBranchProgress(user);
  // Only offer a branch the reader can actually see, so a hand-edited URL cannot list
  // another branch's loans.
  const selectedBranchId = summary.branches.some((branch) => branch.branchId === requestedBranchId)
    ? requestedBranchId
    : null;

  const list = selectedBranchId
    ? await verificationLoanRows({ user, verified: false, branchId: selectedBranchId, search, page, sort, dir })
    : { rows: [], matching: 0, page: 1, totalPages: 1, pageSize: 100, startIndex: 0, sort, dir };

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-green">
          <ClipboardCheck className="h-4 w-4" />Taggings
        </p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Verify Loans</h2>
        <p className="mt-1 text-sm text-slate-600">
          Outstanding loans awaiting a bookkeeper&apos;s check, summarized by branch. Open a branch card to list its
          loans, then tick Loan Verified to record the check and move the loan to Verified Loans.
        </p>
      </div>

      <VerifyLoansWorkspace
        branches={summary.branches}
        totals={summary.totals}
        rows={list.rows}
        selectedBranchId={selectedBranchId}
        search={search}
        page={list.page}
        totalPages={list.totalPages}
        matching={list.matching}
        startIndex={list.startIndex}
        sort={sort}
        dir={dir}
      />
    </div>
  );
}
