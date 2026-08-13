"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export function AuditTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previous = useRef("");
  useEffect(() => {
    const value = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
    if (value === previous.current) return;
    previous.current = value;
    void fetch("/api/audit-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: pathname, details: `Visited ${value}` }) });
  }, [pathname, searchParams]);
  return null;
}
