"use client";

import { Printer } from "lucide-react";

export function ScopedPrintButton({
  label,
  mode
}: {
  label: string;
  mode: "summary" | "details";
}) {
  function printSection() {
    const className = mode === "summary" ? "print-summary-only" : "print-details-only";
    document.body.classList.add(className);
    window.print();
    window.setTimeout(() => document.body.classList.remove(className), 250);
  }

  return (
    <button type="button" className="btn-secondary h-9 px-3 no-print" onClick={printSection}>
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
