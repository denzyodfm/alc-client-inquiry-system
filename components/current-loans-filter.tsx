"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type BranchOption = {
  id: number;
  branchName: string;
  branchCode: string;
};

export function CurrentLoansFilter({
  branches,
  selectedBranchId,
  products,
  selectedProduct,
  searchText
}: {
  branches: BranchOption[];
  selectedBranchId: string;
  products: string[];
  selectedProduct: string;
  searchText: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchText);
  const mounted = useRef(false);

  const buildHref = useCallback(
    (formData?: FormData, nextQuery = query) => {
      const params = new URLSearchParams(searchParams.toString());
      const branchId = String(formData?.get("branchId") ?? selectedBranchId);
      const product = String(formData?.get("product") ?? selectedProduct);
      const normalizedQuery = nextQuery.trim();

      params.delete("page");
      params.delete("detailBranchId");
      branchId === "ALL" ? params.delete("branchId") : params.set("branchId", branchId);
      product === "ALL" ? params.delete("product") : params.set("product", product);
      normalizedQuery ? params.set("q", normalizedQuery) : params.delete("q");

      const next = params.toString();
      return next ? `${pathname}?${next}` : pathname;
    },
    [pathname, query, searchParams, selectedBranchId, selectedProduct]
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    if (query.trim() === searchText.trim()) return;

    const timeout = window.setTimeout(() => {
      router.replace(buildHref(undefined, query));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [buildHref, query, router, searchText]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildHref(new FormData(event.currentTarget)));
  }

  return (
    <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-[1fr_1fr_2fr_auto_auto]">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Branch</span>
        <select name="branchId" className="field" defaultValue={selectedBranchId}>
          <option value="ALL">All allowed branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.branchName} - {branch.branchCode}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Loan product</span>
        <select name="product" className="field" defaultValue={selectedProduct}>
          <option value="ALL">All products</option>
          {products.map((product) => (
            <option key={product} value={product}>
              {product}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Search current loan</span>
        <input
          name="q"
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Client, client no., or loan no."
        />
      </label>
      <button className="btn-primary self-end" type="submit">
        <Search className="h-4 w-4" />
        Search
      </button>
      <Link className="btn-secondary self-end" href="/current">
        Clear
      </Link>
    </form>
  );
}
