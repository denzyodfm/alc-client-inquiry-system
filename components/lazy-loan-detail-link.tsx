"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { LoanDetailWindow, type LoanDetailLoan } from "@/components/loan-detail-window";

// Same window as LoanDetailLink, but the loan is fetched when it is opened rather than
// shipped with every row. Use this on long lists; use LoanDetailLink where the page already
// has the payload in hand.
export function LazyLoanDetailLink({
  loanId,
  label,
  className = "font-bold text-brand-blue hover:underline"
}: {
  loanId: number;
  label: string;
  className?: string;
}) {
  const [loan, setLoan] = useState<LoanDetailLoan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(event: React.MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    if (loan) return setLoan(loan);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/loan-detail/${loanId}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Unable to load this loan.");
      setLoan(data.loan as LoanDetailLoan);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load this loan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={(event) => void open(event)} disabled={loading}>
        {label}
        {loading ? <LoaderCircle className="ml-1 inline h-3 w-3 animate-spin" /> : null}
      </button>
      {error ? <span className="block text-[10px] font-semibold text-red-700">{error}</span> : null}
      {loan ? <LoanDetailWindow loan={loan} onClose={() => setLoan(null)} /> : null}
    </>
  );
}
