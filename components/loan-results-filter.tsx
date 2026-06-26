"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type BranchOption = {
  id: number;
  branchName: string;
  branchCode: string;
};

type LoanResultsFilterProps = {
  branches: BranchOption[];
  statuses: string[];
  selectedBranchId: string;
  selectedStatus: string;
  searchText: string;
};

export function LoanResultsFilter({
  branches,
  statuses,
  selectedBranchId,
  selectedStatus,
  searchText
}: LoanResultsFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchText);
  const mounted = useRef(false);

  const buildHref = useCallback(
    (formData?: FormData, nextQuery = query) => {
      const params = new URLSearchParams(searchParams.toString());
      const branchId = String(formData?.get("branchId") ?? selectedBranchId);
      const status = String(formData?.get("status") ?? selectedStatus);
      const normalizedQuery = nextQuery.trim();

      params.delete("page");
      branchId === "ALL" ? params.delete("branchId") : params.set("branchId", branchId);
      status === "ALL" ? params.delete("status") : params.set("status", status);
      normalizedQuery ? params.set("q", normalizedQuery) : params.delete("q");

      const next = params.toString();
      return next ? `${pathname}?${next}` : pathname;
    },
    [pathname, query, searchParams, selectedBranchId, selectedStatus]
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      router.replace(buildHref(undefined, query));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [buildHref, query, router]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildHref(new FormData(event.currentTarget)));
  };

  return (
    <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Branch</span>
        <select name="branchId" className="field" defaultValue={selectedBranchId}>
          <option value="ALL">All branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.branchName} - {branch.branchCode}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Status</span>
        <select name="status" className="field" defaultValue={selectedStatus}>
          <option value="ALL">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Search client</span>
        <input
          name="q"
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type name, client no., or loan no."
        />
      </label>
      <button className="btn-primary self-end" type="submit">
        Search
      </button>
      <Link className="btn-secondary self-end" href="/loans">
        Clear
      </Link>
    </form>
  );
}
