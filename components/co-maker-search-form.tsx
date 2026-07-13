"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type CoMakerSuggestion = {
  name: string;
  clientRemoteId: string | null;
  validIdNumber: string | null;
  contactNumber: string | null;
};

export function CoMakerSearchForm({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<CoMakerSuggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/co-makers/suggestions?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        });
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions?: CoMakerSuggestion[] };
        setSuggestions(data.suggestions ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    window.location.href = trimmed ? `/co-makers?q=${encodeURIComponent(trimmed)}` : "/co-makers";
  }

  const showSuggestions = isFocused && query.trim().length > 0;

  return (
    <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Search co-maker</span>
        <div ref={wrapperRef} className="relative">
          <input
            name="q"
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setIsFocused(true)}
            placeholder="Type co-maker name, ID, contact number, or address."
            autoComplete="off"
          />
          {showSuggestions ? (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
              {isLoading ? <div className="px-3 py-2 text-sm text-slate-500">Searching...</div> : null}
              {!isLoading && suggestions.length ? (
                <div className="max-h-72 overflow-y-auto py-1">
                  {suggestions.map((suggestion) => {
                    const detail = suggestion.clientRemoteId || suggestion.validIdNumber || suggestion.contactNumber;
                    return (
                      <button
                        key={`${suggestion.name}-${detail ?? ""}`}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setQuery(suggestion.name);
                          window.location.href = `/co-makers?q=${encodeURIComponent(suggestion.name)}`;
                        }}
                      >
                        <span className="block font-bold text-slate-950">{suggestion.name}</span>
                        {detail ? <span className="mt-0.5 block text-xs text-slate-500">{detail}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {!isLoading && !suggestions.length ? <div className="px-3 py-2 text-sm text-slate-500">No matching co-maker yet.</div> : null}
            </div>
          ) : null}
        </div>
      </label>
      <button className="btn-primary self-end" type="submit">
        <Search className="h-4 w-4" />
        Search
      </button>
      <Link className="btn-secondary self-end" href="/co-makers">
        Clear
      </Link>
    </form>
  );
}
