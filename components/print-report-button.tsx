"use client";

import { Printer } from "lucide-react";

export function PrintReportButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary h-9 px-3 no-print" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
