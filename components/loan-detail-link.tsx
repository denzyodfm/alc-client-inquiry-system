"use client";

import { useState } from "react";
import { LoanDetailWindow, type LoanDetailLoan } from "@/components/loan-detail-window";

export function LoanDetailLink({
  loan,
  label,
  className = "font-bold text-brand-blue hover:underline"
}: {
  loan: LoanDetailLoan;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const text = label ?? loan.loanNumber ?? loan.remoteId ?? String(loan.id);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {text}
      </button>
      {open ? <LoanDetailWindow loan={loan} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
